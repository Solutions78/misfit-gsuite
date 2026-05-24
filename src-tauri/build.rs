use std::{collections::HashMap, fs, path::Path};

const EMBEDDED_RUNTIME_KEYS: &[&str] = &[
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "PROXY_BASE_URL",
    "PROXY_APP_TOKEN",
];

fn parse_env_file(path: &Path) -> HashMap<String, String> {
    let mut values = HashMap::new();
    let Ok(contents) = fs::read_to_string(path) else {
        return values;
    };

    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        let key = key.trim();
        if key.is_empty() {
            continue;
        }

        let value = value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        values.insert(key.to_string(), value);
    }

    values
}

fn main() {
    let repo_env = parse_env_file(Path::new("../.env"));
    let local_env = parse_env_file(Path::new(".env"));

    println!("cargo:rerun-if-changed=../.env");
    println!("cargo:rerun-if-changed=.env");

    for key in EMBEDDED_RUNTIME_KEYS {
        println!("cargo:rerun-if-env-changed={key}");

        let value = std::env::var(key)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| local_env.get(*key).cloned())
            .or_else(|| repo_env.get(*key).cloned());

        if let Some(value) = value {
            println!("cargo:rustc-env={key}={value}");
        }
    }

    tauri_build::build()
}
