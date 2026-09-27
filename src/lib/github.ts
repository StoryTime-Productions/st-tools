const ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\/?$/i;

export type GithubIssueState = "open" | "closed";

export interface GithubIssueRef {
  url: string;
  label: string;
  state: GithubIssueState | null;
}

export function parseGithubIssueUrl(url: string) {
  const match = ISSUE_URL.exec(url.trim());
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null;
}

export function githubIssueRef(url: string | null): GithubIssueRef | null {
  const issue = url ? parseGithubIssueUrl(url) : null;
  if (!url || !issue) return null;
  return { url, label: `${issue.repo}#${issue.number}`, state: null };
}

// ponytail: anonymous GitHub API (60/h per IP), public repos only; add a GITHUB_TOKEN if limits bite.
export async function fetchGithubIssueState(url: string): Promise<GithubIssueState | null> {
  const issue = parseGithubIssueUrl(url);
  if (!issue) return null;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`,
      { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: 300 } }
    );
    if (!response.ok) return null;
    const { state } = (await response.json()) as { state?: string };
    return state === "closed" ? "closed" : state === "open" ? "open" : null;
  } catch {
    return null;
  }
}
