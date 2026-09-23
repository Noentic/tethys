import type {
  CommitResult,
  DiffFileDetail,
  DiffSource,
  DiffSummary,
  ExpandedCommand,
  HunkRef,
  RestoreOutcome,
  RestorePolicy,
  RestoreTarget,
  WorktreeInfo,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import { createContext, type ReactNode, useContext } from "react";

/**
 * The narrow slice of the client the review surface needs. The panel reads it
 * from context so tests inject a fake and assert the exact `git.*` calls; the
 * default is the real transport-backed client.
 */
export interface ReviewClient {
  git: {
    diffSummary(source: DiffSource): Promise<DiffSummary>;
    worktreeList?(): Promise<WorktreeInfo[]>;
    diffFile(source: DiffSource, path: string): Promise<DiffFileDetail>;
    stage(threadId: string, paths: string[]): Promise<void>;
    unstage(threadId: string, paths: string[]): Promise<void>;
    discard(
      threadId: string,
      source: DiffSource,
      hunks?: HunkRef[],
    ): Promise<void>;
    commit(threadId: string, message: string): Promise<CommitResult>;
    checkpointRestore(
      target: RestoreTarget,
      policy?: RestorePolicy,
    ): Promise<RestoreOutcome>;
  };
  commands?: {
    expand(
      command: string,
      argsText?: string,
      workspaceId?: string,
    ): Promise<ExpandedCommand>;
  };
}

const realClient = createClient() as unknown as ReviewClient;

const ReviewClientContext = createContext<ReviewClient>(realClient);

export function ReviewClientProvider({
  client,
  children,
}: {
  client: ReviewClient;
  children: ReactNode;
}) {
  return (
    <ReviewClientContext.Provider value={client}>
      {children}
    </ReviewClientContext.Provider>
  );
}

export function useReviewClient(): ReviewClient {
  return useContext(ReviewClientContext);
}
