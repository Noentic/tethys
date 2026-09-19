use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use tethys_schema::sync::{EntryState, RegistryEntry, Scope, TransportKind, VerifyStatus};
use tethys_sync::manifest::{applied_from_row, applied_to_row};
use tethys_sync::projection::{apply, plan, rollback, verify, ApplyRequest, PlanRequest};
use tethys_sync::{ClaudeCodeProjector, SyncError};

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/projectors")
        .join(name);
    fs::read_to_string(path).expect("read fixture")
}

fn stdio(command: &str) -> RegistryEntry {
    RegistryEntry {
        transport: TransportKind::Stdio,
        command: Some(command.to_string()),
        args: vec!["stdio".to_string()],
        env: BTreeMap::new(),
        url: None,
        headers: BTreeMap::new(),
        meta: Default::default(),
    }
}

fn desired(entries: &[(&str, RegistryEntry)]) -> Vec<(String, RegistryEntry)> {
    entries
        .iter()
        .map(|(name, entry)| (name.to_string(), entry.clone()))
        .collect()
}

struct Harness {
    dir: tempfile::TempDir,
}

impl Harness {
    fn new() -> Self {
        Self {
            dir: tempfile::tempdir().expect("tempdir"),
        }
    }

    fn home(&self) -> PathBuf {
        self.dir.path().join("home")
    }

    fn path(&self) -> PathBuf {
        self.dir.path().join(".mcp.json")
    }

    fn seed(&self) {
        fs::create_dir_all(self.dir.path()).expect("dir");
        fs::write(self.path(), fixture("claude_code.json")).expect("seed");
    }
}

#[test]
fn plan_apply_verify_rollback_round_trip() {
    let harness = Harness::new();
    harness.seed();
    let original = fs::read_to_string(harness.path()).expect("read");
    let projector = ClaudeCodeProjector;
    let wanted = desired(&[("github", stdio("github-mcp-server"))]);
    let owned = BTreeMap::new();

    let projection = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&original),
        desired: &wanted,
        owned: &owned,
    })
    .expect("plan");
    assert_eq!(projection.entries[0].state, EntryState::Pending);
    assert!(projection.entries[0].projected);
    assert!(!projection.created);
    assert!(projection.diff.contains("github"));
    assert!(projection.diff.lines().any(|line| line.starts_with('+')));

    let applied = apply(ApplyRequest {
        projector: &projector,
        plan: &projection,
        home: &harness.home(),
    })
    .expect("apply");
    assert!(applied.entries.contains_key("github"));
    assert_eq!(
        verify(&harness.path(), &applied).expect("verify"),
        VerifyStatus::InSync
    );

    let row = applied_to_row(&applied, 42).expect("row");
    assert_eq!(applied_from_row(&row).expect("back"), applied);

    rollback(&applied, &harness.home(), false).expect("rollback");
    assert_eq!(
        fs::read_to_string(harness.path()).expect("reread"),
        original
    );
}

#[test]
fn in_sync_entries_are_not_rewritten() {
    let harness = Harness::new();
    harness.seed();
    let projector = ClaudeCodeProjector;
    let wanted = desired(&[("github", stdio("github-mcp-server"))]);

    let first = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&fixture("claude_code.json")),
        desired: &wanted,
        owned: &BTreeMap::new(),
    })
    .expect("plan");
    let applied = apply(ApplyRequest {
        projector: &projector,
        plan: &first,
        home: &harness.home(),
    })
    .expect("apply");

    let current = fs::read_to_string(harness.path()).expect("read");
    let second = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&current),
        desired: &wanted,
        owned: &applied.entries,
    })
    .expect("replan");
    assert_eq!(second.entries[0].state, EntryState::InSync);
    assert!(second.diff.is_empty());
}

#[test]
fn foreign_entry_name_collision_is_conflict() {
    let harness = Harness::new();
    harness.seed();
    let projector = ClaudeCodeProjector;
    let original = fixture("claude_code.json");
    let wanted = desired(&[("existing_server", stdio("mine"))]);

    let projection = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&original),
        desired: &wanted,
        owned: &BTreeMap::new(),
    })
    .expect("plan");
    assert_eq!(projection.entries[0].state, EntryState::Conflict);
    assert!(!projection.entries[0].projected);

    let error = apply(ApplyRequest {
        projector: &projector,
        plan: &projection,
        home: &harness.home(),
    })
    .expect_err("conflict");
    assert!(matches!(error, SyncError::Conflict(_)));
    assert_eq!(fs::read_to_string(harness.path()).expect("read"), original);
}

#[test]
fn owned_drift_is_conflict_and_apply_refuses() {
    let harness = Harness::new();
    harness.seed();
    let projector = ClaudeCodeProjector;
    let wanted = desired(&[("github", stdio("github-mcp-server"))]);

    let first = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&fixture("claude_code.json")),
        desired: &wanted,
        owned: &BTreeMap::new(),
    })
    .expect("plan");
    let applied = apply(ApplyRequest {
        projector: &projector,
        plan: &first,
        home: &harness.home(),
    })
    .expect("apply");

    let edited = fs::read_to_string(harness.path())
        .expect("read")
        .replace("github-mcp-server", "user-edited");
    fs::write(harness.path(), &edited).expect("edit");

    let second = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&edited),
        desired: &wanted,
        owned: &applied.entries,
    })
    .expect("replan");
    assert_eq!(second.entries[0].state, EntryState::Conflict);
    let error = apply(ApplyRequest {
        projector: &projector,
        plan: &second,
        home: &harness.home(),
    })
    .expect_err("conflict");
    assert!(matches!(error, SyncError::Conflict(_)));
    assert_eq!(fs::read_to_string(harness.path()).expect("read"), edited);
}

#[test]
fn stale_plan_writes_nothing() {
    let harness = Harness::new();
    harness.seed();
    let projector = ClaudeCodeProjector;
    let original = fixture("claude_code.json");
    let wanted = desired(&[("github", stdio("github-mcp-server"))]);

    let projection = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&original),
        desired: &wanted,
        owned: &BTreeMap::new(),
    })
    .expect("plan");

    let edited = format!("{original}\n\n");
    fs::write(harness.path(), &edited).expect("edit");
    let error = apply(ApplyRequest {
        projector: &projector,
        plan: &projection,
        home: &harness.home(),
    })
    .expect_err("stale");
    assert!(matches!(error, SyncError::StalePlan { .. }));
    assert_eq!(fs::read_to_string(harness.path()).expect("read"), edited);
    assert!(!harness.home().join(".tethys").join("backups").exists());
}

#[test]
fn created_file_is_deleted_on_rollback() {
    let harness = Harness::new();
    let projector = ClaudeCodeProjector;
    let wanted = desired(&[("github", stdio("github-mcp-server"))]);

    let projection = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: None,
        desired: &wanted,
        owned: &BTreeMap::new(),
    })
    .expect("plan");
    assert!(projection.created);

    let applied = apply(ApplyRequest {
        projector: &projector,
        plan: &projection,
        home: &harness.home(),
    })
    .expect("apply");
    assert!(harness.path().exists());
    rollback(&applied, &harness.home(), false).expect("rollback");
    assert!(!harness.path().exists());
}

#[cfg(unix)]
#[test]
fn symlinked_config_is_written_through() {
    use std::os::unix::fs::symlink;

    let harness = Harness::new();
    fs::create_dir_all(harness.dir.path()).expect("dir");
    let real = harness.dir.path().join("dotfiles-mcp.json");
    fs::write(&real, fixture("claude_code.json")).expect("real");
    symlink(&real, harness.path()).expect("symlink");

    let projector = ClaudeCodeProjector;
    let wanted = desired(&[("github", stdio("github-mcp-server"))]);
    let original = fs::read_to_string(&real).expect("read");
    let projection = plan(PlanRequest {
        projector: &projector,
        path: &harness.path(),
        scope: Scope::Workspace,
        original: Some(&original),
        desired: &wanted,
        owned: &BTreeMap::new(),
    })
    .expect("plan");
    let applied = apply(ApplyRequest {
        projector: &projector,
        plan: &projection,
        home: &harness.home(),
    })
    .expect("apply");

    assert!(fs::symlink_metadata(harness.path())
        .expect("link")
        .file_type()
        .is_symlink());
    assert!(fs::read_to_string(&real)
        .expect("real")
        .contains("github-mcp-server"));
    rollback(&applied, &harness.home(), false).expect("rollback");
    assert_eq!(fs::read_to_string(&real).expect("real"), original);
}

#[test]
fn write_failure_leaves_no_temp_file() {
    let harness = Harness::new();
    let blocker = harness.dir.path().join("blocked");
    fs::write(&blocker, "not a directory").expect("blocker");
    let path = blocker.join(".mcp.json");

    let projector = ClaudeCodeProjector;
    let wanted = desired(&[("github", stdio("github-mcp-server"))]);
    let projection = plan(PlanRequest {
        projector: &projector,
        path: &path,
        scope: Scope::Workspace,
        original: None,
        desired: &wanted,
        owned: &BTreeMap::new(),
    })
    .expect("plan");

    apply(ApplyRequest {
        projector: &projector,
        plan: &projection,
        home: &harness.home(),
    })
    .expect_err("write failure");
    assert!(!path.exists());
    let leftovers: Vec<PathBuf> = fs::read_dir(harness.dir.path())
        .expect("read dir")
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().into())
        .collect();
    assert_eq!(leftovers, vec![PathBuf::from("blocked")]);
}
