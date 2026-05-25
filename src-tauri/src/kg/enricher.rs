use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

use crate::api::{client::ApiClient, gemini, gemini_tools};
use crate::db::kg_queries::{self, EnrichmentResult, KgEntity, KgNode, KgRelationship};
use crate::error::AppError;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub async fn run_enrichment_batch(
    api: &ApiClient,
    db: &Mutex<rusqlite::Connection>,
    app: &AppHandle,
) -> Result<(), AppError> {
    // Pick the Gemini model once up-front; fall back gracefully.
    let model = gemini::pick_default_model(api)
        .await
        .unwrap_or_else(|_| "gemini-2.0-flash-latest".to_string());

    loop {
        // ── 1. Get a batch of pending nodes ───────────────────────────────
        let batch = {
            let conn = db.lock().await;
            kg_queries::list_nodes_pending_enrichment(&conn, 10)?
        };

        // ── 2. Empty batch → done ─────────────────────────────────────────
        if batch.is_empty() {
            break;
        }

        // ── 3. Mark all batch file_ids as 'processing' ────────────────────
        {
            let ids: Vec<String> = batch.iter().map(|n| n.file_id.clone()).collect();
            let conn = db.lock().await;
            kg_queries::mark_enrichment_processing(&conn, &ids)?;
        }

        // ── 4. Process each file sequentially ────────────────────────────
        for node in &batch {
            let result = enrich_file(api, &model, node).await;

            match result {
                // Non-enrichable (folder / image / shortcut / etc.)
                EnrichOutcome::NoContent => {
                    let conn = db.lock().await;
                    let _ = kg_queries::mark_enrichment_done_no_content(&conn, &node.file_id);
                }

                // Enriched successfully
                EnrichOutcome::Done(enrichment) => {
                    let conn = db.lock().await;
                    if let Err(e) =
                        kg_queries::upsert_enrichment(&conn, &node.file_id, &enrichment)
                    {
                        tracing::warn!("kg enricher: upsert_enrichment failed for {}: {}", node.file_id, e);
                    }

                    // Build entity nodes + edges
                    let now = now_secs();
                    for entity in &enrichment.entities {
                        let entity_node_id =
                            format!("entity::{}::{}", entity.entity_type, entity.name);

                        let entity_kg_node = KgNode {
                            file_id: entity_node_id.clone(),
                            name: entity.name.clone(),
                            mime_type: format!("entity/{}", entity.entity_type),
                            modified_time: None,
                            web_view_link: None,
                            parents_json: "[]".to_string(),
                            drive_id: None,
                            shared: false,
                            owners_json: "[]".to_string(),
                            last_modifying_user: None,
                            crawled_at: now,
                            enrich_status: "done".to_string(),
                            enrich_error: None,
                            enriched_at: Some(now),
                            topic_tags_json: None,
                            importance_score: Some(5),
                            summary: None,
                            entities_json: None,
                            relationships_json: None,
                        };

                        let _ = kg_queries::upsert_kg_node(&conn, &entity_kg_node);
                        let _ = kg_queries::insert_kg_edge(
                            &conn,
                            &node.file_id,
                            &entity_node_id,
                            "entity_link",
                            1.0,
                            Some(entity.entity_type.as_str()),
                        );
                    }

                    // Build reference edges
                    for rel in &enrichment.relationships {
                        if let Some(ref target_id) = rel.target_file_id {
                            let _ = kg_queries::insert_kg_edge(
                                &conn,
                                &node.file_id,
                                target_id,
                                "gemini_reference",
                                1.0,
                                Some(rel.description.as_str()),
                            );
                        }
                    }
                }

                // Error
                EnrichOutcome::Failed(err_msg) => {
                    let conn = db.lock().await;
                    let _ =
                        kg_queries::mark_enrichment_failed(&conn, &node.file_id, &err_msg);
                }
            }

            // Rate-limit: 1 second between files (60 RPM)
            sleep(Duration::from_secs(1)).await;
        }

        // ── 5 & 6. Update enriched_files count and emit progress ──────────
        {
            let conn = db.lock().await;
            let done_count = kg_queries::get_done_enrichment_count(&conn).unwrap_or(0);
            let mut state = kg_queries::get_crawl_state(&conn)?;
            state.enriched_files = done_count;
            kg_queries::update_crawl_state(&conn, &state)?;

            let _ = app.emit("kg::enrich_progress", done_count);
        }

        // ── 7. Sleep between batches ──────────────────────────────────────
        sleep(Duration::from_secs(2)).await;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Per-file enrichment
// ---------------------------------------------------------------------------

enum EnrichOutcome {
    NoContent,
    Done(EnrichmentResult),
    Failed(String),
}

async fn enrich_file(api: &ApiClient, model: &str, node: &KgNode) -> EnrichOutcome {
    // Determine if file is enrichable by mime_type
    let fetch_result: Result<String, AppError> = match node.mime_type.as_str() {
        "application/vnd.google-apps.document" => {
            gemini_tools::fetch_doc_text(api, &node.file_id).await
        }
        "application/vnd.google-apps.spreadsheet" => {
            gemini_tools::fetch_sheet_text(api, &node.file_id).await
        }
        "application/vnd.google-apps.presentation" => {
            gemini_tools::fetch_slides_text(api, &node.file_id).await
        }
        _ => return EnrichOutcome::NoContent,
    };

    let content = match fetch_result {
        Ok(text) => text,
        Err(e) => return EnrichOutcome::Failed(e.to_string()),
    };

    // Call Gemini
    match call_gemini_enrichment(api, model, &node.name, &node.mime_type, &content).await {
        Ok(enrichment) => EnrichOutcome::Done(enrichment),
        Err(e) => EnrichOutcome::Failed(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Gemini HTTP call
// ---------------------------------------------------------------------------

async fn call_gemini_enrichment(
    api: &ApiClient,
    model: &str,
    name: &str,
    mime_type: &str,
    content: &str,
) -> Result<EnrichmentResult, AppError> {
    let url = gemini::generate_content_url(model);

    let prompt = format!(
        r#"Analyze this document and return a JSON object with exactly these keys:
- "tags": array of 3-7 semantic topic strings (e.g. "Q4 Planning", "Legal", "HR")
- "score": integer 1-10 (10=critical business document, 1=trivial or reference file)
- "summary": one sentence max 120 characters describing what this document is about
- "entities": array of objects with "name" (string) and "type" ("person"|"project"|"client"|"product")
- "refs": array of objects with "fileId" (string or null) and "description" (string) for documents this file references

Document name: {name}
Document type: {mime_type}
Content:
{content}"#,
        name = name,
        mime_type = mime_type,
        content = content
    );

    let body = serde_json::json!({
        "system_instruction": {
            "role": "system",
            "parts": [{"text": "You are a knowledge graph enrichment engine. Return ONLY valid JSON with no markdown formatting, no code fences, no explanation."}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}]
            }
        ]
    });

    let token = api.access_token().await?;

    let resp = api
        .http
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api { status, message: text });
    }

    let resp_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    // Extract text from Gemini response
    let raw_text = resp_json
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("Gemini enrichment returned no text".to_string()))?;

    let parsed = extract_json(raw_text);
    if parsed.is_null() {
        return Err(AppError::Other(format!(
            "Gemini enrichment returned unparseable JSON: {}",
            raw_text
        )));
    }

    Ok(parse_enrichment(&parsed, name))
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

fn extract_json(raw: &str) -> serde_json::Value {
    let cleaned = if let Some(start) = raw.find('{') {
        if let Some(end) = raw.rfind('}') {
            &raw[start..=end]
        } else {
            raw
        }
    } else {
        raw
    };
    serde_json::from_str(cleaned).unwrap_or(serde_json::Value::Null)
}

fn parse_enrichment(val: &serde_json::Value, file_name: &str) -> EnrichmentResult {
    let tags: Vec<String> = val["tags"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let score = val["score"].as_i64().unwrap_or(3) as i32;
    let score = score.clamp(1, 10);

    let summary = val["summary"]
        .as_str()
        .unwrap_or(file_name)
        .chars()
        .take(120)
        .collect::<String>();

    let entities: Vec<KgEntity> = val["entities"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let name = e["name"].as_str()?.to_string();
                    let entity_type = e["type"].as_str().unwrap_or("unknown").to_string();
                    Some(KgEntity { name, entity_type })
                })
                .collect()
        })
        .unwrap_or_default();

    let relationships: Vec<KgRelationship> = val["refs"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    let description = r["description"].as_str()?.to_string();
                    let target_file_id = r["fileId"].as_str().map(String::from);
                    Some(KgRelationship { target_file_id, description })
                })
                .collect()
        })
        .unwrap_or_default();

    EnrichmentResult { topic_tags: tags, importance_score: score, summary, entities, relationships }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
