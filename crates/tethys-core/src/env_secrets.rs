//! Keychain-backed environment bindings for agent launches (G7).
//!
//! A profile stores only `keychain:tethys/…` references. The value lives in the
//! platform keychain, is resolved into the child's environment at spawn, and is
//! never written to a store row, an event, a log or the webview.

use std::sync::Arc;

use tethys_agent_servers::EnvResolver;
use tethys_sync::secrets::{parse_secret_ref, SecretStore, SECRET_REF_PREFIX};

/// Resolves `keychain:tethys/…` bindings from the keychain; any other value is
/// a literal and passes through.
pub struct KeychainEnv {
    secrets: Arc<dyn SecretStore>,
}

impl KeychainEnv {
    pub fn new(secrets: Arc<dyn SecretStore>) -> Self {
        Self { secrets }
    }
}

impl EnvResolver for KeychainEnv {
    fn resolve(&self, name: &str, value: &str) -> Result<String, String> {
        if !value.starts_with(SECRET_REF_PREFIX) {
            return Ok(value.to_string());
        }
        let Some(account) = parse_secret_ref(value) else {
            return Err(format!("{name} holds a malformed keychain reference"));
        };
        match self.secrets.get(account) {
            Ok(Some(secret)) => Ok(secret),
            Ok(None) => Err(format!(
                "the secret for {name} is missing from the keychain"
            )),
            Err(error) => Err(format!(
                "the keychain could not be read for {name}: {error}"
            )),
        }
    }
}

/// The keychain account holding one profile's environment secret.
pub fn secret_account(profile_id: &str, key: &str) -> String {
    format!("profile/{profile_id}/{key}")
}

/// The reference stored in the profile in place of the value.
pub fn secret_ref(profile_id: &str, key: &str) -> String {
    format!("{SECRET_REF_PREFIX}{}", secret_account(profile_id, key))
}

/// Whether `key` is a portable environment variable name.
pub fn is_env_name(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphabetic() || first == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// The keychain accounts a profile owns: its bindings that reference
/// `profile/<id>/…`. A reference into anything else (a shared secret) is never
/// the profile's to delete.
pub fn owned_accounts<'a>(
    profile_id: &str,
    values: impl IntoIterator<Item = &'a str>,
) -> Vec<String> {
    let namespace = format!("profile/{profile_id}/");
    values
        .into_iter()
        .filter_map(parse_secret_ref)
        .filter(|account| account.starts_with(&namespace))
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tethys_sync::secrets::MemorySecrets;

    fn resolver(secrets: &Arc<MemorySecrets>) -> KeychainEnv {
        KeychainEnv::new(secrets.clone())
    }

    #[test]
    fn a_reference_resolves_to_the_stored_value() {
        let secrets = Arc::new(MemorySecrets::new());
        secrets.insert(&secret_account("p", "API_KEY"), "s3cret");
        assert_eq!(
            resolver(&secrets).resolve("API_KEY", &secret_ref("p", "API_KEY")),
            Ok("s3cret".to_string())
        );
    }

    #[test]
    fn a_missing_secret_stops_the_launch_instead_of_passing_the_reference() {
        let secrets = Arc::new(MemorySecrets::new());
        let error = resolver(&secrets)
            .resolve("API_KEY", &secret_ref("p", "API_KEY"))
            .expect_err("missing secret");
        assert!(error.contains("missing from the keychain"), "{error}");
        assert!(!error.contains("keychain:tethys/"), "the ref is not echoed");
    }

    #[test]
    fn literals_pass_through_untouched() {
        let secrets = Arc::new(MemorySecrets::new());
        assert_eq!(
            resolver(&secrets).resolve("MODE", "fast"),
            Ok("fast".to_string())
        );
    }

    #[test]
    fn a_profile_owns_only_references_inside_its_own_namespace() {
        let owned = owned_accounts(
            "p",
            [
                secret_ref("p", "API_KEY").as_str(),
                secret_ref("other", "API_KEY").as_str(),
                "keychain:tethys/shared/github",
                "literal",
            ],
        );
        assert_eq!(owned, vec!["profile/p/API_KEY".to_string()]);
    }

    #[test]
    fn env_names_are_portable_identifiers() {
        assert!(is_env_name("API_KEY"));
        assert!(is_env_name("_x1"));
        assert!(!is_env_name(""));
        assert!(!is_env_name("1KEY"));
        assert!(!is_env_name("A-B"));
        assert!(!is_env_name("A=B"));
    }
}
