use tethys_api::AgentApi;
use tethys_schema::agents::{LaunchSpecInput, ProfileInput};

use super::{assert_unimplemented, MinimalApi};

fn profile_input() -> ProfileInput {
    ProfileInput {
        id: None,
        name: "Test".into(),
        launch_spec: LaunchSpecInput {
            program: "agent".into(),
            args: vec![],
            cwd: None,
            env: vec![],
        },
        projection_target: None,
        preferred_protocol: None,
        enabled: true,
    }
}

#[tokio::test]
async fn agent_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("agent.profiles_list", api.agent_profiles_list().await);
    assert_unimplemented(
        "agent.profiles_create",
        api.agent_profiles_create(profile_input()).await,
    );
    assert_unimplemented(
        "agent.profiles_update",
        api.agent_profiles_update(profile_input()).await,
    );
    assert_unimplemented(
        "agent.profiles_delete",
        api.agent_profiles_delete("p1".into()).await,
    );
    assert_unimplemented("agent.registry_list", api.agent_registry_list().await);
    assert_unimplemented(
        "agent.registry_install",
        api.agent_registry_install("claude-acp".into(), None).await,
    );
    assert_unimplemented(
        "agent.registry_update",
        api.agent_registry_update("claude-acp".into()).await,
    );
    assert_unimplemented("agent.connections_list", api.agent_connections_list().await);
    assert_unimplemented(
        "agent.connections_restart",
        api.agent_connections_restart("p1".into()).await,
    );
    assert_unimplemented(
        "agent.login",
        api.agent_login("p1".into(), "method".into()).await,
    );
    assert_unimplemented("agent.logout", api.agent_logout("p1".into()).await);
    assert_unimplemented("agent.stderr", api.agent_stderr("p1".into()).await);
    assert_unimplemented(
        "agent.env_secret_set",
        api.agent_env_secret_set("p1".into(), "API_KEY".into(), "v".into())
            .await,
    );
    assert_unimplemented(
        "agent.process_sample",
        api.agent_process_sample("p1".into()).await,
    );
    assert_unimplemented(
        "agent.health_interval_set",
        api.agent_health_interval_set(300).await,
    );
    assert_unimplemented("agent.recheck", api.agent_recheck(None).await);
    assert_unimplemented("agent.config_schema", api.agent_config_schema().await);
    assert_unimplemented("agent.config_get", api.agent_config_get().await);
    assert_unimplemented("agent.config_validate", api.agent_config_validate().await);
    assert_unimplemented("agent.config_plan", api.agent_config_plan().await);
    assert_unimplemented("agent.config_apply", api.agent_config_apply().await);
    assert_unimplemented("agent.config_rollback", api.agent_config_rollback().await);
}
