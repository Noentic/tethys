//! `git.*` client namespace. Wave 2 owner: B (M1.9 review surface).

import type {
  CheckpointInfo,
  CheckpointPhase,
  CheckpointResult,
  CommitResult,
  DiffFileDetail,
  DiffSource,
  DiffSummary,
  HunkRef,
  RestoreOutcome,
  RestorePolicy,
  RestoreTarget,
  WorktreeInfo,
  WorktreeSpec,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function gitNamespace(call: Call) {
  return {
    worktreeCreate: (spec: WorktreeSpec) =>
      call<WorktreeInfo>("git_worktree_create", { spec }),
    worktree_create: (spec: WorktreeSpec) =>
      call<WorktreeInfo>("git_worktree_create", { spec }),
    worktreeRemove: (threadId: string, force = false, leased = false) =>
      call<void>("git_worktree_remove", { threadId, force, leased }),
    worktree_remove: (threadId: string, force = false, leased = false) =>
      call<void>("git_worktree_remove", { threadId, force, leased }),
    worktreeList: () => call<WorktreeInfo[]>("git_worktree_list"),
    worktree_list: () => call<WorktreeInfo[]>("git_worktree_list"),
    worktreeArchive: (threadId: string) =>
      call<void>("git_worktree_archive", { threadId }),
    worktree_archive: (threadId: string) =>
      call<void>("git_worktree_archive", { threadId }),
    checkpointCreate: (
      threadId: string,
      turn: number,
      phase: CheckpointPhase,
    ) =>
      call<CheckpointResult>("git_checkpoint_create", {
        threadId,
        turn,
        phase,
      }),
    checkpoint_create: (
      threadId: string,
      turn: number,
      phase: CheckpointPhase,
    ) =>
      call<CheckpointResult>("git_checkpoint_create", {
        threadId,
        turn,
        phase,
      }),
    checkpointRestore: (target: RestoreTarget, policy?: RestorePolicy) =>
      call<RestoreOutcome>("git_checkpoint_restore", { target, policy }),
    checkpoint_restore: (target: RestoreTarget, policy?: RestorePolicy) =>
      call<RestoreOutcome>("git_checkpoint_restore", { target, policy }),
    checkpointList: (threadId: string) =>
      call<CheckpointInfo[]>("git_checkpoint_list", { threadId }),
    checkpoint_list: (threadId: string) =>
      call<CheckpointInfo[]>("git_checkpoint_list", { threadId }),
    diffSummary: (source: DiffSource) =>
      call<DiffSummary>("git_diff_summary", { source }),
    diff_summary: (source: DiffSource) =>
      call<DiffSummary>("git_diff_summary", { source }),
    diffFile: (source: DiffSource, path: string) =>
      call<DiffFileDetail>("git_diff_file", { source, path }),
    diff_file: (source: DiffSource, path: string) =>
      call<DiffFileDetail>("git_diff_file", { source, path }),
    stage: (threadId: string, paths: string[]) =>
      call<void>("git_stage", { threadId, paths }),
    unstage: (threadId: string, paths: string[]) =>
      call<void>("git_unstage", { threadId, paths }),
    discard: (threadId: string, source: DiffSource, hunks?: HunkRef[]) =>
      call<void>("git_discard", { threadId, source, hunks }),
    commit: (threadId: string, message: string) =>
      call<CommitResult>("git_commit", { threadId, message }),
    merge: () => call<void>("git_merge"),
    push: () => call<void>("git_push"),
    prCreate: () => call<void>("git_pr_create"),
    pr_create: () => call<void>("git_pr_create"),
  };
}
