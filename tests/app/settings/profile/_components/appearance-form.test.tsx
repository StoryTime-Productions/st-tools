import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppearanceForm } from "@/app/settings/profile/_components/appearance-form";

const actionMocks = vi.hoisted(() => ({
  updateAppearanceAction: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app/actions/profile", () => actionMocks);
vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));
vi.mock("sonner", () => ({
  toast: toastMocks,
}));

function renderForm() {
  return render(
    <AppearanceForm
      initialPrimaryColor="#334155"
      initialSecondaryColor="#e2e8f0"
      initialBackgroundMode="NONE"
      initialBackgroundColor="#f4f4f5"
      initialBackgroundImageUrl={null}
      initialBackgroundImageStyle="STRETCH"
      initialBackgroundPatternScale={100}
      initialBackgroundImageOpacity={45}
    />
  );
}

function renderFormWithImage() {
  return render(
    <AppearanceForm
      initialPrimaryColor="#123456"
      initialSecondaryColor="#abcdef"
      initialBackgroundMode="IMAGE"
      initialBackgroundColor="#334455"
      initialBackgroundImageUrl="https://example.com/background.png"
      initialBackgroundImageStyle="PATTERN"
      initialBackgroundPatternScale={120}
      initialBackgroundImageOpacity={70}
    />
  );
}

describe("AppearanceForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.updateAppearanceAction.mockResolvedValue({ success: true });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:background-preview"),
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it("submits color mode settings with hex values", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Primary color hex"), {
      target: { value: "#123456" },
    });
    fireEvent.change(screen.getByLabelText("Secondary color hex"), {
      target: { value: "#abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Color" }));
    fireEvent.change(screen.getByLabelText("Background color hex"), {
      target: { value: "112233" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(actionMocks.updateAppearanceAction).toHaveBeenCalledTimes(1);
      expect(toastMocks.success).toHaveBeenCalledWith("Appearance updated");
      expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
    });

    const payload = actionMocks.updateAppearanceAction.mock.calls[0][0] as FormData;
    expect(payload.get("primaryColor")).toBe("#123456");
    expect(payload.get("secondaryColor")).toBe("#abcdef");
    expect(payload.get("backgroundMode")).toBe("COLOR");
    expect(payload.get("backgroundColor")).toBe("#112233");
    expect(payload.get("backgroundPatternScale")).toBe("100");
    expect(payload.get("backgroundImageOpacity")).toBe("45");
  });

  it("validates hex input client-side before submitting", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Primary color hex"), {
      target: { value: "not-a-hex" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Primary color must be a valid hex value");
    });

    expect(actionMocks.updateAppearanceAction).not.toHaveBeenCalled();
  });

  it("validates secondary color before submitting", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Primary color hex"), {
      target: { value: "#112233" },
    });
    fireEvent.change(screen.getByLabelText("Secondary color hex"), {
      target: { value: "bad-secondary" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Secondary color must be a valid hex value");
    });

    expect(actionMocks.updateAppearanceAction).not.toHaveBeenCalled();
  });

  it("validates background color when color mode is selected", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Color" }));
    fireEvent.change(screen.getByLabelText("Background color hex"), {
      target: { value: "not-a-color" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Background color must be a valid hex value");
    });

    expect(actionMocks.updateAppearanceAction).not.toHaveBeenCalled();
  });

  it("submits image mode with uploaded file and opacity", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.click(screen.getByRole("button", { name: "Pattern repeat" }));
    fireEvent.change(screen.getByLabelText("Background image opacity"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Background pattern scale"), {
      target: { value: "150" },
    });

    const imageFile = new File(["image-bytes"], "wallpaper.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Background image"), {
      target: { files: [imageFile] },
    });

    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(actionMocks.updateAppearanceAction).toHaveBeenCalledTimes(1);
    });

    const payload = actionMocks.updateAppearanceAction.mock.calls[0][0] as FormData;
    expect(payload.get("backgroundMode")).toBe("IMAGE");
    expect(payload.get("backgroundImageOpacity")).toBe("30");
    expect(payload.get("backgroundPatternScale")).toBe("150");
    expect(payload.get("backgroundImage")).toBeInstanceOf(File);
  });

  it("shows server error and skips router refresh when save fails", async () => {
    actionMocks.updateAppearanceAction.mockResolvedValueOnce({
      error: "Unable to update appearance",
    });

    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Unable to update appearance");
    });
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it("removes uploaded image and submits default mode", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    const imageFile = new File(["preview"], "preview.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Background image"), {
      target: { files: [imageFile] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(actionMocks.updateAppearanceAction).toHaveBeenCalled();
    });

    const payload = actionMocks.updateAppearanceAction.mock.calls.at(-1)?.[0] as FormData;
    expect(payload.get("backgroundMode")).toBe("NONE");
    expect(payload.get("removeBackgroundImage")).toBe("true");
    expect(payload.get("backgroundImage")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("accepts color picker updates for primary and background colors", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Primary color picker"), {
      target: { value: "#8899aa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Color" }));
    fireEvent.change(screen.getByLabelText("Background color picker"), {
      target: { value: "#223344" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

    await waitFor(() => {
      expect(actionMocks.updateAppearanceAction).toHaveBeenCalled();
    });

    const payload = actionMocks.updateAppearanceAction.mock.calls.at(-1)?.[0] as FormData;
    expect(payload.get("primaryColor")).toBe("#8899aa");
    expect(payload.get("backgroundColor")).toBe("#223344");
  });

  it("ignores empty background image selection", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.change(screen.getByLabelText("Background image"), {
      target: { files: [] },
    });

    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes previous preview when replacing image and resetting", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Image" }));

    fireEvent.change(screen.getByLabelText("Background image"), {
      target: { files: [new File(["a"], "first.png", { type: "image/png" })] },
    });

    fireEvent.change(screen.getByLabelText("Background image"), {
      target: { files: [new File(["b"], "second.png", { type: "image/png" })] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    await waitFor(() => {
      expect(actionMocks.updateAppearanceAction).toHaveBeenCalled();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("resets appearance to defaults and clears background image", async () => {
    renderFormWithImage();

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    await waitFor(() => {
      expect(actionMocks.updateAppearanceAction).toHaveBeenCalledTimes(1);
      expect(toastMocks.success).toHaveBeenCalledWith("Appearance reset to defaults");
      expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
    });

    const payload = actionMocks.updateAppearanceAction.mock.calls[0][0] as FormData;
    expect(payload.get("primaryColor")).toBe("");
    expect(payload.get("secondaryColor")).toBe("");
    expect(payload.get("backgroundMode")).toBe("NONE");
    expect(payload.get("backgroundColor")).toBe("");
    expect(payload.get("backgroundPatternScale")).toBe("100");
    expect(payload.get("backgroundImageOpacity")).toBe("45");
    expect(payload.get("removeBackgroundImage")).toBe("true");
  });
  describe("theme default and feedback", () => {
    function renderUnset() {
      return render(
        <AppearanceForm
          initialPrimaryColor={null}
          initialSecondaryColor={null}
          initialBackgroundMode="NONE"
          initialBackgroundColor={null}
          initialBackgroundImageUrl={null}
          initialBackgroundImageStyle="STRETCH"
          initialBackgroundPatternScale={100}
          initialBackgroundImageOpacity={45}
        />
      );
    }

    it("shows no saved color when the user never chose one and saves it as empty", async () => {
      renderUnset();

      expect(screen.getByLabelText("Primary color hex")).toHaveValue("");
      expect(screen.getByLabelText("Primary color hex")).toHaveAttribute(
        "placeholder",
        "Theme default"
      );
      expect(screen.getAllByText("Empty uses the theme default.")).toHaveLength(2);

      fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

      await waitFor(() => {
        expect(actionMocks.updateAppearanceAction).toHaveBeenCalledTimes(1);
      });
      const payload = actionMocks.updateAppearanceAction.mock.calls[0][0] as FormData;
      expect(payload.get("primaryColor")).toBe("");
      expect(payload.get("secondaryColor")).toBe("");
    });

    it("writes no color override to the shell until a color is chosen", () => {
      const { container } = render(
        <div data-workspace-shell>
          <div data-workspace-content-layer>
            <AppearanceForm
              initialPrimaryColor={null}
              initialSecondaryColor={null}
              initialBackgroundMode="NONE"
              initialBackgroundColor={null}
              initialBackgroundImageUrl={null}
              initialBackgroundImageStyle="STRETCH"
              initialBackgroundPatternScale={100}
              initialBackgroundImageOpacity={45}
            />
          </div>
        </div>
      );
      const shell = container.querySelector<HTMLElement>("[data-workspace-shell]")!;

      expect(shell.style.getPropertyValue("--primary")).toBe("");

      fireEvent.change(screen.getByLabelText("Primary color hex"), {
        target: { value: "#2563eb" },
      });
      expect(shell.style.getPropertyValue("--primary")).toBe("#2563eb");

      fireEvent.click(screen.getByRole("button", { name: "Use default" }));
      expect(shell.style.getPropertyValue("--primary")).toBe("");
    });

    it("offers a Use default button only while a color is set", () => {
      renderUnset();
      expect(screen.queryByRole("button", { name: "Use default" })).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Secondary color hex"), {
        target: { value: "#e2e8f0" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Use default" }));

      expect(screen.getByLabelText("Secondary color hex")).toHaveValue("");
    });

    it("explains an invalid hex inline", () => {
      renderUnset();

      fireEvent.change(screen.getByLabelText("Primary color hex"), {
        target: { value: "blue" },
      });

      expect(screen.getByLabelText("Primary color hex")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Enter a hex color like #1a73e8, or use the default.")).toBeVisible();
    });

    it("warns when a chosen primary is hard to see on the light or dark theme", () => {
      renderUnset();

      fireEvent.change(screen.getByLabelText("Primary color hex"), {
        target: { value: "#020617" },
      });
      expect(screen.getByText("This color is hard to see on the dark theme.")).toBeVisible();

      fireEvent.change(screen.getByLabelText("Primary color hex"), {
        target: { value: "#fefce8" },
      });
      expect(screen.getByText("This color is hard to see on the light theme.")).toBeVisible();

      fireEvent.change(screen.getByLabelText("Primary color hex"), {
        target: { value: "#2563eb" },
      });
      expect(screen.queryByText(/hard to see/)).not.toBeInTheDocument();
    });

    it("exposes the background mode and image style as pressed toggles", () => {
      renderFormWithImage();

      expect(screen.getByRole("button", { name: "Image" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
      expect(screen.getByRole("group", { name: "Image style" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Pattern repeat" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );

      fireEvent.click(screen.getByRole("button", { name: "Stretch fit" }));
      expect(screen.getByRole("button", { name: "Stretch fit" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });

    it("shows the background color field only in color mode", () => {
      renderUnset();
      expect(screen.queryByLabelText("Background color hex")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Color" }));
      expect(screen.getByLabelText("Background color hex")).toBeVisible();

      fireEvent.change(screen.getByLabelText("Background color hex"), {
        target: { value: "nope" },
      });
      expect(screen.getByLabelText("Background color hex")).toHaveAttribute("aria-invalid", "true");
    });

    it("shows an unsaved changes hint until the change is saved", async () => {
      renderUnset();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Primary color hex"), {
        target: { value: "#2563eb" },
      });
      expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");

      fireEvent.click(screen.getByRole("button", { name: /save appearance/i }));

      await waitFor(() => {
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });
    });

    it("clears the unsaved hint after resetting to defaults", async () => {
      renderUnset();
      fireEvent.change(screen.getByLabelText("Primary color hex"), {
        target: { value: "#2563eb" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

      await waitFor(() => {
        expect(toastMocks.success).toHaveBeenCalledWith("Appearance reset to defaults");
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
