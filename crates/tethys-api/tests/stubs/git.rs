use tethys_api::GitApi;
use tethys_schema::{CheckpointPhase, DiffSource, RestoreTarget, WorktreeSpec};

use super::{assert_unimplemented, MinimalApi};

fn sample_spec() -> WorktreeSpec {
    WorktreeSpec {
        thread_id: "t".to_string(),
        workspace_id: "w".into(),
        slug: "t".to_string(),
        path: String::new(),
        branch: String::new(),
        base: "main".to_string(),
        bootstrap_globs: Vec::new(),
        setup_script: None,
        main_checkout: false,
    }
}

#[tokio::test]
async fn git_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("git.worktree_create", api.git_worktree_create(sample_spec()).await);
    assert_unimplemented(
        "git.worktree_remove",
        api.git_worktree_remove("t".into(), false, false).await,
    );
    assert_unimplemented("git.worktree_list", api.git_worktree_list().await);
    assert_unimplemented(
        "git.worktree_archive",
        api.git_worktree_archive("t".into()).await,
    );
    assert_unimplemented(
        "git.checkpoint_create",
        api.git_checkpoint_create("t".into(), 0, CheckpointPhase::Start)
            .await,
    );
    assert_unimplemented(
        "git.checkpoint_restore",
        api.git_checkpoint_restore(
            RestoreTarget::Checkpoint {
                thread_id: "t".into(),
                turn: 0,
                phase: CheckpointPhase::Start,
            },
            None,
        )
        .await,
    );
    assert_unimplemented(
        "git.checkpoint_list",
        api.git_checkpoint_list("t".into()).await,
    );
    let source = DiffSource::HeadWorktree {
        thread_id: "t".into(),
    };
    assert_unimplemented("git.diff_summary", api.git_diff_summary(source.clone()).await);
    assert_unimplemented(
        "git.diff_file",
        api.git_diff_file(source.clone(), "a.txt".into()).await,
    );
    assert_unimplemented("git.stage", api.git_stage("t".into(), vec![]).await);
    assert_unimplemented("git.unstage", api.git_unstage("t".into(), vec![]).await);
    assert_unimplemented(
        "git.discard",
        api.git_discard("t".into(), source, None).await,
    );
    assert_unimplemented("git.commit", api.git_commit("t".into(), "msg".into()).await);
    assert_unimplemented("git.merge", api.git_merge().await);
    assert_unimplemented("git.push", api.git_push().await);
    assert_unimplemented("git.pr_create", api.git_pr_create().await);
}
