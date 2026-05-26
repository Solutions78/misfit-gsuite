use chrono::Utc;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn default_log_path() -> PathBuf {
    dirs_next::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.modularmisfits.gsuite")
        .join("misfit-gsuite.log")
}

pub fn init() -> PathBuf {
    let path = LOG_PATH.get_or_init(default_log_path).clone();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    info("app", format!("logger initialized path={}", path.display()));
    path
}

pub fn path() -> PathBuf {
    LOG_PATH.get_or_init(default_log_path).clone()
}

pub fn info(target: &str, message: impl AsRef<str>) {
    write("INFO", target, message.as_ref());
}

pub fn warn(target: &str, message: impl AsRef<str>) {
    write("WARN", target, message.as_ref());
}

pub fn error(target: &str, message: impl AsRef<str>) {
    write("ERROR", target, message.as_ref());
}

pub fn frontend(level: &str, target: &str, message: &str) {
    let level = match level.to_ascii_uppercase().as_str() {
        "ERROR" => "FRONTEND_ERROR",
        "WARN" | "WARNING" => "FRONTEND_WARN",
        _ => "FRONTEND",
    };
    write(level, target, message);
}

pub fn read_recent_lines(max_lines: usize) -> Result<String, String> {
    let path = path();
    let mut file = OpenOptions::new()
        .read(true)
        .open(&path)
        .map_err(|e| format!("Failed to open log file {}: {}", path.display(), e))?;
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| format!("Failed to read log file {}: {}", path.display(), e))?;

    let lines = content.lines().collect::<Vec<_>>();
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].join("\n"))
}

pub fn clear() -> Result<(), String> {
    let path = path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create log dir {}: {}", parent.display(), e))?;
    }
    fs::write(&path, "").map_err(|e| format!("Failed to clear log file {}: {}", path.display(), e))
}

fn write(level: &str, target: &str, message: &str) {
    let path = path();
    let sanitized = sanitize(message);
    let line = format!(
        "{} [{}] [{}] {}\n",
        Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        level,
        target,
        sanitized
    );

    let Ok(_guard) = WRITE_LOCK.lock() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn sanitize(input: &str) -> String {
    let mut output = input.to_string();
    for key in [
        "access_token",
        "refresh_token",
        "client_secret",
        "clientSecret",
        "api_key",
        "apiKey",
        "password",
        "authorization",
    ] {
        output = output.replace(key, "[redacted-key]");
    }
    if output.len() > 8_000 {
        output.truncate(8_000);
        output.push_str("… [truncated]");
    }
    output
}
