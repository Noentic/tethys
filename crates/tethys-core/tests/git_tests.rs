use std::fs;
use std::process::Command;
use tethys_core::git::GitEngine;

struct AutoCleanDir(std::path::PathBuf);
impl Drop for AutoCleanDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn test_worktree_checkpoint_and_diff_restoration() {
    let tmp_repo = std::env::temp_dir().join(format!("tethys_git_test_{}", std::process::id()));
    if tmp_repo.exists() {
        let _ = fs::remove_dir_all(&tmp_repo);
    }
    fs::create_dir_all(tmp_repo.join("pkg")).expect("create temp repo dir");
    let _cleaner = AutoCleanDir(tmp_repo.clone());

    // 1. Git init and config
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["init", "-q"])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["config", "user.name", "Tethys Test"])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["config", "user.email", "test@tethys.dev"])
        .status()
        .unwrap()
        .success());

    // 2. Initial files & commit
    let file1 = tmp_repo.join("pkg/file1.txt");
    let file2 = tmp_repo.join("pkg/file2.txt");
    fs::write(&file1, "initial file 1\n").unwrap();
    fs::write(&file2, "initial file 2\n").unwrap();

    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["add", "-A"])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["commit", "-q", "-m", "initial commit"])
        .status()
        .unwrap()
        .success());

    // 3. Agent turn modifications
    fs::write(&file1, "modified file 1\n").unwrap();
    let new_file = tmp_repo.join("pkg/new_file.txt");
    fs::write(&new_file, "brand new content\n").unwrap();

    let changed = vec!["pkg/file1.txt".to_string(), "pkg/new_file.txt".to_string()];

    // 4. Create checkpoint
    let res = GitEngine::create_checkpoint(
        &tmp_repo,
        "thread_functional_test",
        1,
        None,
        Some(&changed),
    )
    .expect("create_checkpoint failed");

    assert!(!res.commit_oid.is_empty());

    // 5. Verify diff
    let diff = GitEngine::get_checkpoint_diff(&tmp_repo, "HEAD", &res.commit_oid)
        .expect("get diff failed");
    assert!(diff.contains("modified file 1"));
    assert!(diff.contains("new_file.txt"));

    // 6. Restore to HEAD
    GitEngine::restore_checkpoint(&tmp_repo, "HEAD").expect("restore to HEAD failed");
    assert_eq!(
        fs::read_to_string(&file1).unwrap().trim_end(),
        "initial file 1"
    );
}
