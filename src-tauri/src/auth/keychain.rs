use crate::auth::TokenSet;
use crate::error::AppError;

const SERVICE_NAME: &str = "com.modularmisfits.gsuite";

pub fn store_token(token: &TokenSet) -> Result<(), AppError> {
    platform::store_token(token)
}

pub fn load_token(email: &str) -> Result<Option<TokenSet>, AppError> {
    platform::load_token(email)
}

pub fn delete_token(email: &str) -> Result<(), AppError> {
    platform::delete_token(email)
}

#[allow(dead_code)]
pub fn list_account_emails() -> Vec<String> {
    // In practice, we track known accounts via the local accounts table.
    vec![]
}

fn token_key(email: &str) -> String {
    format!("{}/tokens", email)
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{token_key, SERVICE_NAME};
    use crate::auth::TokenSet;
    use crate::error::AppError;
    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };
    use security_framework_sys::base::errSecItemNotFound;

    // USER_PRESENCE (Touch ID / biometric) requires the app to be code-signed
    // with the com.apple.application-identifier entitlement. In dev builds the
    // binary is unsigned, so we fall back to plain kSecAttrAccessible =
    // kSecAttrAccessibleWhenUnlocked, which works without any entitlement and
    // still protects the token while the screen is locked.

    pub fn store_token(token: &TokenSet) -> Result<(), AppError> {
        let key = token_key(&token.email);
        let json = serde_json::to_string(token)?;

        // Delete first so we always overwrite cleanly (set_generic_password
        // fails if the item already exists with different attributes).
        match delete_generic_password(SERVICE_NAME, &key) {
            Ok(()) => {}
            Err(ref e) if e.code() == errSecItemNotFound => {}
            Err(e) => return Err(AppError::Auth(format!("Keychain delete error: {}", e))),
        }

        set_generic_password(SERVICE_NAME, &key, json.as_bytes())
            .map_err(|e| AppError::Auth(format!("Keychain write error: {}", e)))?;
        Ok(())
    }

    pub fn load_token(email: &str) -> Result<Option<TokenSet>, AppError> {
        let key = token_key(email);
        match get_generic_password(SERVICE_NAME, &key) {
            Ok(bytes) => {
                let json = String::from_utf8(bytes)
                    .map_err(|e| AppError::Auth(format!("Keychain token was not UTF-8: {}", e)))?;
                let token: TokenSet = serde_json::from_str(&json)?;
                Ok(Some(token))
            }
            Err(e) if e.code() == errSecItemNotFound => Ok(None),
            Err(e) => Err(AppError::Auth(format!("Keychain read error: {}", e))),
        }
    }

    pub fn delete_token(email: &str) -> Result<(), AppError> {
        let key = token_key(email);
        match delete_generic_password(SERVICE_NAME, &key) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == errSecItemNotFound => Ok(()),
            Err(e) => Err(AppError::Auth(format!("Keychain delete error: {}", e))),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::{token_key, SERVICE_NAME};
    use crate::auth::TokenSet;
    use crate::error::AppError;
    use keyring::Entry;

    pub fn store_token(token: &TokenSet) -> Result<(), AppError> {
        let key = token_key(&token.email);
        let entry = Entry::new(SERVICE_NAME, &key)
            .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
        let json = serde_json::to_string(token)?;
        entry
            .set_password(&json)
            .map_err(|e| AppError::Auth(format!("Keychain write error: {}", e)))?;
        Ok(())
    }

    pub fn load_token(email: &str) -> Result<Option<TokenSet>, AppError> {
        let key = token_key(email);
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
        let key = token_key(email);
        let entry = Entry::new(SERVICE_NAME, &key)
            .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
        match entry.delete_password() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(AppError::Auth(format!("Keychain delete error: {}", e))),
        }
        Ok(())
    }
}
