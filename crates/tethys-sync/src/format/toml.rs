//! Comment-preserving TOML editing helpers over `toml_edit`.

use toml_edit::{DocumentMut, Item, Table};

use crate::error::SyncError;

/// Parses TOML, preserving comments and formatting.
pub fn parse(text: &str) -> Result<DocumentMut, SyncError> {
    text.parse::<DocumentMut>()
        .map_err(|error| SyncError::Parse {
            path: String::new(),
            message: error.to_string(),
        })
}

/// Returns a top-level table, inserting an empty one when absent.
pub fn table_or_insert<'a>(
    doc: &'a mut DocumentMut,
    key: &str,
) -> Result<&'a mut Table, SyncError> {
    if !doc.contains_key(key) {
        doc.insert(key, Item::Table(Table::new()));
    }
    doc[key]
        .as_table_mut()
        .ok_or_else(|| SyncError::Registry(format!("{key} must be a table")))
}
