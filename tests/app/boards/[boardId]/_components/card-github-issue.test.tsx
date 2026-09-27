import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardGithubIssue } from "@/app/boards/[boardId]/_components/card-github-issue";

const ISSUE = { url: "https://github.com/org/repo/issues/3", label: "repo#3", state: null };

describe("CardGithubIssue", () => {
  it("links an issue from a pasted URL and keeps the draft on failure", async () => {
    const onSet = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<CardGithubIssue issue={null} isPending={false} onSet={onSet} />);
    const input = screen.getByLabelText("GitHub issue URL");

    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSet).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: " https://github.com/org/repo/issues/3 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSet).toHaveBeenCalledWith("https://github.com/org/repo/issues/3"));
    expect(input).toHaveValue(" https://github.com/org/repo/issues/3 ");

    fireEvent.keyDown(input, { key: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("shows the linked issue with its state and unlinks it", () => {
    const onSet = vi.fn().mockResolvedValue(true);
    const { rerender } = render(<CardGithubIssue issue={ISSUE} isPending={false} onSet={onSet} />);

    expect(screen.getByRole("link", { name: "repo#3" })).toHaveAttribute("href", ISSUE.url);
    expect(screen.queryByText("Open")).not.toBeInTheDocument();

    rerender(
      <CardGithubIssue issue={{ ...ISSUE, state: "open" }} isPending={false} onSet={onSet} />
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
    rerender(
      <CardGithubIssue issue={{ ...ISSUE, state: "closed" }} isPending={false} onSet={onSet} />
    );
    expect(screen.getByText("Closed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unlink GitHub issue" }));
    expect(onSet).toHaveBeenCalledWith(null);
  });
});
