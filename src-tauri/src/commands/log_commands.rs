#[tauri::command]
pub fn get_log_file_path() -> Result<String, String> {
    Ok(crate::logging::path().display().to_string())
}

#[tauri::command]
pub fn read_recent_logs(max_lines: Option<usize>) -> Result<String, String> {
    crate::logging::read_recent_lines(max_lines.unwrap_or(400).clamp(1, 5_000))
}

#[tauri::command]
pub fn clear_logs() -> Result<(), String> {
    crate::logging::clear()?;
    crate::logging::info("logs", "log file cleared");
    Ok(())
}

#[tauri::command]
pub fn write_frontend_log(level: String, target: String, message: String) -> Result<(), String> {
    crate::logging::frontend(&level, &target, &message);
    Ok(())
}
