pub mod queries;
pub mod schema;

use rusqlite::Connection;
use crate::error::AppError;

pub fn initialize(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(schema::SCHEMA)?;
    Ok(())
}
