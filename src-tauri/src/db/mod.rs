pub mod kg_queries;
pub mod queries;
pub mod schema;

use crate::error::AppError;
use rusqlite::Connection;

pub fn initialize(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(schema::SCHEMA)?;
    run_migrations(conn)?;
    Ok(())
}

/// Apply sequential schema migrations. Each migration is recorded in
/// schema_migrations so it only runs once per database file.
fn run_migrations(conn: &Connection) -> Result<(), AppError> {
    let migrations: &[(&str, &str)] = &[
        (
            "001_add_date_header",
            "ALTER TABLE messages ADD COLUMN date_header TEXT",
        ),
        (
            "002_add_kg_tables",
            "SELECT 1", // kg_nodes, kg_edges, kg_crawl_state created via SCHEMA constant
        ),
        (
            "003_add_kg_checkpointing",
            "ALTER TABLE kg_crawl_state ADD COLUMN active_page_token TEXT;
             ALTER TABLE kg_crawl_state ADD COLUMN active_drive_id TEXT;
             ALTER TABLE kg_crawl_state ADD COLUMN last_activity_at INTEGER;",
        ),
        (
            "004_add_kg_error_message",
            "ALTER TABLE kg_crawl_state ADD COLUMN error_message TEXT",
        ),
        (
            "005_add_chat_display_name_cache",
            "SELECT 1", // chat_space_display_names created via SCHEMA constant
        ),
    ];

    for (name, sql) in migrations {
        // Skip if already applied
        let already_applied: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE name = ?1",
                rusqlite::params![name],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if already_applied {
            continue;
        }

        // Check whether the column already exists in the table (handles pre-existing
        // databases that were created with the column in the CREATE TABLE statement).
        let column_exists = if sql.to_uppercase().contains("ADD COLUMN") {
            // Parse the table name and column name from the ALTER TABLE statement
            let parts: Vec<&str> = sql.split_whitespace().collect();
            // ALTER TABLE <table> ADD COLUMN <col> <type>
            if parts.len() >= 5 {
                let table = parts[2];
                let col = parts[5];
                let count: i64 = conn
                    .query_row(
                        &format!(
                            "SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = ?1",
                            table
                        ),
                        rusqlite::params![col],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);
                count > 0
            } else {
                false
            }
        } else {
            false
        };

        if !column_exists {
            // Ignore "duplicate column" errors — column may exist from initial schema
            match conn.execute_batch(sql) {
                Ok(_) => {}
                Err(rusqlite::Error::SqliteFailure(ref e, _)) if e.extended_code == 1 => {
                    // error code 1 = SQLITE_ERROR which includes "duplicate column name"
                    // Treat as non-fatal
                }
                Err(e) => return Err(AppError::Database(e)),
            }
        }

        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (name) VALUES (?1)",
            rusqlite::params![name],
        )?;
    }

    Ok(())
}
