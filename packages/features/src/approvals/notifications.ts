//! OS notifications for the "waiting on you" inbox (M1.8 UI-03).
//!
//! A pure decision plus a thin adapter: one notification per newly-appeared
//! pending item, only while the window is unfocused. The plugin is imported
//! lazily so a test or a non-Tauri environment never loads it.

export interface PendingApprovalNotification {
  title: string;
  body: string;
}

/** One notification for `newItems` newly pending approvals. */
export function pendingApprovalNotification(
  newItems: number,
  totalPending: number,
): PendingApprovalNotification | null {
  if (newItems <= 0) {
    return null;
  }
  return {
    title: newItems === 1 ? "Approval needed" : `${newItems} approvals needed`,
    body:
      totalPending === 1
        ? "1 request is waiting on you."
        : `${totalPending} requests are waiting on you.`,
  };
}

/** Notifications fire only for growth, and only while the window is blurred. */
export function shouldNotify(
  previousCount: number,
  nextCount: number,
  windowFocused: boolean,
): boolean {
  return !windowFocused && nextCount > previousCount;
}

/** True when a session moved out of `running` into a settled state. */
export function isTurnComplete(
  previous: string | undefined,
  next: string,
): boolean {
  return previous === "running" && (next === "idle" || next === "error");
}

/** One notification for a finished turn; the body names the thread. */
export function turnCompletionNotification(
  title: string,
): PendingApprovalNotification {
  return { title: "Turn complete", body: `${title} finished its turn.` };
}

export async function sendOsNotification(
  notification: PendingApprovalNotification,
): Promise<void> {
  try {
    const plugin = await import("@tauri-apps/plugin-notification");
    if (!(await plugin.isPermissionGranted())) {
      await plugin.requestPermission();
    }
    plugin.sendNotification({
      title: notification.title,
      body: notification.body,
    });
  } catch {
    // Outside Tauri (tests, browser preview) notifications are a no-op.
  }
}
