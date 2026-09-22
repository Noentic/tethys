import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { removeFromDefaultClient } = vi.hoisted(() => ({
  removeFromDefaultClient: vi.fn(async () => {}),
}));

vi.mock("@tethys/client", () => ({
  createClient: () => ({
    workspace: { remove: removeFromDefaultClient },
  }),
}));

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

  // The settings route mounts this with no client; Revoke must still write.
  it("revokes through the real client when none is injected", async () => {
    removeFromDefaultClient.mockClear();
    render(
      <TrustedFolders
        folders={[
          { id: "tethys", path: "~/Code/tethys", vcs: { kind: "git-local" } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(removeFromDefaultClient).toHaveBeenCalledWith("tethys"),
    );
  });

  it("keeps the row and reports a failed revoke", async () => {
    render(
      <TrustedFolders
        client={client(vi.fn(async () => Promise.reject(new Error("denied"))))}
        folders={[
          { id: "tethys", path: "~/Code/tethys", vcs: { kind: "git-local" } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "denied",
    );
    expect(screen.getByTestId("trusted-folder-row")).toBeTruthy();
  });
});
