import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ProjectCover } from "@/app/hub/_components/project-cover";

describe("ProjectCover", () => {
  it("shows the image and falls back to initials when it fails to load", () => {
    const { container } = render(
      <ProjectCover title="St Tools" coverImageUrl="https://example.com/broken.png" />
    );

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "https://example.com/broken.png");

    fireEvent.error(image!);

    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("ST");
  });

  it("shows initials without a cover", () => {
    const { container } = render(<ProjectCover title="Art Pipeline" coverImageUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("AP");
  });
});
