import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forwardRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AvatarForm } from "@/app/settings/profile/_components/avatar-form";

const actionMocks = vi.hoisted(() => ({
  updateAvatarAction: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

let nextImageShouldFail = false;

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 640;
  naturalHeight = 480;
  private listeners: Record<string, Array<() => void>> = {};

  addEventListener(type: string, listener: () => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }

    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: () => void) {
    const current = this.listeners[type];
    if (!current) {
      return;
    }

    this.listeners[type] = current.filter((entry) => entry !== listener);
  }

  private emit(type: "load" | "error") {
    const callbacks = this.listeners[type] ?? [];
    callbacks.forEach((callback) => callback());
  }

  set src(_value: string) {
    Promise.resolve().then(() => {
      if (nextImageShouldFail) {
        this.emit("error");
        this.onerror?.();
      } else {
        this.emit("load");
        this.onload?.();
      }
    });
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("next/image", () => ({
  default: forwardRef<
    HTMLDivElement,
    {
      alt: string;
      src: string;
      width: number;
      height: number;
      className?: string;
      style?: React.CSSProperties;
      draggable?: boolean;
      unoptimized?: boolean;
    }
  >(function MockNextImage({ alt, src, unoptimized, ...props }, ref) {
    return (
      <div
        ref={ref}
        role="img"
        aria-label={alt}
        data-src={src}
        data-unoptimized={unoptimized ? "true" : "false"}
        {...props}
      />
    );
  }),
}));

vi.mock("@/app/actions/profile", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));

describe("AvatarForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextImageShouldFail = false;

    actionMocks.updateAvatarAction.mockResolvedValue({ success: true });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:preview-avatar"),
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    vi.stubGlobal("Image", MockImage);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders fallback avatar initials when no image is selected", () => {
    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    expect(screen.getByText("NP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload avatar" })).toBeDisabled();
  });

  it("loads selected image, enables zoom, and allows clearing selection", async () => {
    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    const fileInput = screen.getByLabelText("Choose image");
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByRole("img", {
        name: "Avatar crop preview",
      })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload avatar" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();
    });
  });

  it("resets selection when input is cleared", async () => {
    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    const fileInput = screen.getByLabelText("Choose image");
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByRole("img", { name: "Avatar crop preview" })).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [] } });

    await waitFor(() => {
      expect(screen.queryByRole("img", { name: "Avatar crop preview" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload avatar" })).toBeDisabled();
    });
  });

  it("revokes previous preview when selecting a second file", async () => {
    const createObjectURLMock = vi
      .mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:first-preview")
      .mockReturnValueOnce("blob:second-preview");

    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    const fileInput = screen.getByLabelText("Choose image");
    const firstFile = new File(["first"], "first.png", { type: "image/png" });
    const secondFile = new File(["second"], "second.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [firstFile] } });
    await screen.findByRole("img", { name: "Avatar crop preview" });

    fireEvent.change(fileInput, { target: { files: [secondFile] } });

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledTimes(2);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first-preview");
    });
  });

  it("supports dragging crop preview and submits avatar updates", async () => {
    const originalCreateElement = document.createElement.bind(document);
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(["avatar"], { type: "image/jpeg" }));
    });

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({ drawImage })),
          toBlob,
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
    }) as typeof document.createElement);

    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose image"), {
      target: { files: [file] },
    });

    const previewImage = await screen.findByRole("img", {
      name: "Avatar crop preview",
    });
    const cropArea = previewImage.parentElement as HTMLDivElement;

    cropArea.setPointerCapture = vi.fn();
    cropArea.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(cropArea, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(cropArea, { pointerId: 1, clientX: 120, clientY: 115 });
    fireEvent.pointerUp(cropArea, { pointerId: 1, clientX: 120, clientY: 115 });

    expect(cropArea.setPointerCapture).toHaveBeenCalledWith(1);
    expect(cropArea.releasePointerCapture).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Upload avatar" }));

    await waitFor(() => {
      expect(actionMocks.updateAvatarAction).toHaveBeenCalledTimes(1);
      expect(toastMocks.success).toHaveBeenCalledWith("Avatar updated");
      expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
    });

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(1);

    const formData = actionMocks.updateAvatarAction.mock.calls[0][0] as FormData;
    const uploadedAvatar = formData.get("avatar") as File;
    expect(uploadedAvatar).toBeInstanceOf(File);
    expect(uploadedAvatar.name).toBe("avatar.jpg");
  });

  it("falls back to original file when canvas export returns null", async () => {
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({ drawImage: vi.fn() })),
          toBlob: vi.fn((callback: BlobCallback) => callback(null)),
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
    }) as typeof document.createElement);

    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose image"), {
      target: { files: [file] },
    });

    await screen.findByRole("img", {
      name: "Avatar crop preview",
    });

    fireEvent.click(screen.getByRole("button", { name: "Upload avatar" }));

    await waitFor(() => {
      expect(actionMocks.updateAvatarAction).toHaveBeenCalledTimes(1);
    });

    const formData = actionMocks.updateAvatarAction.mock.calls[0][0] as FormData;
    const uploadedAvatar = formData.get("avatar") as File;
    expect(uploadedAvatar).toBeInstanceOf(File);
    expect(uploadedAvatar.name).toBe("avatar.png");
  });

  it("shows upload failure and keeps selection when action returns error", async () => {
    actionMocks.updateAvatarAction.mockResolvedValueOnce({ error: "Upload failed" });

    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose image"), {
      target: { files: [file] },
    });

    await screen.findByRole("img", {
      name: "Avatar crop preview",
    });

    fireEvent.click(screen.getByRole("button", { name: "Upload avatar" }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Upload failed");
    });

    expect(screen.getByLabelText("Zoom")).toBeInTheDocument();
  });

  it("handles image decoding failures and resets file selection", async () => {
    nextImageShouldFail = true;

    render(<AvatarForm avatarUrl={null} displayName="Nirav Patel" />);

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose image"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Could not load the selected image");
    });

    expect(
      screen.queryByRole("img", {
        name: "Avatar crop preview",
      })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload avatar" })).toBeDisabled();
  });
});
