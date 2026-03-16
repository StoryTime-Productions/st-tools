import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

describe("Avatar", () => {
  it("renders avatar container", () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.jpg" alt="John" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );

    const avatarSpan = container.querySelector("[data-slot='avatar']");
    expect(avatarSpan).toBeDefined();
  });

  it("shows fallback when image is not provided", () => {
    render(
      <Avatar>
        <AvatarImage src="" alt="Test" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );

    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("renders fallback text with styling", () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/pic.jpg" alt="User Avatar" />
        <AvatarFallback>UA</AvatarFallback>
      </Avatar>
    );

    const fallback = container.querySelector("[data-slot='avatar-fallback']");
    expect(fallback).toBeInTheDocument();
    expect(screen.getByText("UA")).toBeInTheDocument();
  });

  it("renders avatar without image source", () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
    );

    expect(container).toBeInTheDocument();
    expect(screen.getByText("CD")).toBeInTheDocument();
  });
});
