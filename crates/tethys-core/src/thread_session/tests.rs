use super::lifecycle::merge_config_options;
use super::turn::validate_provider_control;
use super::ConfigOption;

#[test]
fn validates_transient_provider_routing_inputs() {
    use tethys_schema::thread::{ProviderControl, ProviderHeader};

    let route = |base_url: &str, headers| ProviderControl::SetProvider {
        provider_id: "primary".into(),
        api_type: "openai".into(),
        base_url: base_url.into(),
        headers,
    };
    let valid = route(
        "https://gateway.example/v1",
        vec![ProviderHeader {
            name: "Authorization".into(),
            value: "Bearer secret".into(),
        }],
    );
    assert!(validate_provider_control(&valid).is_ok());

    for base_url in [
        "file:///tmp/provider",
        "https://user:secret@gateway.example/v1",
        "https://gateway.example/v1?token=secret",
    ] {
        let invalid = route(
            base_url,
            vec![ProviderHeader {
                name: "Authorization".into(),
                value: "Bearer secret".into(),
            }],
        );
        assert!(validate_provider_control(&invalid).is_err());
    }

    let duplicate_headers = route(
        "https://gateway.example/v1",
        vec![
            ProviderHeader {
                name: "Authorization".into(),
                value: "Bearer one".into(),
            },
            ProviderHeader {
                name: "authorization".into(),
                value: "Bearer two".into(),
            },
        ],
    );
    assert!(validate_provider_control(&duplicate_headers).is_err());
}

fn option(id: &str, category: Option<&str>) -> ConfigOption {
    ConfigOption {
        id: id.to_string(),
        name: id.to_string(),
        description: None,
        current_value: String::new(),
        values: Vec::new(),
        category: category.map(str::to_string),
        kind: None,
        value_options: Vec::new(),
        recommended_value: None,
        metadata: None,
    }
}

#[test]
fn complete_model_schema_drops_stale_dependent_options() {
    let mut current = vec![
        option("mode", Some("mode")),
        option("model", Some("model")),
        option("effort", Some("thought_level")),
    ];
    let incoming = vec![option("mode", Some("mode")), option("model", Some("model"))];

    merge_config_options(&mut current, &incoming);

    assert_eq!(
        current
            .iter()
            .map(|option| option.id.as_str())
            .collect::<Vec<_>>(),
        vec!["mode", "model"]
    );
}
