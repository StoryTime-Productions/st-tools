"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAppearanceAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check, CircleAlert } from "lucide-react";

type BackgroundMode = "NONE" | "COLOR" | "IMAGE";
type BackgroundImageStyle = "STRETCH" | "PATTERN";

interface AppearanceFormProps {
  initialPrimaryColor: string | null;
  initialSecondaryColor: string | null;
  initialBackgroundMode: BackgroundMode;
  initialBackgroundColor: string | null;
  initialBackgroundImageUrl: string | null;
  initialBackgroundImageStyle: BackgroundImageStyle;
  initialBackgroundPatternScale: number;
  initialBackgroundImageOpacity: number;
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// Only the color picker swatch uses these when no color is chosen; an empty value means "theme default"
// and writes no override, so dark mode keeps its own colors.
const FALLBACK_PRIMARY = "#020617";
const FALLBACK_SECONDARY = "#f1f5f9";
const FALLBACK_BACKGROUND = "#ffffff";
const LIGHT_PAGE = "#ffffff";
const DARK_PAGE = "#0a0a0a";
const MIN_CONTRAST = 3;
const DEFAULT_BACKGROUND_MODE: BackgroundMode = "NONE";
const DEFAULT_BACKGROUND_IMAGE_STYLE: BackgroundImageStyle = "STRETCH";
const DEFAULT_BACKGROUND_PATTERN_SCALE = 100;
const DEFAULT_BACKGROUND_IMAGE_OPACITY = 45;

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  if (!HEX_COLOR_PATTERN.test(prefixed)) {
    return null;
  }

  if (prefixed.length === 4) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`.toLowerCase();
  }

  return prefixed.toLowerCase();
}

function resolveInitialColor(value: string | null, fallback: string) {
  return normalizeHexColor(value ?? "") ?? fallback;
}

function resolveInitialOptionalColor(value: string | null) {
  return normalizeHexColor(value ?? "") ?? "";
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a
  );

  return (lighter + 0.05) / (darker + 0.05);
}

/** Which theme a chosen primary color is hard to see on (under 3:1 against the page), if any. */
function lowContrastTheme(hex: string): "light" | "dark" | null {
  if (contrastRatio(hex, LIGHT_PAGE) < MIN_CONTRAST) {
    return "light";
  }

  return contrastRatio(hex, DARK_PAGE) < MIN_CONTRAST ? "dark" : null;
}

function clampOpacity(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampPatternScale(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_BACKGROUND_PATTERN_SCALE;
  }

  return Math.max(10, Math.min(300, Math.round(value)));
}

function getReadableForegroundColor(backgroundColor: string): string {
  const normalized = normalizeHexColor(backgroundColor);
  if (!normalized) {
    return "#ffffff";
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

function ColorField({
  idPrefix,
  label,
  value,
  fallback,
  invalid,
  warning,
  onChange,
}: {
  idPrefix: string;
  label: string;
  value: string;
  fallback: string;
  invalid: boolean;
  warning: "light" | "dark" | null;
  onChange: (value: string) => void;
}) {
  const hintId = `${idPrefix}-color-hint`;
  const hasProblem = invalid || warning !== null;

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-color-hex`}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-color-picker`}
          aria-label={`${label} picker`}
          type="color"
          value={normalizeHexColor(value) ?? fallback}
          className="border-input h-10 w-14 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 max-md:h-11"
          onChange={(event) => {
            onChange(event.target.value.toLowerCase());
          }}
        />
        <Input
          id={`${idPrefix}-color-hex`}
          aria-label={`${label} hex`}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          value={value}
          placeholder="Theme default"
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {value !== "" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => {
              onChange("");
            }}
          >
            Use default
          </Button>
        ) : null}
      </div>
      <p
        id={hintId}
        className={cn(
          "flex items-start gap-1.5 text-xs",
          hasProblem ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {hasProblem ? <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span>
          {invalid
            ? "Enter a hex color like #1a73e8, or use the default."
            : warning
              ? `This color is hard to see on the ${warning} theme.`
              : "Empty uses the theme default."}
        </span>
      </p>
    </div>
  );
}

export function AppearanceForm({
  initialPrimaryColor,
  initialSecondaryColor,
  initialBackgroundMode,
  initialBackgroundColor,
  initialBackgroundImageUrl,
  initialBackgroundImageStyle,
  initialBackgroundPatternScale,
  initialBackgroundImageOpacity,
}: AppearanceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [primaryColorHex, setPrimaryColorHex] = useState(
    resolveInitialOptionalColor(initialPrimaryColor)
  );
  const [secondaryColorHex, setSecondaryColorHex] = useState(
    resolveInitialOptionalColor(initialSecondaryColor)
  );
  const [backgroundColorHex, setBackgroundColorHex] = useState(
    resolveInitialColor(initialBackgroundColor, FALLBACK_BACKGROUND)
  );
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(
    initialBackgroundMode ?? DEFAULT_BACKGROUND_MODE
  );
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(
    clampOpacity(initialBackgroundImageOpacity)
  );
  const [backgroundImageStyle, setBackgroundImageStyle] = useState<BackgroundImageStyle>(
    initialBackgroundImageStyle ?? DEFAULT_BACKGROUND_IMAGE_STYLE
  );
  const [backgroundPatternScale, setBackgroundPatternScale] = useState(
    clampPatternScale(initialBackgroundPatternScale)
  );
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundImagePreviewUrl, setBackgroundImagePreviewUrl] = useState<string | null>(null);
  const [removeBackgroundImage, setRemoveBackgroundImage] = useState(false);

  const primaryInvalid =
    primaryColorHex.trim() !== "" && normalizeHexColor(primaryColorHex) === null;
  const secondaryInvalid =
    secondaryColorHex.trim() !== "" && normalizeHexColor(secondaryColorHex) === null;
  const normalizedPrimaryColor = normalizeHexColor(primaryColorHex);
  const primaryWarning = normalizedPrimaryColor ? lowContrastTheme(normalizedPrimaryColor) : null;

  const currentSnapshot = JSON.stringify([
    normalizedPrimaryColor ?? "",
    normalizeHexColor(secondaryColorHex) ?? "",
    backgroundMode,
    backgroundMode === "COLOR" ? (normalizeHexColor(backgroundColorHex) ?? "") : "",
    backgroundImageStyle,
    backgroundPatternScale,
    backgroundImageOpacity,
    backgroundImageFile !== null,
    removeBackgroundImage,
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState(currentSnapshot);
  const isDirty = currentSnapshot !== savedSnapshot;

  const visibleBackgroundImageUrl = useMemo(() => {
    if (backgroundImagePreviewUrl) {
      return backgroundImagePreviewUrl;
    }

    if (removeBackgroundImage) {
      return null;
    }

    return initialBackgroundImageUrl;
  }, [backgroundImagePreviewUrl, initialBackgroundImageUrl, removeBackgroundImage]);

  useEffect(() => {
    return () => {
      if (backgroundImagePreviewUrl) {
        URL.revokeObjectURL(backgroundImagePreviewUrl);
      }
    };
  }, [backgroundImagePreviewUrl]);

  useEffect(() => {
    const workspaceShell = formRef.current?.closest<HTMLElement>("[data-workspace-shell]");
    if (!workspaceShell) {
      return;
    }
    const contentLayer = workspaceShell.querySelector<HTMLElement>(
      "[data-workspace-content-layer]"
    );

    const properties = [
      "--primary",
      "--primary-foreground",
      "--ring",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--secondary",
      "--secondary-foreground",
    ] as const;

    const previousValues = new Map<string, string>();
    for (const property of properties) {
      previousValues.set(property, workspaceShell.style.getPropertyValue(property));
    }
    const previousCanvasBackgroundColor = contentLayer?.style.backgroundColor ?? "";

    const normalizedPrimary = normalizeHexColor(primaryColorHex);
    if (normalizedPrimary) {
      const primaryForeground = getReadableForegroundColor(normalizedPrimary);
      workspaceShell.style.setProperty("--primary", normalizedPrimary);
      workspaceShell.style.setProperty("--primary-foreground", primaryForeground);
      workspaceShell.style.setProperty("--ring", normalizedPrimary);
      workspaceShell.style.setProperty("--sidebar-primary", normalizedPrimary);
      workspaceShell.style.setProperty("--sidebar-primary-foreground", primaryForeground);
    }

    const normalizedSecondary = normalizeHexColor(secondaryColorHex);
    if (normalizedSecondary) {
      workspaceShell.style.setProperty("--secondary", normalizedSecondary);
      workspaceShell.style.setProperty(
        "--secondary-foreground",
        getReadableForegroundColor(normalizedSecondary)
      );
    }

    const normalizedBackground = normalizeHexColor(backgroundColorHex);
    if (contentLayer) {
      if (backgroundMode === "COLOR" && normalizedBackground) {
        contentLayer.style.backgroundColor = normalizedBackground;
      } else {
        contentLayer.style.removeProperty("background-color");
      }
    }

    return () => {
      for (const property of properties) {
        const value = previousValues.get(property) ?? "";
        if (value) {
          workspaceShell.style.setProperty(property, value);
        } else {
          workspaceShell.style.removeProperty(property);
        }
      }

      if (contentLayer) {
        if (previousCanvasBackgroundColor) {
          contentLayer.style.backgroundColor = previousCanvasBackgroundColor;
        } else {
          contentLayer.style.removeProperty("background-color");
        }
      }
    };
  }, [backgroundColorHex, backgroundMode, primaryColorHex, secondaryColorHex]);

  function handleColorTextChange(
    event: ChangeEvent<HTMLInputElement>,
    setColor: (value: string) => void
  ) {
    setColor(event.target.value);
  }

  function handleColorWheelChange(
    event: ChangeEvent<HTMLInputElement>,
    setColor: (value: string) => void
  ) {
    setColor(event.target.value.toLowerCase());
  }

  function handleBackgroundImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (backgroundImagePreviewUrl) {
      URL.revokeObjectURL(backgroundImagePreviewUrl);
    }

    setBackgroundImageFile(file);
    setRemoveBackgroundImage(false);
    setBackgroundMode("IMAGE");
    setBackgroundImagePreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveBackgroundImage() {
    if (backgroundImagePreviewUrl) {
      URL.revokeObjectURL(backgroundImagePreviewUrl);
    }

    setBackgroundImageFile(null);
    setBackgroundImagePreviewUrl(null);
    setRemoveBackgroundImage(true);
    if (backgroundMode === "IMAGE") {
      setBackgroundMode(DEFAULT_BACKGROUND_MODE);
    }
  }

  function persistAppearance(formData: FormData, successMessage: string, savedAs: string) {
    startTransition(async () => {
      const result = await updateAppearanceAction(formData);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setSavedSnapshot(savedAs);
      toast.success(successMessage);
      router.refresh();
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // an empty field means "use the theme color", so nothing is saved for it
    const normalizedPrimary =
      primaryColorHex.trim() === "" ? "" : normalizeHexColor(primaryColorHex);
    if (normalizedPrimary === null) {
      toast.error("Primary color must be a valid hex value");
      return;
    }

    const normalizedSecondary =
      secondaryColorHex.trim() === "" ? "" : normalizeHexColor(secondaryColorHex);
    if (normalizedSecondary === null) {
      toast.error("Secondary color must be a valid hex value");
      return;
    }

    let normalizedBackgroundColor: string | null = null;
    if (backgroundMode === "COLOR") {
      normalizedBackgroundColor = normalizeHexColor(backgroundColorHex);
      if (!normalizedBackgroundColor) {
        toast.error("Background color must be a valid hex value");
        return;
      }
    }

    const formData = new FormData();
    formData.set("primaryColor", normalizedPrimary);
    formData.set("secondaryColor", normalizedSecondary);
    formData.set("backgroundMode", backgroundMode);
    formData.set("backgroundImageStyle", backgroundImageStyle);
    formData.set("backgroundPatternScale", String(clampPatternScale(backgroundPatternScale)));
    formData.set("backgroundColor", normalizedBackgroundColor ?? "");
    formData.set("backgroundImageOpacity", String(clampOpacity(backgroundImageOpacity)));
    formData.set("removeBackgroundImage", removeBackgroundImage ? "true" : "false");

    if (backgroundImageFile) {
      formData.set("backgroundImage", backgroundImageFile);
    }

    persistAppearance(formData, "Appearance updated", currentSnapshot);
  }

  function onResetToDefaults() {
    if (backgroundImagePreviewUrl) {
      URL.revokeObjectURL(backgroundImagePreviewUrl);
    }

    setPrimaryColorHex("");
    setSecondaryColorHex("");
    setBackgroundMode(DEFAULT_BACKGROUND_MODE);
    setBackgroundColorHex(FALLBACK_BACKGROUND);
    setBackgroundImageStyle(DEFAULT_BACKGROUND_IMAGE_STYLE);
    setBackgroundPatternScale(DEFAULT_BACKGROUND_PATTERN_SCALE);
    setBackgroundImageOpacity(DEFAULT_BACKGROUND_IMAGE_OPACITY);
    setBackgroundImageFile(null);
    setBackgroundImagePreviewUrl(null);
    setRemoveBackgroundImage(true);

    const formData = new FormData();
    formData.set("primaryColor", "");
    formData.set("secondaryColor", "");
    formData.set("backgroundMode", DEFAULT_BACKGROUND_MODE);
    formData.set("backgroundImageStyle", DEFAULT_BACKGROUND_IMAGE_STYLE);
    formData.set("backgroundPatternScale", String(DEFAULT_BACKGROUND_PATTERN_SCALE));
    formData.set("backgroundColor", "");
    formData.set("backgroundImageOpacity", String(DEFAULT_BACKGROUND_IMAGE_OPACITY));
    formData.set("removeBackgroundImage", "true");

    persistAppearance(
      formData,
      "Appearance reset to defaults",
      JSON.stringify([
        "",
        "",
        DEFAULT_BACKGROUND_MODE,
        "",
        DEFAULT_BACKGROUND_IMAGE_STYLE,
        DEFAULT_BACKGROUND_PATTERN_SCALE,
        DEFAULT_BACKGROUND_IMAGE_OPACITY,
        false,
        true,
      ])
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Theme colors</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <ColorField
            idPrefix="primary"
            label="Primary color"
            value={primaryColorHex}
            fallback={FALLBACK_PRIMARY}
            invalid={primaryInvalid}
            warning={primaryWarning}
            onChange={setPrimaryColorHex}
          />
          <ColorField
            idPrefix="secondary"
            label="Secondary color"
            value={secondaryColorHex}
            fallback={FALLBACK_SECONDARY}
            invalid={secondaryInvalid}
            warning={null}
            onChange={setSecondaryColorHex}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Workspace background</h3>

        <div role="group" aria-label="Background mode" className="flex flex-wrap gap-2">
          {[
            { value: "NONE" as const, label: "Default" },
            { value: "COLOR" as const, label: "Color" },
            { value: "IMAGE" as const, label: "Image" },
          ].map((modeOption) => (
            <Button
              key={modeOption.value}
              type="button"
              variant={backgroundMode === modeOption.value ? "default" : "outline"}
              aria-pressed={backgroundMode === modeOption.value}
              className="rounded-full"
              onClick={() => {
                setBackgroundMode(modeOption.value);
              }}
            >
              {backgroundMode === modeOption.value ? (
                <Check className="size-4" aria-hidden="true" />
              ) : null}
              {modeOption.label}
            </Button>
          ))}
        </div>

        {backgroundMode === "COLOR" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="background-color-hex">Background color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="background-color-picker"
                  aria-label="Background color picker"
                  type="color"
                  value={normalizeHexColor(backgroundColorHex) ?? FALLBACK_BACKGROUND}
                  className="border-input h-10 w-14 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 max-md:h-11"
                  onChange={(event) => {
                    handleColorWheelChange(event, setBackgroundColorHex);
                  }}
                />
                <Input
                  id="background-color-hex"
                  aria-label="Background color hex"
                  aria-invalid={normalizeHexColor(backgroundColorHex) === null || undefined}
                  value={backgroundColorHex}
                  placeholder="#ffffff"
                  onChange={(event) => {
                    handleColorTextChange(event, setBackgroundColorHex);
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {backgroundMode === "IMAGE" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <span
                id="background-image-style-label"
                className="flex items-center gap-2 text-sm leading-none font-medium select-none"
              >
                Image style
              </span>
              <div
                role="group"
                aria-labelledby="background-image-style-label"
                className="flex flex-wrap gap-2"
              >
                {[
                  { value: "STRETCH" as const, label: "Stretch fit" },
                  { value: "PATTERN" as const, label: "Pattern repeat" },
                ].map((styleOption) => (
                  <Button
                    key={styleOption.value}
                    type="button"
                    variant={backgroundImageStyle === styleOption.value ? "default" : "outline"}
                    aria-pressed={backgroundImageStyle === styleOption.value}
                    className="rounded-full"
                    onClick={() => {
                      setBackgroundImageStyle(styleOption.value);
                    }}
                  >
                    {backgroundImageStyle === styleOption.value ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : null}
                    {styleOption.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="background-image-file">Background image</Label>
              <Input
                id="background-image-file"
                aria-label="Background image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleBackgroundImageChange}
              />
              <p className="text-muted-foreground text-xs">
                Upload JPG, PNG, WEBP, or GIF. Image mode supports opacity from 0 to 100.
              </p>
            </div>

            {visibleBackgroundImageUrl ? (
              <div className="space-y-3">
                <div
                  className="border-border h-32 w-full rounded-xl border"
                  style={{
                    backgroundImage: `url(${visibleBackgroundImageUrl})`,
                    backgroundPosition: "center",
                    backgroundRepeat: backgroundImageStyle === "PATTERN" ? "repeat" : "no-repeat",
                    backgroundSize:
                      backgroundImageStyle === "PATTERN"
                        ? backgroundPatternScale === DEFAULT_BACKGROUND_PATTERN_SCALE
                          ? "auto"
                          : `${backgroundPatternScale}% auto`
                        : "100% 100%",
                    opacity: clampOpacity(backgroundImageOpacity) / 100,
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveBackgroundImage}
                >
                  Remove image
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                No image selected yet. Upload an image to use image background mode.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="background-image-opacity">
                Image opacity ({backgroundImageOpacity}%)
              </Label>
              <input
                id="background-image-opacity"
                aria-label="Background image opacity"
                type="range"
                min={0}
                max={100}
                value={backgroundImageOpacity}
                className="w-full max-md:h-11"
                onChange={(event) => {
                  setBackgroundImageOpacity(clampOpacity(Number(event.target.value)));
                }}
              />
            </div>

            {backgroundImageStyle === "PATTERN" ? (
              <div className="space-y-2">
                <Label htmlFor="background-pattern-scale">
                  Pattern size ({backgroundPatternScale}%)
                </Label>
                <input
                  id="background-pattern-scale"
                  aria-label="Background pattern scale"
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={backgroundPatternScale}
                  className="w-full max-md:h-11"
                  onChange={(event) => {
                    setBackgroundPatternScale(clampPatternScale(Number(event.target.value)));
                  }}
                />
                <p className="text-muted-foreground text-xs">100% keeps the original tile size.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save appearance"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onResetToDefaults}>
          Reset to defaults
        </Button>
        {isDirty ? (
          <p role="status" className="text-muted-foreground text-sm">
            Unsaved changes. The preview only applies here until you save.
          </p>
        ) : null}
      </div>
    </form>
  );
}
