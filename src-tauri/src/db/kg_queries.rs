use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

// ── Structs ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgNode {
    pub file_id: String,
    pub name: String,
    pub mime_type: String,
    pub modified_time: Option<String>,
    pub web_view_link: Option<String>,
    pub parents_json: String,
    pub drive_id: Option<String>,
    pub shared: bool,
    pub owners_json: String,
    pub last_modifying_user: Option<String>,
    pub crawled_at: i64,
    pub enrich_status: String,
    pub enrich_error: Option<String>,
    pub enriched_at: Option<i64>,
    pub topic_tags_json: Option<String>,
    pub importance_score: Option<i32>,
    pub summary: Option<String>,
    pub entities_json: Option<String>,
    pub relationships_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichmentResult {
    pub topic_tags: Vec<String>,
    pub importance_score: i32,
    pub summary: String,
    pub entities: Vec<KgEntity>,
    pub relationships: Vec<KgRelationship>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgEntity {
    pub name: String,
    pub entity_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgRelationship {
    pub target_file_id: Option<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgCrawlState {
    pub changes_page_token: Option<String>,
    pub last_crawl_at: Option<i64>,
    pub last_delta_at: Option<i64>,
    pub crawl_status: String,
    pub total_files: i64,
    pub crawled_files: i64,
    pub enriched_files: i64,
    pub active_page_token: Option<String>,
    pub active_drive_id: Option<String>,
    pub last_activity_at: Option<i64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgNodeView {
    pub file_id: String,
    pub name: String,
    pub mime_type: String,
    pub web_view_link: Option<String>,
    pub drive_id: Option<String>,
    pub topic_tags: Vec<String>,
    pub importance_score: Option<i32>,
    pub summary: Option<String>,
    pub entities: Vec<KgEntity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgEdgeView {
    pub source_id: String,
    pub target_id: String,
    pub edge_type: String,
    pub weight: f64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgGraphPayload {
    pub nodes: Vec<KgNodeView>,
    pub edges: Vec<KgEdgeView>,
}

// ── Node operations ───────────────────────────────────────────────────────

pub fn upsert_kg_node(conn: &Connection, node: &KgNode) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO kg_nodes (
            file_id, name, mime_type, modified_time, web_view_link,
            parents_json, drive_id, shared, owners_json, last_modifying_user,
            crawled_at, enrich_status
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'pending')
        ON CONFLICT(file_id) DO UPDATE SET
            name = excluded.name,
            mime_type = excluded.mime_type,
            modified_time = excluded.modified_time,
            web_view_link = excluded.web_view_link,
            parents_json = excluded.parents_json,
            drive_id = excluded.drive_id,
            shared = excluded.shared,
            owners_json = excluded.owners_json,
            last_modifying_user = excluded.last_modifying_user,
            crawled_at = excluded.crawled_at,
            enrich_status = CASE
                WHEN kg_nodes.modified_time != excluded.modified_time THEN 'pending'
                ELSE kg_nodes.enrich_status
            END",
        params![
            node.file_id,
            node.name,
            node.mime_type,
            node.modified_time,
            node.web_view_link,
            node.parents_json,
            node.drive_id,
            node.shared as i64,
            node.owners_json,
            node.last_modifying_user,
            node.crawled_at,
        ],
    )?;
    Ok(())
}

pub fn get_kg_node(conn: &Connection, file_id: &str) -> Result<Option<KgNode>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT file_id, name, mime_type, modified_time, web_view_link,
                parents_json, drive_id, shared, owners_json, last_modifying_user,
                crawled_at, enrich_status, enrich_error, enriched_at,
                topic_tags_json, importance_score, summary, entities_json, relationships_json
         FROM kg_nodes WHERE file_id = ?1",
    )?;
    let mut rows = stmt.query_map(params![file_id], map_kg_node)?;
    Ok(rows.next().transpose()?)
}

pub fn list_nodes_pending_enrichment(
    conn: &Connection,
    limit: usize,
) -> Result<Vec<KgNode>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT file_id, name, mime_type, modified_time, web_view_link,
                parents_json, drive_id, shared, owners_json, last_modifying_user,
                crawled_at, enrich_status, enrich_error, enriched_at,
                topic_tags_json, importance_score, summary, entities_json, relationships_json
         FROM kg_nodes
         WHERE enrich_status = 'pending'
           AND mime_type IN (
               'application/vnd.google-apps.document',
               'application/vnd.google-apps.spreadsheet',
               'application/vnd.google-apps.presentation'
           )
         ORDER BY crawled_at ASC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_kg_node)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn mark_enrichment_processing(conn: &Connection, file_ids: &[String]) -> Result<(), AppError> {
    for id in file_ids {
        conn.execute(
            "UPDATE kg_nodes SET enrich_status = 'processing' WHERE file_id = ?1",
            params![id],
        )?;
    }
    Ok(())
}

pub fn cleanup_stuck_nodes(conn: &Connection) -> Result<i64, AppError> {
    let rows = conn.execute(
        "UPDATE kg_nodes SET enrich_status = 'pending' WHERE enrich_status = 'processing'",
        [],
    )?;
    Ok(rows as i64)
}

pub fn upsert_enrichment(
    conn: &Connection,
    file_id: &str,
    result: &EnrichmentResult,
) -> Result<(), AppError> {
    let tags_json = serde_json::to_string(&result.topic_tags).unwrap_or_default();
    let entities_json = serde_json::to_string(&result.entities).unwrap_or_default();
    let rels_json = serde_json::to_string(&result.relationships).unwrap_or_default();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    conn.execute(
        "UPDATE kg_nodes SET
            enrich_status = 'done',
            enriched_at = ?1,
            topic_tags_json = ?2,
            importance_score = ?3,
            summary = ?4,
            entities_json = ?5,
            relationships_json = ?6,
            enrich_error = NULL
         WHERE file_id = ?7",
        params![
            now,
            tags_json,
            result.importance_score,
            result.summary,
            entities_json,
            rels_json,
            file_id,
        ],
    )?;
    Ok(())
}

pub fn mark_enrichment_failed(
    conn: &Connection,
    file_id: &str,
    error: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE kg_nodes SET enrich_status = 'failed', enrich_error = ?1 WHERE file_id = ?2",
        params![error, file_id],
    )?;
    Ok(())
}

pub fn mark_enrichment_done_no_content(conn: &Connection, file_id: &str) -> Result<(), AppError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    conn.execute(
        "UPDATE kg_nodes SET enrich_status = 'done', enriched_at = ?1, importance_score = 1 WHERE file_id = ?2",
        params![now, file_id],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_kg_node(conn: &Connection, file_id: &str) -> Result<(), AppError> {
    delete_kg_edges_for_node(conn, file_id)?;
    conn.execute("DELETE FROM kg_nodes WHERE file_id = ?1", params![file_id])?;
    Ok(())
}

// ── Edge operations ───────────────────────────────────────────────────────

pub fn insert_kg_edge(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
    edge_type: &str,
    weight: f64,
    label: Option<&str>,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO kg_edges (source_id, target_id, edge_type, weight, label)
         SELECT ?1, ?2, ?3, ?4, ?5
         WHERE EXISTS (SELECT 1 FROM kg_nodes WHERE file_id = ?1)
           AND EXISTS (SELECT 1 FROM kg_nodes WHERE file_id = ?2)",
        params![source_id, target_id, edge_type, weight, label],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_kg_edges_for_node(conn: &Connection, file_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM kg_edges WHERE source_id = ?1 OR target_id = ?1",
        params![file_id],
    )?;
    Ok(())
}

// ── Graph payload ─────────────────────────────────────────────────────────

pub fn get_kg_graph(conn: &Connection) -> Result<KgGraphPayload, AppError> {
    // 1. Fetch the top 2000 nodes based on importance score.
    // We materialism this into a Vec first.
    let mut stmt = conn.prepare(
        "SELECT file_id, name, mime_type, web_view_link, drive_id,
                topic_tags_json, importance_score, summary, entities_json
         FROM kg_nodes
         WHERE enrich_status IN ('done', 'pending', 'failed')
         ORDER BY COALESCE(importance_score, 1) DESC, crawled_at DESC
         LIMIT 2000",
    )?;

    let nodes = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<i32>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .map(
            |(
                file_id,
                name,
                mime_type,
                web_view_link,
                drive_id,
                tags_json,
                score,
                summary,
                ents_json,
            )| {
                let topic_tags: Vec<String> = tags_json
                    .and_then(|j| serde_json::from_str(&j).ok())
                    .unwrap_or_default();
                let entities: Vec<KgEntity> = ents_json
                    .and_then(|j| serde_json::from_str(&j).ok())
                    .unwrap_or_default();
                KgNodeView {
                    file_id,
                    name,
                    mime_type,
                    web_view_link,
                    drive_id,
                    topic_tags,
                    importance_score: score,
                    summary,
                    entities,
                }
            },
        )
        .collect::<Vec<_>>();

    // 2. Fetch only edges that connect these 2000 nodes.
    // Optimization: Use a CTE (Common Table Expression) to ensure SQLite only scans relevant rows once.
    let mut estmt = conn.prepare(
        "WITH visible_nodes AS (
             SELECT file_id FROM kg_nodes 
             WHERE enrich_status IN ('done', 'pending', 'failed') 
             ORDER BY COALESCE(importance_score, 1) DESC, crawled_at DESC LIMIT 2000
         )
         SELECT e.source_id, e.target_id, e.edge_type, e.weight, e.label 
         FROM kg_edges e
         JOIN visible_nodes s ON e.source_id = s.file_id
         JOIN visible_nodes t ON e.target_id = t.file_id",
    )?;

    let edges = estmt
        .query_map([], |row| {
            Ok(KgEdgeView {
                source_id: row.get(0)?,
                target_id: row.get(1)?,
                edge_type: row.get(2)?,
                weight: row.get(3)?,
                label: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    Ok(KgGraphPayload { nodes, edges })
}

// ── Crawl state ───────────────────────────────────────────────────────────

pub fn get_crawl_state(conn: &Connection) -> Result<KgCrawlState, AppError> {
    let mut stmt = conn.prepare(
        "SELECT changes_page_token, last_crawl_at, last_delta_at,
                crawl_status, total_files, crawled_files, enriched_files,
                active_page_token, active_drive_id, last_activity_at, error_message
         FROM kg_crawl_state WHERE id = 1",
    )?;
    let state = stmt.query_row([], |row| {
        Ok(KgCrawlState {
            changes_page_token: row.get(0)?,
            last_crawl_at: row.get(1)?,
            last_delta_at: row.get(2)?,
            crawl_status: row.get(3)?,
            total_files: row.get(4)?,
            crawled_files: row.get(5)?,
            enriched_files: row.get(6)?,
            active_page_token: row.get(7)?,
            active_drive_id: row.get(8)?,
            last_activity_at: row.get(9)?,
            error_message: row.get(10)?,
        })
    })?;
    Ok(state)
}

pub fn update_crawl_state(conn: &Connection, state: &KgCrawlState) -> Result<(), AppError> {
    conn.execute(
        "UPDATE kg_crawl_state SET
            changes_page_token = ?1,
            last_crawl_at = ?2,
            last_delta_at = ?3,
            crawl_status = ?4,
            total_files = ?5,
            crawled_files = ?6,
            enriched_files = ?7,
            active_page_token = ?8,
            active_drive_id = ?9,
            last_activity_at = ?10,
            error_message = ?11
         WHERE id = 1",
        params![
            state.changes_page_token,
            state.last_crawl_at,
            state.last_delta_at,
            state.crawl_status,
            state.total_files,
            state.crawled_files,
            state.enriched_files,
            state.active_page_token,
            state.active_drive_id,
            state.last_activity_at,
            state.error_message,
        ],
    )?;
    Ok(())
}

pub fn get_pending_enrichment_count(conn: &Connection) -> Result<i64, AppError> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM kg_nodes WHERE enrich_status = 'pending'",
        [],
        |row| row.get(0),
    )?)
}

pub fn get_done_enrichment_count(conn: &Connection) -> Result<i64, AppError> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM kg_nodes WHERE enrich_status = 'done'",
        [],
        |row| row.get(0),
    )?)
}

// ── Private helpers ───────────────────────────────────────────────────────

fn map_kg_node(row: &rusqlite::Row<'_>) -> rusqlite::Result<KgNode> {
    Ok(KgNode {
        file_id: row.get(0)?,
        name: row.get(1)?,
        mime_type: row.get(2)?,
        modified_time: row.get(3)?,
        web_view_link: row.get(4)?,
        parents_json: row.get(5)?,
        drive_id: row.get(6)?,
        shared: row.get::<_, i64>(7)? != 0,
        owners_json: row.get(8)?,
        last_modifying_user: row.get(9)?,
        crawled_at: row.get(10)?,
        enrich_status: row.get(11)?,
        enrich_error: row.get(12)?,
        enriched_at: row.get(13)?,
        topic_tags_json: row.get(14)?,
        importance_score: row.get(15)?,
        summary: row.get(16)?,
        entities_json: row.get(17)?,
        relationships_json: row.get(18)?,
    })
}
