//! ACP `elicitation/create` → normalized [`ElicitationRequest`] mapping.
//!
//! The SDK models a nested JSON-Schema-like tree that differs between v1 and v2
//! and carries `#[non_exhaustive]` open enums. This module flattens it into the
//! transport-agnostic field list the webview consumes (M1.7 U1). An unknown
//! string format degrades to `None`; an unknown property type is dropped rather
//! than rendered as a known input control.

use agent_client_protocol::schema::v1 as acp1;
#[cfg(feature = "acp-v2")]
use agent_client_protocol::schema::v2 as acp2;
use tethys_schema::elicitation::{
    ElicitationEnumOption, ElicitationField, ElicitationFieldKind, ElicitationRequest,
};

/// A property flattened out of either SDK version, before the field label and
/// required flag are attached.
enum RawProperty {
    Text {
        default: Option<String>,
        min_len: Option<u32>,
        max_len: Option<u32>,
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
    /// An unknown or deferred shape (multi-select, custom type): dropped.
    Unsupported,
}

/// Normalizes a v1 `elicitation/create` request. Returns `None` for URL mode,
/// which carries no form fields; use [`from_sdk_v1_url`] for that.
pub fn from_sdk_v1(request: &acp1::CreateElicitationRequest) -> Option<ElicitationRequest> {
    let acp1::ElicitationMode::Form(form) = &request.mode else {
        return None;
    };
    let schema = &form.requested_schema;
    Some(build_request(
        request.message.clone(),
        schema.title.clone(),
        schema.description.clone(),
        schema.required.as_deref(),
        schema
            .properties
            .iter()
            .map(|(key, property)| (key.clone(), property_v1(property))),
    ))
}

/// The URL a v1 URL-mode elicitation points at, if any.
pub fn from_sdk_v1_url(request: &acp1::CreateElicitationRequest) -> Option<String> {
    match &request.mode {
        acp1::ElicitationMode::Url(url) => Some(url.url.clone()),
        _ => None,
    }
}

#[cfg(feature = "acp-v2")]
pub fn from_sdk_v2(request: &acp2::CreateElicitationRequest) -> Option<ElicitationRequest> {
    let acp2::ElicitationMode::Form(form) = &request.mode else {
        return None;
    };
    let schema = &form.requested_schema;
    Some(build_request(
        request.message.clone(),
        schema.title.clone(),
        schema.description.clone(),
        schema.required.as_deref(),
        schema
            .properties
            .iter()
            .map(|(key, property)| (key.clone(), property_v2(property))),
    ))
}

#[cfg(feature = "acp-v2")]
pub fn from_sdk_v2_url(request: &acp2::CreateElicitationRequest) -> Option<String> {
    match &request.mode {
        acp2::ElicitationMode::Url(url) => Some(url.url.clone()),
        _ => None,
    }
}

fn build_request(
    message: String,
    schema_title: Option<String>,
    description: Option<String>,
    required: Option<&[String]>,
    properties: impl Iterator<Item = (String, (Option<String>, Option<String>, RawProperty))>,
) -> ElicitationRequest {
    let mut fields = Vec::new();
    for (key, (title, field_description, raw)) in properties {
        let required = required.is_some_and(|list| list.iter().any(|name| name == &key));
        let label = title.unwrap_or_else(|| key.clone());
        let kind = match raw {
            RawProperty::Text {
                default,
                min_len,
                max_len,
                format,
            } => ElicitationFieldKind::Text {
                default,
                min_len,
                max_len,
                format,
            },
            RawProperty::Number { default, min, max } => {
                ElicitationFieldKind::Number { default, min, max }
            }
            RawProperty::Boolean { default } => ElicitationFieldKind::Boolean { default },
            RawProperty::Enum { options, default } => {
                ElicitationFieldKind::Enum { options, default }
            }
            RawProperty::Unsupported => continue,
        };
        fields.push(ElicitationField {
            key,
            label,
            description: field_description,
            required,
            kind,
        });
    }
    ElicitationRequest {
        req_id: String::new(),
        title: schema_title.unwrap_or(message),
        description,
        url: None,
        fields,
    }
}

fn property_v1(
    property: &acp1::ElicitationPropertySchema,
) -> (Option<String>, Option<String>, RawProperty) {
    match property {
        acp1::ElicitationPropertySchema::String(string) => (
            string.title.clone(),
            string.description.clone(),
            string_property(
                string.enum_values.as_deref(),
                string
                    .one_of
                    .as_ref()
                    .map(|options| titled_options_v1(options)),
                string.default.clone(),
                string.min_length,
                string.max_length,
                string.format.as_ref().map(crate::map::label),
            ),
        ),
        acp1::ElicitationPropertySchema::Number(number) => (
            number.title.clone(),
            number.description.clone(),
            RawProperty::Number {
                default: number.default,
                min: number.minimum,
                max: number.maximum,
            },
        ),
        acp1::ElicitationPropertySchema::Integer(integer) => (
            integer.title.clone(),
            integer.description.clone(),
            RawProperty::Number {
                default: integer.default.map(|value| value as f64),
                min: integer.minimum.map(|value| value as f64),
                max: integer.maximum.map(|value| value as f64),
            },
        ),
        acp1::ElicitationPropertySchema::Boolean(boolean) => (
            boolean.title.clone(),
            boolean.description.clone(),
            RawProperty::Boolean {
                default: boolean.default,
            },
        ),
        _ => (None, None, RawProperty::Unsupported),
    }
}

#[cfg(feature = "acp-v2")]
fn property_v2(
    property: &acp2::ElicitationPropertySchema,
) -> (Option<String>, Option<String>, RawProperty) {
    match property {
        acp2::ElicitationPropertySchema::String(string) => (
            string.title.clone(),
            string.description.clone(),
            string_property(
                string.enum_values.as_deref(),
                string
                    .one_of
                    .as_ref()
                    .map(|options| titled_options_v2(options)),
                string.default.clone(),
                string.min_length,
                string.max_length,
                string.format.as_ref().map(crate::map::label),
            ),
        ),
        acp2::ElicitationPropertySchema::Number(number) => (
            number.title.clone(),
            number.description.clone(),
            RawProperty::Number {
                default: number.default,
                min: number.minimum,
                max: number.maximum,
            },
        ),
        acp2::ElicitationPropertySchema::Integer(integer) => (
            integer.title.clone(),
            integer.description.clone(),
            RawProperty::Number {
                default: integer.default.map(|value| value as f64),
                min: integer.minimum.map(|value| value as f64),
                max: integer.maximum.map(|value| value as f64),
            },
        ),
        acp2::ElicitationPropertySchema::Boolean(boolean) => (
            boolean.title.clone(),
            boolean.description.clone(),
            RawProperty::Boolean {
                default: boolean.default,
            },
        ),
        _ => (None, None, RawProperty::Unsupported),
    }
}

fn titled_options_v1(options: &[acp1::EnumOption]) -> Vec<(String, String, Option<String>)> {
    options
        .iter()
        .map(|option| {
            (
                option.value.clone(),
                option.title.clone(),
                option.description.clone(),
            )
        })
        .collect()
}

#[cfg(feature = "acp-v2")]
fn titled_options_v2(options: &[acp2::EnumOption]) -> Vec<(String, String, Option<String>)> {
    options
        .iter()
        .map(|option| {
            (
                option.value.clone(),
                option.title.clone(),
                option.description.clone(),
            )
        })
        .collect()
}

fn string_property(
    enum_values: Option<&[String]>,
    one_of: Option<Vec<(String, String, Option<String>)>>,
    default: Option<String>,
    min_len: Option<u32>,
    max_len: Option<u32>,
    format: Option<String>,
) -> RawProperty {
    // `one_of`/`enum` turn a string property into a single-select enum; `one_of`
    // wins because it carries titles.
    if let Some(options) = one_of {
        return RawProperty::Enum {
            options: options
                .into_iter()
                .map(|(value, label, description)| ElicitationEnumOption {
                    value,
                    label,
                    description,
                })
                .collect(),
            default,
        };
    }
    if let Some(values) = enum_values {
        return RawProperty::Enum {
            options: values
                .iter()
                .map(|value| ElicitationEnumOption {
                    value: value.clone(),
                    label: value.clone(),
                    description: None,
                })
                .collect(),
            default,
        };
    }
    RawProperty::Text {
        default,
        min_len,
        max_len,
        format,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1 as acp1;

    fn form_request() -> acp1::CreateElicitationRequest {
        let schema = acp1::ElicitationSchema::new()
            .title("Project details")
            .property(
                "name",
                acp1::StringPropertySchema::new()
                    .title("Name")
                    .min_length(1)
                    .max_length(80),
                true,
            )
            .property("contact", acp1::StringPropertySchema::email(), false)
            .property(
                "tier",
                acp1::StringPropertySchema::new().one_of(vec![
                    acp1::EnumOption::new("free", "Free"),
                    acp1::EnumOption::new("pro", "Pro").description("Paid"),
                    acp1::EnumOption::new("team", "Team"),
                ]),
                false,
            )
            .property("notify", acp1::BooleanPropertySchema::new(), true);
        acp1::CreateElicitationRequest::new(
            acp1::ElicitationFormMode::new(acp1::ElicitationSessionScope::new("session-1"), schema),
            "Tell us about the project",
        )
    }

    #[test]
    fn form_request_flattens_fields_and_required() {
        let request = from_sdk_v1(&form_request()).expect("form");
        assert_eq!(request.title, "Project details");
        assert_eq!(request.fields.len(), 4);
        let field = |key: &str| {
            request
                .fields
                .iter()
                .find(|field| field.key == key)
                .expect(key)
        };

        let name = field("name");
        assert_eq!(name.label, "Name");
        assert!(name.required);
        assert_eq!(
            name.kind,
            ElicitationFieldKind::Text {
                default: None,
                min_len: Some(1),
                max_len: Some(80),
                format: None,
            }
        );

        assert_eq!(
            field("contact").kind,
            ElicitationFieldKind::Text {
                default: None,
                min_len: None,
                max_len: None,
                format: Some("email".into()),
            }
        );

        let tier = field("tier");
        let ElicitationFieldKind::Enum { options, .. } = &tier.kind else {
            panic!("expected enum, got {:?}", tier.kind);
        };
        assert_eq!(options.len(), 3);
        assert_eq!(options[0].value, "free");
        assert_eq!(options[1].label, "Pro");
        assert_eq!(options[1].description.as_deref(), Some("Paid"));
        assert!(!tier.required);

        assert!(field("notify").required);
    }

    #[test]
    fn unknown_format_degrades_to_none() {
        let mut schema = acp1::ElicitationSchema::new();
        let mut string = acp1::StringPropertySchema::new();
        // v1 `StringFormat` is `#[non_exhaustive]`; a future format cannot be
        // constructed here, so assert the known-format path and that an absent
        // format is `None`.
        string.format = None;
        schema.properties.insert("plain".into(), string.into());
        let request = acp1::CreateElicitationRequest::new(
            acp1::ElicitationFormMode::new(acp1::ElicitationSessionScope::new("session-1"), schema),
            "message",
        );
        let normalized = from_sdk_v1(&request).expect("form");
        assert_eq!(
            normalized.fields[0].kind,
            ElicitationFieldKind::Text {
                default: None,
                min_len: None,
                max_len: None,
                format: None,
            }
        );
    }

    #[test]
    fn url_mode_yields_url_and_no_form() {
        let request = acp1::CreateElicitationRequest::new(
            acp1::ElicitationUrlMode::new(
                acp1::ElicitationSessionScope::new("session-1"),
                acp1::ElicitationId::new("elicit-1"),
                "https://example.com/connect",
            ),
            "Authorize",
        );
        assert!(from_sdk_v1(&request).is_none());
        assert_eq!(
            from_sdk_v1_url(&request).as_deref(),
            Some("https://example.com/connect")
        );
    }
}
