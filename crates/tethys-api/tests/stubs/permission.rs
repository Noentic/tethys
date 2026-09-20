use tethys_api::PermissionApi;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn permission_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("permission.respond", api.permission_respond().await);
    assert_unimplemented("permission.rules_list", api.permission_rules_list().await);
    assert_unimplemented("permission.rules_set", api.permission_rules_set().await);
    assert_unimplemented("permission.rules_delete", api.permission_rules_delete().await);
}
