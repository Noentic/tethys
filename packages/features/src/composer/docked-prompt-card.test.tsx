import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ConfigOption } from "@tethys/bindings";
import {
  COMPOSER_INSERT_CHIP_EVENT,
  type EditorChip,
  type EditorHandle,
} from "@tethys/composer";
import {
  cancelPhaseFixtures,
  clearAllSessionStoresForTesting,
  getOrCreateSessionStore,
  type SessionState,
  sessionReducer,
} from "@tethys/state";
import { clearRegistriesForTesting } from "@tethys/ui";
import { createRef } from "react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  type DockedComposerClient,
  DockedPromptCard,
} from "./docked-prompt-card";

if (typeof Range !== "undefined") {
  Object.assign(Range.prototype, {
    getClientRects: () => [] as unknown as DOMRectList,
    getBoundingClientRect: () => new DOMRect(),
  });
}
if (typeof Element !== "undefined") {
  Object.assign(Element.prototype, {
    getClientRects: () => [] as unknown as DOMRectList,
  });
}

const SESSION = "s-docked";

function option(
  id: string,
  category: string,
  values: Array<[string, string]>,
  current: string,
): ConfigOption {
  return {
    id,
    name: id,
    description: null,
    current_value: current,
    values: values.map(([valueId]) => valueId),
    category,
    kind: "select",
    value_options: values.map(([valueId, name]) => ({
      id: valueId,
      name,
      description: null,
    })),
  };
}

const model = option(
  "model",
  "model",
  [
    ["sonnet", "Sonnet"],
    ["opus", "Opus"],
  ],
  "sonnet",
);
const effort = option(
  "thought_level",
  "thought_level",
  [
    ["low", "Low"],
    ["high", "High"],
  ],
  "low",
);

// The whole client slice, with every `thread` call exposed as a mock.
type FakeClient = Omit<DockedComposerClient, "thread"> & {
  thread: Record<
    | "prompt"
    | "cancel"
    | "setConfigOption"
    | "queueList"
    | "queueAdd"
    | "queueRemove"
    | "queueReorder",
    Mock
  >;
};

function fakeClient(): FakeClient {
  let queued = 0;
  return {
    commands: {
      list: vi.fn().mockResolvedValue([]),
      expand: vi.fn().mockResolvedValue({ text: "", references: [] }),
    },
    search: { files: vi.fn().mockResolvedValue([]) },
    thread: {
      prompt: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      setConfigOption: vi.fn().mockResolvedValue(undefined),
      queueList: vi.fn().mockResolvedValue([]),
      queueAdd: vi.fn().mockImplementation(async (_id, blocks) => {
        queued += 1;
        return { id: `q${queued}`, blocks };
      }),
      queueRemove: vi.fn().mockResolvedValue(undefined),
      queueReorder: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function seed(patch: Partial<SessionState>) {
  getOrCreateSessionStore(SESSION, "claude-code", "ws-1").setState((prev) => ({
    ...prev,
    ...patch,
  }));
}

function setup(client = fakeClient()) {
  const editorRef = createRef<EditorHandle>();
  render(
    <DockedPromptCard
      sessionId={SESSION}
      client={client as unknown as DockedComposerClient}
      editorRef={editorRef}
    />,
  );
  return { client, editorRef };
}

function type(editorRef: React.RefObject<EditorHandle | null>, text: string) {
  act(() => editorRef.current?.setText(text));
}

function submitWithKeyboard() {
  const editor = document.querySelector(".ProseMirror") as HTMLElement;
  fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
}

describe("docked prompt card", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
    seed({ status: "idle", configOptions: [model, effort] });
  });

  it("sends exactly once on Ctrl/Cmd+Enter while idle, then clears the editor", async () => {
    const { client, editorRef } = setup();
    type(editorRef, "Fix the bug");
    submitWithKeyboard();

    await waitFor(() => expect(client.thread.prompt).toHaveBeenCalledTimes(1));
    expect(client.thread.prompt).toHaveBeenCalledWith(SESSION, [
      { Text: "Fix the bug" },
    ]);
    expect(client.thread.queueAdd).not.toHaveBeenCalled();
    await waitFor(() => expect(editorRef.current?.isEmpty()).toBe(true));
  });

  it("inserts a review comment chip sent from Changes", async () => {
    const { editorRef } = setup();
    await screen.findByRole("textbox", { name: "Prompt" });
    const chip: EditorChip = {
      kind: "review",
      name: "1 comment",
      token: "Review comments:\n- src/a.ts:2 — Check this path",
    };
    act(() => {
      window.dispatchEvent(
        new CustomEvent(COMPOSER_INSERT_CHIP_EVENT, { detail: chip }),
      );
    });

    await waitFor(() =>
      expect(editorRef.current?.serializeToPrompt()).toBe(chip.token),
    );
    expect(
      document.querySelector('[data-composer-chip="review"]'),
    ).toBeTruthy();
  });

  it("keeps the text and says so when the prompt is rejected", async () => {
    const client = fakeClient();
    client.thread.prompt.mockRejectedValue(new Error("thread t-1 not found"));
    const { editorRef } = setup(client);
    type(editorRef, "Keep me");
    submitWithKeyboard();

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "The prompt could not be sent.",
    );
    // Nothing the user wrote is lost.
    expect(editorRef.current?.serializeToPrompt()).toBe("Keep me");
  });

  it("does not send twice when submit fires again before the first settles", async () => {
    // Regression for the M1.10 double-submit.
    const client = fakeClient();
    let release: () => void = () => {};
    client.thread.prompt.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const { editorRef } = setup(client);
    type(editorRef, "once");
    submitWithKeyboard();
    submitWithKeyboard();
    expect(client.thread.prompt).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(editorRef.current?.isEmpty()).toBe(true));
  });

  it("sends nothing for an empty editor", () => {
    const { client } = setup();
    submitWithKeyboard();
    expect(client.thread.prompt).not.toHaveBeenCalled();
    expect(client.thread.queueAdd).not.toHaveBeenCalled();
  });

  it("disables the send button until there is text", () => {
    const { editorRef } = setup();
    expect(screen.getByText("Ask Anything…")).toBeDefined();
    const send = screen.getByRole("button", { name: "Send prompt" });
    expect(send.hasAttribute("disabled")).toBe(true);
    type(editorRef, "hello");
    expect(
      screen
        .getByRole("button", { name: "Send prompt" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  for (const status of ["running", "awaiting_approval"]) {
    it(`queues instead of sending while a turn is in flight (${status})`, async () => {
      seed({ status });
      const { client, editorRef } = setup();
      type(editorRef, "then run the tests");
      submitWithKeyboard();

      await waitFor(() =>
        expect(client.thread.queueAdd).toHaveBeenCalledTimes(1),
      );
      expect(client.thread.queueAdd).toHaveBeenCalledWith(SESSION, [
        { Text: "then run the tests" },
      ]);
      expect(client.thread.prompt).not.toHaveBeenCalled();
      const list = await screen.findByRole("list", { name: "Prompt queue" });
      expect(list.textContent).toContain("then run the tests");
    });
  }

  it("shows the activity orb on the action button while a turn runs", () => {
    seed({ status: "running", cancellationState: "idle" });
    const { client } = setup();
    expect(screen.queryByRole("button", { name: "Send prompt" })).toBeNull();
    const stop = screen.getByRole("button", { name: "Stop prompt" });
    // The orb's lattice, not a spinner glyph; the stop square is its hover face.
    expect(stop.querySelectorAll(".rounded-full.bg-current")).toHaveLength(9);
    fireEvent.click(stop);
    expect(client.thread.cancel).toHaveBeenCalledWith(SESSION);
  });

  it("offers Fork on the branch strip, outside the prompt card", () => {
    seed({
      status: "idle",
      capabilities: {
        ...(getOrCreateSessionStore(SESSION, "claude-code", "ws-1").state
          .capabilities ?? {}),
        session_fork: true,
      } as SessionState["capabilities"],
    });
    const onFork = vi.fn();
    render(
      <DockedPromptCard
        sessionId={SESSION}
        client={fakeClient() as unknown as DockedComposerClient}
        onFork={onFork}
      />,
    );
    const fork = screen.getByRole("button", { name: "Fork session" });
    expect(screen.getByTestId("branch-bar").contains(fork)).toBe(true);
    expect(screen.getByTestId("docked-prompt-card").contains(fork)).toBe(false);
    fireEvent.click(fork);
    expect(onFork).toHaveBeenCalled();
  });

  it("shows Cancelling as a neutral pending control, and Force kill only after the grace window", () => {
    seed({
      status: "running",
      cancellationState: "cancel_requested",
      graceDeadline: new Date(Date.now() + 5000).toISOString(),
    });
    const { client } = setup();
    const pending = screen.getByRole("button", { name: /Cancelling/ });
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("button", { name: /Force kill/ })).toBeNull();
    expect(client.thread.cancel).not.toHaveBeenCalled();
  });

  it("offers Force kill once the backend reports the grace window elapsed", () => {
    seed({ status: "running", cancellationState: "grace_elapsed" });
    const { client } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Force kill/ }));
    expect(client.thread.cancel).toHaveBeenCalledWith(SESSION);
  });

  it("styles Stop neutrally and never advances the ladder itself", () => {
    seed({ status: "running", cancellationState: "idle" });
    const { client } = setup();
    const stop = screen.getByRole("button", { name: "Stop prompt" });
    fireEvent.click(stop);
    expect(client.thread.cancel).toHaveBeenCalledWith(SESSION);
    // No phase originates from the client: it waits for the backend's event.
    expect(getOrCreateSessionStore(SESSION).state.cancellationState).toBe(
      "idle",
    );
  });

  it("follows the phases the backend reports, and Force kill is the destructive one", () => {
    seed({ status: "running" });
    const { client } = setup();
    const store = getOrCreateSessionStore(SESSION);

    act(() => {
      store.setState((state) =>
        sessionReducer(state, {
          type: "CancelPhaseChanged",
          body: cancelPhaseFixtures["cancel-requested"],
        }),
      );
    });
    expect(
      screen
        .getByRole("button", { name: /Cancelling/ })
        .hasAttribute("disabled"),
    ).toBe(true);

    act(() => {
      store.setState((state) =>
        sessionReducer(state, {
          type: "CancelPhaseChanged",
          body: cancelPhaseFixtures["grace-elapsed"],
        }),
      );
    });
    const forceKill = screen.getByRole("button", { name: /Force kill/ });
    expect(forceKill.className).toContain("text-(--tethys-status-danger)");
    fireEvent.click(forceKill);
    expect(client.thread.cancel).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState((state) => ({
        ...state,
        cancellationState: "terminating",
      }));
    });
    expect(
      screen.getByRole("button", { name: /Terminating \(SIGKILL\)/ }).className,
    ).toContain("text-(--tethys-status-danger)");
  });

  it("renders no footer: the action bar is gone", () => {
    setup();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  describe("config chips", () => {
    it("shows the Model and Effort chips from the Provider's options", () => {
      setup();
      expect(screen.getByText("Sonnet")).toBeDefined();
      expect(screen.getByText("Low")).toBeDefined();
    });

    it("renders no chip for a category the Provider does not declare", () => {
      seed({ configOptions: [] });
      setup();
      expect(screen.queryByText("Sonnet")).toBeNull();
      expect(screen.queryByText("Low")).toBeNull();
    });

    it("writes the choice and returns focus to the editor", async () => {
      const { client } = setup();
      fireEvent.click(screen.getByText("Sonnet"));
      fireEvent.click(screen.getByRole("option", { name: "Opus" }));

      await waitFor(() =>
        expect(client.thread.setConfigOption).toHaveBeenCalledWith(
          SESSION,
          "model",
          "opus",
        ),
      );
      await waitFor(() => {
        const editor = document.querySelector(".ProseMirror");
        expect(
          editor?.contains(document.activeElement) ||
            editor === document.activeElement,
        ).toBe(true);
      });
    });

    it("reverts the chip and names the fix when the Provider rejects the change", async () => {
      const client = fakeClient();
      client.thread.setConfigOption.mockRejectedValue(new Error("no"));
      setup(client);
      fireEvent.click(screen.getByText("Sonnet"));
      fireEvent.click(screen.getByRole("option", { name: "Opus" }));

      await waitFor(() => expect(screen.getByText("Sonnet")).toBeDefined());
      expect(
        await screen.findByText(/change this option mid-session/),
      ).toBeDefined();
    });
  });
});
