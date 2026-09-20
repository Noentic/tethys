use tethys_api::PermissionApi;
use tethys_schema::thread::ThreadId;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn permission_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented(
        "permission.respond",
        api.permission_respond(ThreadId::from("t1"), "perm-1".into(), None)
            .await,
    );
    assert_unimplemented(
        "permission.elicitation_respond",
        api.elicitation_respond(
            ThreadId::from("t1"),
            tethys_schema::elicitation::ElicitationResponse::without_values(
                "elicit-1",
                tethys_schema::elicitation::ElicitationOutcome::Declined,
            ),
        )
        .await,
    );
    assert_unimplemented("permission.rules_list", api.permission_rules_list().await);
    assert_unimplemented("permission.rules_set", api.permission_rules_set().await);
    assert_unimplemented("permission.rules_delete", api.permission_rules_delete().await);
}
