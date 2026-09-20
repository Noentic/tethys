use tethys_api::WorkspaceApi;

use super::{assert_unimplemented, sample_trust_grant, MinimalApi};

#[tokio::test]
async fn workspace_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("workspace.list", api.workspace_list().await);
    assert_unimplemented("workspace.add", api.workspace_add(sample_trust_grant()).await);
    assert_unimplemented("workspace.remove", api.workspace_remove("w1".into()).await);
    assert_unimplemented("workspace.settings_get", api.workspace_settings_get().await);
    assert_unimplemented("workspace.settings_set", api.workspace_settings_set().await);
    assert_unimplemented("workspace.status", api.workspace_status("w1".into()).await);
    assert_unimplemented(
        "workspace.capabilities",
        api.workspace_capabilities("w1".into()).await,
    );
}
