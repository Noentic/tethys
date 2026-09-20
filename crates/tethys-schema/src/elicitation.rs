//! Normalized elicitation form model (M1.7, architecture §7.3).
//!
//! A transport-agnostic, flat field list. The ACP SDK's nested JSON-Schema-like
//! tree (`agent-client-protocol-schema`'s `ElicitationSchema`) is normalized in
//! `tethys-acp`; the webview only ever sees these types. Nested objects are
//! deferred: the SDK only emits `ElicitationSchemaType::Object` today.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// One selectable value of an [`ElicitationFieldKind::Enum`] field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ElicitationEnumOption {
    pub value: String,
    pub label: String,
    pub description: Option<String>,
}

/// The shape of one elicitation field, carrying its constraints and default.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ElicitationFieldKind {
    Text {
        default: Option<String>,
        min_len: Option<u32>,
        max_len: Option<u32>,
        /// A named format (`email`, `uri`, `date`, `date-time`) or `None` when
        /// the Provider declared an unrecognised one.
        format: Option<String>,
    },
    Number {
        default: Option<f64>,
        min: Option<f64>,
        max: Option<f64>,
    },
    Boolean {
        default: Option<bool>,
    },
    Enum {
        options: Vec<ElicitationEnumOption>,
        default: Option<String>,
    },
}

/// One field of an elicitation form.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ElicitationField {
    pub key: String,
    pub label: String,
    pub description: Option<String>,
    pub required: bool,
    pub kind: ElicitationFieldKind,
}

/// A normalized `elicitation/create` request.
///
/// Form mode carries `fields`; URL mode carries `url` and no fields (U9 renders
/// the host and an `Open in browser` action, never an embedded frame).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ElicitationRequest {
    pub req_id: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    pub fields: Vec<ElicitationField>,
}

/// One typed answer value.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "type", content = "value", rename_all = "kebab-case")]
pub enum ElicitationValue {
    Text(String),
    Number(f64),
    Boolean(bool),
}

/// The three terminal outcomes of an elicitation (UI-04 / U9).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ElicitationOutcome {
    Accepted,
    Declined,
    Cancelled,
}

/// The user's answer to an elicitation request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ElicitationResponse {
    pub req_id: String,
    pub outcome: ElicitationOutcome,
    pub values: BTreeMap<String, ElicitationValue>,
}

impl ElicitationResponse {
    /// Builds an `Accepted` response with typed answers.
    pub fn accepted(
        req_id: impl Into<String>,
        values: BTreeMap<String, ElicitationValue>,
    ) -> Self {
        Self {
            req_id: req_id.into(),
            outcome: ElicitationOutcome::Accepted,
            values,
        }
    }

    /// Builds a `Declined` or `Cancelled` response with no answers.
    pub fn without_values(req_id: impl Into<String>, outcome: ElicitationOutcome) -> Self {
        Self {
            req_id: req_id.into(),
            outcome,
            values: BTreeMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> ElicitationRequest {
        ElicitationRequest {
            req_id: "elicit-1".into(),
            title: "Project details".into(),
            description: Some("Tell us about the project".into()),
            url: None,
            fields: vec![
                ElicitationField {
                    key: "name".into(),
                    label: "Name".into(),
                    description: None,
                    required: true,
                    kind: ElicitationFieldKind::Text {
                        default: None,
                        min_len: Some(1),
                        max_len: Some(80),
                        format: None,
                    },
                },
                ElicitationField {
                    key: "tier".into(),
                    label: "Tier".into(),
                    description: None,
                    required: false,
                    kind: ElicitationFieldKind::Enum {
                        options: vec![
                            ElicitationEnumOption {
                                value: "free".into(),
                                label: "Free".into(),
                                description: None,
                            },
                            ElicitationEnumOption {
                                value: "pro".into(),
                                label: "Pro".into(),
                                description: Some("Paid".into()),
                            },
                        ],
                        default: Some("free".into()),
                    },
                },
                ElicitationField {
                    key: "notify".into(),
                    label: "Notify".into(),
                    description: None,
                    required: false,
                    kind: ElicitationFieldKind::Boolean {
                        default: Some(false),
                    },
                },
            ],
        }
    }

    #[test]
    fn field_kinds_round_trip_with_kebab_tags() {
        let value = serde_json::to_value(ElicitationFieldKind::Text {
            default: Some("x".into()),
            min_len: Some(1),
            max_len: None,
            format: Some("email".into()),
        })
        .expect("serialize");
        assert_eq!(value["kind"], "text");
        assert_eq!(
            serde_json::from_value::<ElicitationFieldKind>(value).expect("round"),
            ElicitationFieldKind::Text {
                default: Some("x".into()),
                min_len: Some(1),
                max_len: None,
                format: Some("email".into()),
            }
        );

        let value = serde_json::to_value(ElicitationFieldKind::Enum {
            options: vec![],
            default: None,
        })
        .expect("serialize");
        assert_eq!(value["kind"], "enum");
    }

    #[test]
    fn request_round_trips_byte_identically() {
        let request = request();
        let encoded = serde_json::to_string(&request).expect("serialize");
        let decoded: ElicitationRequest = serde_json::from_str(&encoded).expect("deserialize");
        assert_eq!(decoded, request);
        assert_eq!(serde_json::to_string(&decoded).expect("reserialize"), encoded);
    }

    #[test]
    fn response_carries_outcome_and_values() {
        let mut values = BTreeMap::new();
        values.insert("name".to_string(), ElicitationValue::Text("Tethys".into()));
        values.insert("notify".to_string(), ElicitationValue::Boolean(true));
        values.insert("count".to_string(), ElicitationValue::Number(3.0));
        let response = ElicitationResponse::accepted("elicit-1", values);
        let encoded = serde_json::to_string(&response).expect("serialize");
        let decoded: ElicitationResponse = serde_json::from_str(&encoded).expect("deserialize");
        assert_eq!(decoded, response);

        let declined =
            ElicitationResponse::without_values("elicit-1", ElicitationOutcome::Declined);
        assert_eq!(declined.outcome, ElicitationOutcome::Declined);
        assert!(declined.values.is_empty());
    }

    #[test]
    fn value_tags_are_kebab_case() {
        let value = serde_json::to_value(ElicitationValue::Number(1.5)).expect("serialize");
        assert_eq!(value["type"], "number");
        assert_eq!(value["value"], 1.5);
    }
}
