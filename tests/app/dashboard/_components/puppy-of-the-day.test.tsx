import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PuppyOfTheDayCard } from "@/app/dashboard/_components/puppy-of-the-day";

const CACHE_KEY = "st-tools-puppy-of-the-day-v1";
const FALLBACK_IMAGE_URL = "https://images.dog.ceo/breeds/retriever-golden/n02099601_3004.jpg";

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string; className?: string }) => (
    <div role="img" aria-label={props.alt} data-src={props.src} className={props.className} />
  ),
}));

describe("PuppyOfTheDayCard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("uses today's cached puppy image when available", async () => {
    const today = new Date().toISOString().slice(0, 10);

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        day: today,
        imageUrl: "https://example.com/cached-puppy.jpg",
      })
    );

    render(<PuppyOfTheDayCard />);

    await waitFor(() => {
      const image = screen.getByRole("img", { name: "Puppy of the day" });
      expect(image).toHaveAttribute("data-src", "https://example.com/cached-puppy.jpg");
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches and caches a new puppy image when cache is missing", async () => {
    const today = new Date().toISOString().slice(0, 10);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "success",
        message: "https://example.com/fetched-puppy.jpg",
      }),
    } as Response);

    render(<PuppyOfTheDayCard />);

    await waitFor(() => {
      const image = screen.getByRole("img", { name: "Puppy of the day" });
      expect(image).toHaveAttribute("data-src", "https://example.com/fetched-puppy.jpg");
    });

    const cached = localStorage.getItem(CACHE_KEY);
    expect(cached).toContain(today);
    expect(cached).toContain("https://example.com/fetched-puppy.jpg");
  });

  it("falls back to default image when puppy service fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);

    render(<PuppyOfTheDayCard />);

    await waitFor(() => {
      const image = screen.getByRole("img", { name: "Puppy of the day" });
      expect(image).toHaveAttribute("data-src", FALLBACK_IMAGE_URL);
    });
  });
});
