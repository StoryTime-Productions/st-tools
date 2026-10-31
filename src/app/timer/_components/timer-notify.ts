import { readTimerPrefs } from "./timer-prefs";

function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// Must be called from a user gesture. Resolves true only when the browser granted permission.
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSupported()) {
    return false;
  }

  try {
    if (Notification.permission === "granted") {
      return true;
    }
    if (Notification.permission === "denied") {
      return false;
    }
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notifyPhaseComplete(title: string, body: string) {
  if (!isSupported() || !readTimerPrefs().notificationsEnabled) {
    return;
  }

  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body, tag: "timer-phase-complete" });
    }
  } catch {
    // Some browsers only allow notifications via a service worker; ignore.
  }
}
