// One owner of document.title: a running Pomodoro wins over a countdown, which wins over the page's own title.
export type TabTitleSource = "pomodoro" | "countdown";

const titles: Record<TabTitleSource, string | null> = { pomodoro: null, countdown: null };
const listeners = new Set<() => void>();

export function setTabTitle(source: TabTitleSource, title: string | null) {
  if (titles[source] === title) return;
  titles[source] = title;
  listeners.forEach((listener) => listener());
}

export function currentTabTitle() {
  return titles.pomodoro ?? titles.countdown;
}

export function subscribeTabTitle(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
