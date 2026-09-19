//! Secret references and the keychain-backed [`SecretStore`] port.

use std::collections::BTreeMap;
use std::sync::Mutex;

use crate::error::SyncError;

/// Keychain service name for every Tethys-managed secret.
pub const KEYRING_SERVICE: &str = "tethys";

/// Keychain account prefix used by registry `secretRef` values.
pub const SECRET_REF_PREFIX: &str = "keychain:tethys/";

/// Reads and writes secrets outside the registry files.
pub trait SecretStore: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<String>, SyncError>;
    fn set(&self, account: &str, value: &str) -> Result<(), SyncError>;
    fn delete(&self, account: &str) -> Result<(), SyncError>;
}

/// Extracts the account from a canonical `secretRef`.
pub fn parse_secret_ref(reference: &str) -> Option<&str> {
    reference
        .strip_prefix(SECRET_REF_PREFIX)
        .filter(|account| !account.is_empty())
}

/// Production store backed by the platform keychain (keyring `v1` mode).
pub struct KeyringSecrets;

impl SecretStore for KeyringSecrets {
    fn get(&self, account: &str) -> Result<Option<String>, SyncError> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, account)
            .map_err(|error| SyncError::SecretStore(error.to_string()))?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(SyncError::SecretStore(error.to_string())),
        }
    }

    fn set(&self, account: &str, value: &str) -> Result<(), SyncError> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, account)
            .map_err(|error| SyncError::SecretStore(error.to_string()))?;
        entry
            .set_password(value)
            .map_err(|error| SyncError::SecretStore(error.to_string()))
    }

    fn delete(&self, account: &str) -> Result<(), SyncError> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, account)
            .map_err(|error| SyncError::SecretStore(error.to_string()))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(SyncError::SecretStore(error.to_string())),
        }
    }
}

/// In-memory store for deterministic tests.
#[derive(Default)]
pub struct MemorySecrets {
    values: Mutex<BTreeMap<String, String>>,
}

impl MemorySecrets {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, account: &str, value: &str) {
        self.values
            .lock()
            .expect("memory secrets poisoned")
            .insert(account.to_string(), value.to_string());
    }
}

impl SecretStore for MemorySecrets {
    fn get(&self, account: &str) -> Result<Option<String>, SyncError> {
        Ok(self
            .values
            .lock()
            .expect("memory secrets poisoned")
            .get(account)
            .cloned())
    }

    fn set(&self, account: &str, value: &str) -> Result<(), SyncError> {
        self.values
            .lock()
            .expect("memory secrets poisoned")
            .insert(account.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), SyncError> {
        self.values
            .lock()
            .expect("memory secrets poisoned")
            .remove(account);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_secret_ref_extracts_account() {
        assert_eq!(parse_secret_ref("keychain:tethys/github"), Some("github"));
        assert_eq!(parse_secret_ref("keychain:tethys/"), None);
        assert_eq!(parse_secret_ref("plain_value"), None);
    }

    #[test]
    #[ignore = "manual platform keychain check"]
    fn manual_keyring_platform_test() {
        let store = KeyringSecrets;
        let test_account = "test_manual_account";
        let test_val = "super_secret_value_123";
        match store.set(test_account, test_val) {
            Ok(()) => {
                let retrieved = store.get(test_account).expect("get");
                assert_eq!(retrieved.as_deref(), Some(test_val));
                store.delete(test_account).expect("delete");
                let after_del = store.get(test_account).expect("get after delete");
                assert_eq!(after_del, None);
            }
            Err(e) => {
                println!("Platform keychain returned: {e}");
            }
        }
    }
}
