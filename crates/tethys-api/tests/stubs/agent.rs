use tethys_api::AgentApi;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn agent_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("agent.profiles_list", api.agent_profiles_list().await);
    assert_unimplemented("agent.profiles_create", api.agent_profiles_create().await);
    assert_unimplemented("agent.profiles_update", api.agent_profiles_update().await);
    assert_unimplemented("agent.profiles_delete", api.agent_profiles_delete().await);
    assert_unimplemented("agent.registry_list", api.agent_registry_list().await);
    assert_unimplemented("agent.registry_install", api.agent_registry_install().await);
    assert_unimplemented("agent.registry_update", api.agent_registry_update().await);
    assert_unimplemented(
        "agent.connections_list",
        api.agent_connections_list().await,
    );
    assert_unimplemented(
        "agent.connections_restart",
        api.agent_connections_restart("p1".into()).await,
    );
    assert_unimplemented("agent.login", api.agent_login().await);
    assert_unimplemented("agent.logout", api.agent_logout().await);
    assert_unimplemented("agent.stderr", api.agent_stderr().await);
    assert_unimplemented("agent.config_schema", api.agent_config_schema().await);
    assert_unimplemented("agent.config_get", api.agent_config_get().await);
    assert_unimplemented("agent.config_validate", api.agent_config_validate().await);
    assert_unimplemented("agent.config_plan", api.agent_config_plan().await);
    assert_unimplemented("agent.config_apply", api.agent_config_apply().await);
    assert_unimplemented("agent.config_rollback", api.agent_config_rollback().await);
}
