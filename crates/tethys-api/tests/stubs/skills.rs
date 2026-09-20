use tethys_api::SkillsApi;
use tethys_schema::sync::{Scope, SkillImportSource};

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn skills_defaults_return_unimplemented() {
    let api = MinimalApi;
    let workspace = "w1".to_string();
    assert_unimplemented(
        "skills.list",
        api.skills_list(workspace.clone().into()).await,
    );
    assert_unimplemented(
        "skills.import",
        api.skills_import(
            workspace.clone().into(),
            Scope::Global,
            SkillImportSource::Folder {
                path: "/tmp/skill".into(),
            },
        )
        .await,
    );
    assert_unimplemented(
        "skills.update_check",
        api.skills_update_check(workspace.clone().into(), Scope::Global, "s".into())
            .await,
    );
    assert_unimplemented(
        "skills.update_plan",
        api.skills_update_plan(workspace.clone().into(), Scope::Global, "s".into())
            .await,
    );
    assert_unimplemented(
        "skills.update_apply",
        api.skills_update_apply(workspace.clone().into(), Scope::Global, "s".into())
            .await,
    );
    assert_unimplemented(
        "skills.trust",
        api.skills_trust(workspace.clone().into(), Scope::Global, "s".into())
            .await,
    );
    assert_unimplemented(
        "skills.enable",
        api.skills_enable(workspace.into(), Scope::Global, "s".into(), true)
            .await,
    );
}
