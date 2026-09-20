import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrustedFolders, type TrustedFoldersClient } from "./trusted-folders";

function client(remove = vi.fn(async () => {})): TrustedFoldersClient {
  return { workspace: { remove } };
}

describe("trusted-folders", () => {
  it("renders a row per trusted folder", () => {
    render(
      <TrustedFolders
        client={client()}
        folders={[
          {
            id: "tethys",
            path: "~/Code/tethys",
            vcs: { kind: "git-remote", host: "github" },
            permissionMode: "supervised",
            trustedAt: "2026-09-17",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("trusted-folder-row")).toBeTruthy();
    expect(screen.getByText("Git · GitHub")).toBeTruthy();
  });

  it("revokes through workspace.remove and drops the row", async () => {
    const remove = vi.fn(async () => {});
    render(
      <TrustedFolders
        client={client(remove)}
        folders={[
          {
            id: "tethys",
            path: "~/Code/tethys",
            vcs: { kind: "git-local" },
            permissionMode: "supervised",
            trustedAt: "2026-09-17",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke Trust" }));
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith("tethys");
      expect(screen.queryByTestId("trusted-folder-row")).toBeNull();
    });
  });
});
