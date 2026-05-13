use keyring::Entry;
use crate::auth::TokenSet;
use crate::error::AppError;

const SERVICE_NAME: &str = "com.modularmisfits.gsuite";

pub fn store_token(token: &TokenSet) -> Result<(), AppError> {
    let key = format!("{}/tokens", token.email);
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
    let json = serde_json::to_string(token)?;
    entry
        .set_password(&json)
        .map_err(|e| AppError::Auth(format!("Keychain write error: {}", e)))?;
    Ok(())
}

pub fn load_token(email: &str) -> Result<Option<TokenSet>, AppError> {
    let key = format!("{}/tokens", email);
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
    match entry.get_password() {
        Ok(json) => {
            let token: TokenSet = serde_json::from_str(&json)?;
            Ok(Some(token))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Auth(format!("Keychain read error: {}", e))),
    }
}

pub fn delete_token(email: &str) -> Result<(), AppError> {
    let key = format!("{}/tokens", email);
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
    entry
        .delete_password()
        .map_err(|e| AppError::Auth(format!("Keychain delete error: {}", e)))?;
    Ok(())
}

pub fn list_account_emails() -> Vec<String> {
    // In practice, we track known accounts via the store plugin.
    // This is a placeholder — account list is managed by AppState.
    vec![]
}
