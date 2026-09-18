mod common;

use common::TestRepo;
use tethys_schema::{CheckpointPhase, DiffFileStatus, DiffLineKind, DiffSource};

fn source_for(thread: &str, turn: u32) -> DiffSource {
    DiffSource::TurnStartEnd {
        thread_id: thread.to_string(),
        turn,
    }
}

#[test]
fn turn_diff_reports_status_and_counts() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\ntwo\nthree\n");
    repo.write("pkg/gone.txt", "bye\n");
    repo.commit("base");
    let engine = repo.engine();

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("start");
    repo.write("pkg/a.txt", "one\nTWO\nthree\nfour\n");
    repo.write("pkg/new.txt", "fresh\n");
    repo.remove("pkg/gone.txt");
    engine
        .checkpoint_create("t1", 1, CheckpointPhase::End)
        .expect("end");

    let summary = engine.diff_summary(&source_for("t1", 1)).expect("summary");
    assert_eq!(summary.files.len(), 3);

    let modified = summary
        .files
        .iter()
        .find(|file| file.path == "pkg/a.txt")
        .expect("modified file");
    assert_eq!(modified.status, DiffFileStatus::Modified);
    assert_eq!(modified.additions, 2);
    assert_eq!(modified.deletions, 1);
    assert!(!modified.collapsed);

    let added = summary
        .files
        .iter()
        .find(|file| file.path == "pkg/new.txt")
        .expect("added file");
    assert_eq!(added.status, DiffFileStatus::Added);
    assert_eq!(added.additions, 1);

    let deleted = summary
        .files
        .iter()
        .find(|file| file.path == "pkg/gone.txt")
        .expect("deleted file");
    assert_eq!(deleted.status, DiffFileStatus::Deleted);
    assert_eq!(deleted.deletions, 1);
}

#[test]
fn diff_file_returns_context_and_changes() {
    let repo = TestRepo::init();
    let mut base = String::new();
    for index in 0..40 {
        base.push_str(&format!("line {index}\n"));
    }
    repo.write("pkg/a.txt", &base);
    repo.commit("base");
    let engine = repo.engine();

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("start");
    let changed = base.replace("line 20", "LINE 20 changed");
    repo.write("pkg/a.txt", &changed);
    engine
        .checkpoint_create("t1", 1, CheckpointPhase::End)
        .expect("end");

    let detail = engine
        .diff_file(&source_for("t1", 1), "pkg/a.txt")
        .expect("detail");
    assert!(!detail.binary);
    assert!(!detail.collapsed);
    assert_eq!(detail.hunks.len(), 1);

    let hunk = &detail.hunks[0];
    let deletions: Vec<&str> = hunk
        .lines
        .iter()
        .filter(|line| line.kind == DiffLineKind::Deletion)
        .map(|line| line.text.as_str())
        .collect();
    let additions: Vec<&str> = hunk
        .lines
        .iter()
        .filter(|line| line.kind == DiffLineKind::Addition)
        .map(|line| line.text.as_str())
        .collect();
    assert_eq!(deletions, vec!["line 20"]);
    assert_eq!(additions, vec!["LINE 20 changed"]);
    assert!(hunk.old_start <= 21 && hunk.new_start <= 21);
}

#[test]
fn live_sources_include_untracked_and_staged_states() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    repo.write("pkg/a.txt", "two\n");
    let live = engine
        .diff_summary(&DiffSource::HeadWorktree {
            thread_id: "t1".to_string(),
        })
        .expect("head to worktree");
    assert!(live.files.iter().any(|file| file.path == "pkg/a.txt"));

    let untracked = engine
        .diff_summary(&DiffSource::HeadWorktree {
            thread_id: "t1".to_string(),
        })
        .expect("head to worktree");
    repo.write("pkg/new.txt", "fresh\n");
    let with_untracked = engine
        .diff_summary(&DiffSource::HeadWorktree {
            thread_id: "t1".to_string(),
        })
        .expect("head to worktree");
    assert_eq!(with_untracked.files.len(), untracked.files.len() + 1);

    repo.git(&["add", "pkg/a.txt"]);
    let staged = engine
        .diff_summary(&DiffSource::HeadIndex {
            thread_id: "t1".to_string(),
        })
        .expect("head to index");
    assert!(staged.files.iter().any(|file| file.path == "pkg/a.txt"));
    let unstaged = engine
        .diff_summary(&DiffSource::IndexWorktree {
            thread_id: "t1".to_string(),
        })
        .expect("index to worktree");
    let paths: Vec<&str> = unstaged
        .files
        .iter()
        .map(|file| file.path.as_str())
        .collect();
    assert_eq!(
        paths,
        vec!["pkg/new.txt"],
        "only the untracked file remains unstaged"
    );
}

#[test]
fn collapsed_and_binary_files_withhold_content() {
    let repo = TestRepo::init();
    repo.write("pkg/large.txt", "start\n");
    repo.write("pkg/blob.bin", "text\n");
    repo.commit("base");
    let engine = repo.engine();

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("start");
    let mut large = String::new();
    for index in 0..21_000 {
        large.push_str(&format!("line {index}\n"));
    }
    repo.write("pkg/large.txt", &large);
    repo.write_bytes("pkg/blob.bin", &[0u8, 1, 2, 3]);

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::End)
        .expect("end");

    let detail = engine
        .diff_file(&source_for("t1", 1), "pkg/large.txt")
        .expect("large detail");
    assert!(detail.collapsed);
    assert!(detail.hunks.is_empty());

    let binary = engine
        .diff_file(&source_for("t1", 1), "pkg/blob.bin")
        .expect("binary detail");
    assert!(binary.binary);
    assert!(binary.hunks.is_empty());
}
