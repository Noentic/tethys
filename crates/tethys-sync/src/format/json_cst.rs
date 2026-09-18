//! CST-backed JSONC editing.
//!
//! Every mutation goes through the concrete syntax tree so comments,
//! whitespace, key order, and indentation survive an edit.

use jsonc_parser::cst::{CstInputValue, CstObject, CstRootNode};
use jsonc_parser::ParseOptions;

use crate::error::SyncError;

/// Parses `text` into a CST root. `loose` allows comments and trailing commas.
pub fn parse(text: &str, loose: bool) -> Result<CstRootNode, SyncError> {
    let options = ParseOptions {
        allow_comments: loose,
        allow_trailing_commas: loose,
        ..Default::default()
    };
    CstRootNode::parse(text, &options).map_err(|error| SyncError::Parse {
        path: String::new(),
        message: error.to_string(),
    })
}

/// Returns the root object, or an error when the document is not an object.
pub fn root_object(root: &CstRootNode) -> Result<CstObject, SyncError> {
    root.object_value()
        .ok_or_else(|| SyncError::Registry("root must be a JSON object".into()))
}

/// Returns a nested object property when it exists and is an object.
pub fn object(object: &CstObject, name: &str) -> Option<CstObject> {
    object.object_value(name)
}

/// Returns a nested object property, creating `{}` when absent.
pub fn object_or_set(object: &CstObject, name: &str) -> CstObject {
    object.object_value_or_set(name)
}

/// Sets a property, replacing its value in place or appending it.
pub fn set(object: &CstObject, name: &str, value: CstInputValue) {
    match object.get(name) {
        Some(prop) => prop.set_value(value),
        None => {
            object.append(name, value);
        }
    }
}

/// Removes a property, leaving surrounding formatting intact.
pub fn remove(object: &CstObject, name: &str) {
    if let Some(prop) = object.get(name) {
        prop.remove();
    }
}
