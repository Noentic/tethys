mod common;

use common::TestRepo;
use proptest::prelude::*;
use tethys_schema::{DiffSource, HunkRef};

#[test]
fn stage_and_unstage_move_paths_between_index_and_worktree() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    repo.write("pkg/a.txt", "two\n");
    engine.stage(&["pkg/a.txt".to_string()]).expect("stage");
    let status = repo.git(&["status", "--porcelain"]);
    assert!(status.contains("M  pkg/a.txt"), "staged: {status:?}");

    engine.unstage(&["pkg/a.txt".to_string()]).expect("unstage");
    let status = repo.git(&["status", "--porcelain"]);
    assert!(status.contains(" M pkg/a.txt"), "unstaged: {status:?}");
}

#[test]
fn discard_whole_file_restores_the_index_content() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    repo.write("pkg/a.txt", "two\n");
    repo.write("pkg/untracked.txt", "new\n");
    engine
        .discard(
            &DiffSource::IndexWorktree {
                thread_id: "t1".to_string(),
            },
            None,
        )
        .expect("discard all");

    assert_eq!(repo.read("pkg/a.txt"), "one\n");
    assert!(
        repo.exists("pkg/untracked.txt"),
        "whole-file discard never deletes untracked files"
    );
}

#[test]
fn discard_one_hunk_leaves_the_other_change() {
    let repo = TestRepo::init();
    let mut base = String::new();
    for index in 0..60 {
        base.push_str(&format!("line {index}\n"));
    }
    repo.write("pkg/a.txt", &base);
    repo.commit("base");
    let engine = repo.engine();

    let changed = base
        .replace("line 5", "LINE 5")
        .replace("line 50", "LINE 50");
    repo.write("pkg/a.txt", &changed);

    let detail = engine
        .diff_file(
            &DiffSource::HeadWorktree {
                thread_id: "t1".to_string(),
            },
            "pkg/a.txt",
        )
        .expect("detail");
    assert_eq!(detail.hunks.len(), 2, "two distant hunks");

    let first = HunkRef {
        path: "pkg/a.txt".to_string(),
        hunk_index: 0,
    };
    engine
        .discard(
            &DiffSource::IndexWorktree {
                thread_id: "t1".to_string(),
            },
            Some(&[first]),
        )
        .expect("discard first hunk");

    let content = repo.read("pkg/a.txt");
    assert!(content.contains("line 5"), "first hunk restored");
    assert!(content.contains("LINE 50"), "second hunk kept");
}

#[test]
fn discard_staged_hunk_touches_only_the_index() {
    let repo = TestRepo::init();
    let mut base = String::new();
    for index in 0..40 {
        base.push_str(&format!("line {index}\n"));
    }
    repo.write("pkg/a.txt", &base);
    repo.commit("base");
    let engine = repo.engine();

    let changed = base.replace("line 10", "LINE 10");
    repo.write("pkg/a.txt", &changed);
    repo.git(&["add", "pkg/a.txt"]);

    let detail = engine
        .diff_file(
            &DiffSource::HeadIndex {
                thread_id: "t1".to_string(),
            },
            "pkg/a.txt",
        )
        .expect("detail");
    assert_eq!(detail.hunks.len(), 1);

    let hunk = HunkRef {
        path: "pkg/a.txt".to_string(),
        hunk_index: 0,
    };
    engine
        .discard(
            &DiffSource::HeadIndex {
                thread_id: "t1".to_string(),
            },
            Some(&[hunk]),
        )
        .expect("discard staged hunk");

    assert!(
        repo.read("pkg/a.txt").contains("LINE 10"),
        "worktree untouched"
    );
    let cached = repo.git(&["diff", "--cached"]);
    assert!(cached.trim().is_empty(), "index reverted: {cached:?}");
}

#[test]
fn commit_records_the_message_and_reports_nothing_when_clean() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    repo.write("pkg/a.txt", "two\n");
    engine.stage(&["pkg/a.txt".to_string()]).expect("stage");
    let result = engine
        .commit("thread change", None)
        .expect("commit staged work");
    assert_eq!(result.oid.len(), 40);
    assert!(!result.summary.is_empty());

    let subject = repo.git(&["log", "-1", "--format=%s"]);
    assert_eq!(subject.trim(), "thread change");

    let error = engine.commit("nothing", None).expect_err("clean tree");
    assert!(
        matches!(error, tethys_git::GitError::NothingToCommit),
        "got {error:?}"
    );
}

#[test]
fn discard_handles_missing_trailing_newline() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\ntwo");
    repo.commit("base");
    let engine = repo.engine();

    repo.write("pkg/a.txt", "one\nTWO");
    let detail = engine
        .diff_file(
            &DiffSource::HeadWorktree {
                thread_id: "t1".to_string(),
            },
            "pkg/a.txt",
        )
        .expect("detail");
    let refs: Vec<HunkRef> = (0..detail.hunks.len() as u32)
        .map(|hunk_index| HunkRef {
            path: "pkg/a.txt".to_string(),
            hunk_index,
        })
        .collect();
    engine
        .discard(
            &DiffSource::IndexWorktree {
                thread_id: "t1".to_string(),
            },
            Some(&refs),
        )
        .expect("discard");
    assert_eq!(repo.read("pkg/a.txt"), "one\ntwo");
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(8))]

    #[test]
    fn discard_all_hunks_restores_the_original(
        lines in prop::collection::vec("[a-z]{1,12}", 1..24),
        target in 0usize..24,
        extra in "[a-z]{1,12}",
    ) {
        let repo = TestRepo::init();
        let original: String = lines.iter().map(|line| format!("{line}\n")).collect();
        repo.write("pkg/a.txt", &original);
        repo.commit("base");
        let engine = repo.engine();

        let target = target % lines.len();
        let mut modified_lines = lines.clone();
        modified_lines[target] = "changed line".to_string();
        modified_lines.push(extra);
        let modified: String = modified_lines.iter().map(|line| format!("{line}\n")).collect();
        repo.write("pkg/a.txt", &modified);

        let detail = engine
            .diff_file(&DiffSource::HeadWorktree { thread_id: "t1".to_string() }, "pkg/a.txt")
            .expect("detail");
        let refs: Vec<HunkRef> = (0..detail.hunks.len() as u32)
            .map(|hunk_index| HunkRef {
                path: "pkg/a.txt".to_string(),
                hunk_index,
            })
            .collect();
        engine
            .discard(&DiffSource::IndexWorktree { thread_id: "t1".to_string() }, Some(&refs))
            .expect("discard hunks");

        prop_assert_eq!(repo.read("pkg/a.txt"), original);
    }
}
