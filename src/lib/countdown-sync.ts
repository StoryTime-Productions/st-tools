// Tells every open countdown alarm to reload after a change: this tab through a window event, other tabs through BroadcastChannel.
export const COUNTDOWN_CHANNEL = "st-countdowns";
export const COUNTDOWNS_CHANGED = "st-countdowns-changed";

export function notifyCountdownsChanged() {
  window.dispatchEvent(new Event(COUNTDOWNS_CHANGED));
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(COUNTDOWN_CHANNEL);
  channel.postMessage({ type: "changed" });
  channel.close();
}
