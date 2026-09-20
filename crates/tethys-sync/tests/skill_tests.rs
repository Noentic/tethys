use std::collections::BTreeMap;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;

use tethys_schema::sync::{Scope, SkillOrigin, SkillSource};
use tethys_store::EventStore;
use tethys_sync::skill_import::{
    import_folder, import_tarball, import_zip, parse_github_spec, resolve_remote,
    resolve_remote_with, scan_lockfiles, Downloader, MAX_ARCHIVE_ENTRIES,
};
use tethys_sync::skills::{self, SkillHome};
use tethys_sync::SyncError;

struct LocalDownloader {
    files: BTreeMap<String, Vec<u8>>,
}

impl Downloader for LocalDownloader {
    fn get(&self, url: &str) -> Result<Vec<u8>, SyncError> {
        self.files
            .get(url)
            .cloned()
            .ok_or_else(|| SyncError::Network(format!("no fixture for {url}")))
    }
}

fn write_skill(dir: &Path, name: &str, extra: &[(&str, &str)]) {
    fs::create_dir_all(dir).expect("skill dir");
    fs::write(
        dir.join("SKILL.md"),
        format!("---\nname: {name}\ndescription: test skill\n---\n\n# {name}\n"),
    )
    .expect("SKILL.md");
    for (path, contents) in extra {
        let target = dir.join(path);
        fs::create_dir_all(target.parent().expect("parent")).expect("nested");
        fs::write(target, contents).expect("extra");
    }
}

fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let root = dir.path().join("repo");
    fs::create_dir_all(&home).expect("home");
    fs::create_dir_all(&root).expect("root");
    (dir, home, root)
}

fn home<'a>(root: &'a Path, home: &'a Path) -> SkillHome<'a> {
    SkillHome { root, home }
}

#[tokio::test]
async fn folder_import_lists_and_project_overrides_global() {
    let (dir, home_dir, root) = setup();
    let store = EventStore::in_memory().await.expect("store");
    let source = dir.path().join("source/pdf");
    write_skill(&source, "pdf", &[("reference.md", "# reference")]);

    let imported = import_folder(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        Some("pdf"),
        &source,
    )
    .await
    .expect("import");
    assert_eq!(imported.name, "pdf");
    assert!(!imported.requires_trust);
    assert_eq!(imported.source.origin, SkillOrigin::Folder);

    let project_source = dir.path().join("source/pdf-project");
    write_skill(
        &project_source,
        "pdf",
        &[("reference.md", "# project reference")],
    );
    import_folder(
        &store,
        home(&root, &home_dir),
        Scope::Workspace,
        Some("pdf"),
        &project_source,
    )
    .await
    .expect("project import");

    let listed = skills::list(&store, home(&root, &home_dir))
        .await
        .expect("list");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].scope, Scope::Workspace);
}

#[tokio::test]
async fn zip_script_detection_and_trust_gate() {
    let (_dir, home_dir, root) = setup();
    let store = EventStore::in_memory().await.expect("store");

    let scripted = zip_bytes(&[
        ("SKILL.md", "---\nname: scripted\n---\n"),
        ("run.sh", "echo hi"),
    ]);
    let imported = import_zip(&store, home(&root, &home_dir), Scope::Global, &scripted)
        .await
        .expect("import");
    assert_eq!(imported.name, "scripted");
    assert!(imported.requires_trust);
    assert!(!imported.trusted);

    let trusted = skills::trust(&store, home(&root, &home_dir), Scope::Global, "scripted")
        .await
        .expect("trust");
    assert!(trusted.trusted);

    let plain = zip_bytes(&[
        ("SKILL.md", "---\nname: plain\n---\n"),
        ("notes.md", "text"),
    ]);
    let imported = import_zip(&store, home(&root, &home_dir), Scope::Global, &plain)
        .await
        .expect("import");
    assert!(!imported.requires_trust);

    let disabled = skills::set_enabled(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        "plain",
        false,
    )
    .await
    .expect("disable");
    assert!(!disabled.enabled);
    let listed = skills::list(&store, home(&root, &home_dir))
        .await
        .expect("list");
    let plain = listed
        .iter()
        .find(|skill| skill.name == "plain")
        .expect("plain");
    assert!(!plain.enabled);
}

#[tokio::test]
async fn malicious_archives_are_rejected() {
    let (_dir, home_dir, root) = setup();
    let store = EventStore::in_memory().await.expect("store");

    let traversal = tar_bytes(&[
        ("SKILL.md", "---\nname: evil\n---\n", None),
        ("../evil.md", "escape", None),
    ]);
    let error = import_tarball(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        &traversal,
        None,
        lockfile_source(),
        None,
    )
    .await
    .expect_err("traversal");
    assert!(matches!(error, SyncError::UnsafeArchive(_)));

    let absolute = tar_bytes(&[("/abs.md", "escape", None)]);
    let error = import_tarball(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        &absolute,
        None,
        lockfile_source(),
        None,
    )
    .await
    .expect_err("absolute");
    assert!(matches!(error, SyncError::UnsafeArchive(_)));

    let symlink = tar_bytes(&[("SKILL.md", "---\nname: link\n---\n", Some("link"))]);
    let error = import_tarball(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        &symlink,
        None,
        lockfile_source(),
        None,
    )
    .await
    .expect_err("symlink");
    assert!(matches!(error, SyncError::UnsafeArchive(_)));

    let mut entries: Vec<(String, String)> = Vec::new();
    for index in 0..MAX_ARCHIVE_ENTRIES + 1 {
        entries.push((format!("file-{index}.txt"), "x".to_string()));
    }
    let refs: Vec<(&str, &str)> = entries
        .iter()
        .map(|(name, body)| (name.as_str(), body.as_str()))
        .collect();
    let bomb = zip_bytes(&refs);
    let error = import_zip(&store, home(&root, &home_dir), Scope::Global, &bomb)
        .await
        .expect_err("entry cap");
    assert!(matches!(error, SyncError::UnsafeArchive(_)));
}

#[test]
fn github_spec_parsing_and_missing_git() {
    let spec = parse_github_spec("owner/repo/skills/pdf@v1").expect("parse");
    assert_eq!(spec.owner, "owner");
    assert_eq!(spec.repo, "repo");
    assert_eq!(spec.subdir.as_deref(), Some("skills/pdf"));
    assert_eq!(spec.reference.as_deref(), Some("v1"));
    assert!(parse_github_spec("nope").is_err());

    let error = resolve_remote_with("definitely-not-a-git-binary", "file:///nonexistent", None)
        .expect_err("missing git");
    assert!(matches!(error, SyncError::GitMissing));
}

#[test]
fn github_spec_url_parsing_and_normalization() {
    // Bare repo
    let url_bare = parse_github_spec("https://github.com/owner/repo").expect("bare url");
    let short_bare = parse_github_spec("owner/repo").expect("bare shorthand");
    assert_eq!(url_bare, short_bare);
    assert_eq!(url_bare.owner, "owner");
    assert_eq!(url_bare.repo, "repo");
    assert_eq!(url_bare.subdir, None);
    assert_eq!(url_bare.reference, None);

    // Bare repo with trailing slash
    let url_bare_slash =
        parse_github_spec("https://github.com/owner/repo/").expect("bare url slash");
    assert_eq!(url_bare_slash, short_bare);

    // Bare repo with .git
    let url_bare_git =
        parse_github_spec("https://github.com/owner/repo.git").expect("bare url git");
    assert_eq!(url_bare_git, short_bare);

    // Tree main
    let url_tree = parse_github_spec("https://github.com/owner/repo/tree/main").expect("tree main");
    let short_tree = parse_github_spec("owner/repo@main").expect("short main");
    assert_eq!(url_tree, short_tree);
    assert_eq!(url_tree.owner, "owner");
    assert_eq!(url_tree.repo, "repo");
    assert_eq!(url_tree.subdir, None);
    assert_eq!(url_tree.reference.as_deref(), Some("main"));

    // Tree with ref and subdir: /tree/v1/skills/x
    let url_subdir =
        parse_github_spec("https://github.com/owner/repo/tree/v1/skills/x").expect("tree subdir");
    let short_subdir = parse_github_spec("owner/repo/skills/x@v1").expect("short subdir");
    assert_eq!(url_subdir, short_subdir);
    assert_eq!(url_subdir.owner, "owner");
    assert_eq!(url_subdir.repo, "repo");
    assert_eq!(url_subdir.subdir.as_deref(), Some("skills/x"));
    assert_eq!(url_subdir.reference.as_deref(), Some("v1"));

    // Non-GitHub URL returns SyncError::UnsupportedSource
    let err_gitlab = parse_github_spec("https://gitlab.com/owner/repo").expect_err("gitlab");
    assert!(matches!(err_gitlab, SyncError::UnsupportedSource(_)));

    let err_other = parse_github_spec("https://example.com/skills/x").expect_err("other");
    assert!(matches!(err_other, SyncError::UnsupportedSource(_)));
}

#[tokio::test]
async fn github_import_records_sha_and_subdir() {
    let (dir, home_dir, root) = setup();
    let store = EventStore::in_memory().await.expect("store");

    let repo = dir.path().join("upstream");
    fs::create_dir_all(&repo).expect("repo");
    write_skill(&repo.join("skills/pdf"), "pdf", &[("reference.md", "# v1")]);
    Command::new("git")
        .args(["init", "-q"])
        .current_dir(&repo)
        .status()
        .expect("git init");
    Command::new("git")
        .args(["add", "."])
        .current_dir(&repo)
        .status()
        .expect("git add");
    Command::new("git")
        .args([
            "-c",
            "user.email=test@example.com",
            "-c",
            "user.name=test",
            "commit",
            "-qm",
            "init",
        ])
        .current_dir(&repo)
        .status()
        .expect("git commit");

    let sha = resolve_remote(&format!("file://{}", repo.display()), None).expect("sha");
    let tarball = tar_bytes(&[
        ("wrapper/skills/pdf/SKILL.md", "---\nname: pdf\n---\n", None),
        ("wrapper/skills/pdf/reference.md", "# v1", None),
    ]);
    let url = format!("https://codeload.github.com/owner/repo/tar.gz/{sha}");
    let downloader = LocalDownloader {
        files: BTreeMap::from([(url, tarball)]),
    };

    let imported = import_tarball(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        &downloader
            .get(&format!(
                "https://codeload.github.com/owner/repo/tar.gz/{sha}"
            ))
            .expect("bytes"),
        Some("skills/pdf"),
        SkillSource {
            origin: SkillOrigin::GitHub,
            repo: Some("owner/repo".into()),
            reference: None,
            subdir: Some("skills/pdf".into()),
            lock_hash: None,
            url: None,
        },
        Some(sha.clone()),
    )
    .await
    .expect("import");
    assert_eq!(imported.pinned_sha.as_deref(), Some(sha.as_str()));
    assert_eq!(imported.source.subdir.as_deref(), Some("skills/pdf"));
    assert!(Path::new(&imported.path).join("reference.md").is_file());
}

#[tokio::test]
async fn update_flow_resolves_diffs_applies_and_clears_trust() {
    let (dir, home_dir, root) = setup();
    let store = EventStore::in_memory().await.expect("store");

    let repo = dir.path().join("upstream");
    write_skill(&repo, "pdf", &[("run.sh", "echo v2"), ("notes.md", "new")]);
    git_init(&repo);
    let sha = resolve_remote(&format!("file://{}", repo.display()), None).expect("sha");

    let installed = dir.path().join("installed/pdf");
    write_skill(
        &installed,
        "pdf",
        &[("run.sh", "echo v1"), ("notes.md", "old")],
    );
    let imported = import_folder(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        Some("pdf"),
        &installed,
    )
    .await
    .expect("import");
    assert!(imported.requires_trust);
    skills::trust(&store, home(&root, &home_dir), Scope::Global, "pdf")
        .await
        .expect("trust");

    let source = SkillSource {
        origin: SkillOrigin::GitHub,
        repo: Some("owner/repo".into()),
        reference: None,
        subdir: None,
        lock_hash: None,
        url: Some(format!("file://{}", repo.display())),
    };
    let row = store
        .skill("global:pdf")
        .await
        .expect("row")
        .expect("present");
    store
        .upsert_skill(tethys_store::SkillRow {
            source: serde_json::to_string(&source).expect("json"),
            ..row
        })
        .await
        .expect("update source");

    let codeload = format!("https://codeload.github.com/owner/repo/tar.gz/{sha}");
    let downloader = LocalDownloader {
        files: BTreeMap::from([(
            codeload,
            tar_bytes(&[
                ("wrapper/SKILL.md", "---\nname: pdf\n---\n", None),
                ("wrapper/run.sh", "echo v2", None),
                ("wrapper/notes.md", "new", None),
            ]),
        )]),
    };

    let check = skills::update_check(&store, home(&root, &home_dir), Scope::Global, "pdf")
        .await
        .expect("check");
    assert!(check.update_available);
    assert_eq!(check.upstream_sha.as_deref(), Some(sha.as_str()));

    let plan = skills::update_plan(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        "pdf",
        &downloader,
    )
    .await
    .expect("plan");
    assert_eq!(plan.upstream_sha, sha);
    assert!(plan.changed_files.contains(&"run.sh".to_string()));
    assert!(plan.diff.contains("echo v2"));
    assert_eq!(
        fs::read_to_string(Path::new(&imported.path).join("notes.md")).expect("notes"),
        "old",
        "plan must not write"
    );

    let applied = skills::update_apply(
        &store,
        home(&root, &home_dir),
        Scope::Global,
        "pdf",
        &downloader,
    )
    .await
    .expect("apply");
    assert_eq!(applied.pinned_sha, sha);
    assert_eq!(
        fs::read_to_string(
            Path::new(&applied_skill_path(&store, &root, &home_dir).await).join("notes.md")
        )
        .expect("notes"),
        "new"
    );

    let listed = skills::list(&store, home(&root, &home_dir))
        .await
        .expect("list");
    let pdf = listed
        .iter()
        .find(|skill| skill.name == "pdf")
        .expect("pdf");
    assert!(!pdf.trusted, "trust is cleared by an update");
    assert_eq!(pdf.pinned_sha.as_deref(), Some(sha.as_str()));
}

async fn applied_skill_path(store: &EventStore, root: &Path, home_dir: &Path) -> String {
    let listed = skills::list(store, home(root, home_dir))
        .await
        .expect("list");
    listed
        .iter()
        .find(|skill| skill.name == "pdf")
        .expect("pdf")
        .path
        .clone()
}

fn git_init(repo: &Path) {
    for args in [
        vec!["init", "-q"],
        vec!["add", "."],
        vec![
            "-c",
            "user.email=test@example.com",
            "-c",
            "user.name=test",
            "commit",
            "-qm",
            "init",
        ],
    ] {
        let status = Command::new("git")
            .args(args)
            .current_dir(repo)
            .status()
            .expect("git");
        assert!(status.success());
    }
}

fn lockfile_source() -> SkillSource {
    SkillSource {
        origin: SkillOrigin::Lockfile,
        repo: Some("owner/repo".into()),
        reference: None,
        subdir: None,
        lock_hash: None,
        url: None,
    }
}

fn zip_bytes(entries: &[(&str, &str)]) -> Vec<u8> {
    use zip::write::SimpleFileOptions;
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, body) in entries {
        writer
            .start_file(*name, SimpleFileOptions::default())
            .expect("start file");
        use std::io::Write;
        writer.write_all(body.as_bytes()).expect("write");
    }
    writer.finish().expect("finish").into_inner()
}

fn tar_bytes(entries: &[(&str, &str, Option<&str>)]) -> Vec<u8> {
    use flate2::write::GzEncoder;
    use flate2::Compression;

    let encoder = GzEncoder::new(Vec::new(), Compression::fast());
    let mut builder = tar::Builder::new(encoder);
    for (name, body, link) in entries {
        let mut header = tar::Header::new_gnu();
        header.set_mode(0o644);
        header.set_entry_type(match link {
            Some(_) => tar::EntryType::Symlink,
            None => tar::EntryType::Regular,
        });
        let payload = link.unwrap_or(body);
        header.set_size(payload.len() as u64);
        let bytes = header.as_mut_bytes();
        bytes[..name.len()].copy_from_slice(name.as_bytes());
        header.set_cksum();
        builder.append(&header, payload.as_bytes()).expect("append");
    }
    builder.into_inner().expect("builder").finish().expect("gz")
}

#[test]
fn lockfiles_are_read_only_and_map_provenance() {
    let (dir, home_dir, root) = setup();
    let lock_path = root.join("skills-lock.json");
    fs::write(
        &lock_path,
        r#"{
  "version": 1,
  "skills": {
    "tauri-v2": {
      "source": "nodnarbnitram/claude-code-extensions",
      "sourceType": "github",
      "skillPath": ".claude/skills/tauri-v2/SKILL.md",
      "computedHash": "abc"
    },
    "local-thing": {
      "source": "/tmp/local",
      "sourceType": "local",
      "skillPath": "local-thing/SKILL.md",
      "computedHash": "def"
    }
  }
}"#,
    )
    .expect("lock");
    let before = fs::read(&lock_path).expect("read lock");

    let state_home = dir.path().join("state");
    let global_lock = state_home.join("skills").join(".skill-lock.json");
    fs::create_dir_all(global_lock.parent().expect("parent")).expect("dirs");
    fs::write(
        &global_lock,
        r#"{
  "version": 3,
  "skills": {
    "rust-best-practices": {
      "sourceUrl": "https://github.com/apollographql/skills",
      "ref": "main",
      "skillFolderHash": "xyz"
    }
  }
}"#,
    )
    .expect("global lock");
    std::env::set_var("XDG_STATE_HOME", &state_home);

    let candidates = scan_lockfiles(&root, &home_dir).expect("scan");
    assert_eq!(fs::read(&lock_path).expect("reread"), before);

    let tauri = candidates
        .iter()
        .find(|candidate| candidate.name == "tauri-v2")
        .expect("tauri");
    assert_eq!(
        tauri.source.repo.as_deref(),
        Some("nodnarbnitram/claude-code-extensions")
    );
    assert_eq!(
        tauri.source.subdir.as_deref(),
        Some(".claude/skills/tauri-v2")
    );
    assert!(tauri.supported);
    assert!(!tauri.installed);

    let local = candidates
        .iter()
        .find(|candidate| candidate.name == "local-thing")
        .expect("local");
    assert!(!local.supported);

    let global = candidates
        .iter()
        .find(|candidate| candidate.name == "rust-best-practices")
        .expect("global");
    assert_eq!(global.source.repo.as_deref(), Some("apollographql/skills"));
    assert_eq!(global.source.reference.as_deref(), Some("main"));
    assert_eq!(global.source.lock_hash.as_deref(), Some("xyz"));
    drop(dir);
}

#[tokio::test]
#[ignore = "manual real-network test"]
async fn real_network_github_skill_import() {
    let (_dir, home_dir, root) = setup();
    let store = EventStore::in_memory().await.expect("store");
    // Public repository test with GitHub URL format
    let res = tethys_sync::skill_import::import_github(
        &store,
        home(&root, &home_dir),
        Scope::Workspace,
        "https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo",
    )
    .await;
    println!("Real-network import result: {res:?}");
}
