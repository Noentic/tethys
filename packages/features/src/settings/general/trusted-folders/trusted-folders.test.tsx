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
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith("tethys");
      expect(screen.queryByTestId("trusted-folder-row")).toBeNull();
    });
  });
});
