"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAvatarAction } from "@/app/actions/profile";

interface AvatarFormProps {
  avatarUrl: string | null;
  displayName: string | null;
}

const CROP_SIZE = 224;
const CIRCLE_SIZE = 176;
const CIRCLE_OFFSET = (CROP_SIZE - CIRCLE_SIZE) / 2;
const OUTPUT_SIZE = 512;

type ImageMetrics = {
  scale: number;
  width: number;
  height: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

function clampPosition(position: { x: number; y: number }, metrics: ImageMetrics) {
  const minX = Math.min(CIRCLE_OFFSET, CIRCLE_OFFSET + CIRCLE_SIZE - metrics.width);
  const maxX = CIRCLE_OFFSET;
  const minY = Math.min(CIRCLE_OFFSET, CIRCLE_OFFSET + CIRCLE_SIZE - metrics.height);
  const maxY = CIRCLE_OFFSET;

  return {
    x: Math.max(minX, Math.min(maxX, position.x)),
    y: Math.max(minY, Math.min(maxY, position.y)),
  };
}

function centeredPosition(metrics: ImageMetrics) {
  return {
    x: (CROP_SIZE - metrics.width) / 2,
    y: (CROP_SIZE - metrics.height) / 2,
  };
}

export function AvatarForm({ avatarUrl, displayName }: AvatarFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const metrics = useMemo<ImageMetrics | null>(() => {
    if (!naturalSize) {
      return null;
    }

    const baseScale = Math.max(CIRCLE_SIZE / naturalSize.width, CIRCLE_SIZE / naturalSize.height);
    const scale = baseScale * zoom;

    return {
      scale,
      width: naturalSize.width * scale,
      height: naturalSize.height * scale,
    };
  }, [naturalSize, zoom]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function resetSelection() {
    setSelectedFile(null);
    setNaturalSize(null);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setDragState(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      resetSelection();
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const nextNaturalSize = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      const baseScale = Math.max(
        CIRCLE_SIZE / nextNaturalSize.width,
        CIRCLE_SIZE / nextNaturalSize.height
      );
      const nextMetrics: ImageMetrics = {
        scale: baseScale,
        width: nextNaturalSize.width * baseScale,
        height: nextNaturalSize.height * baseScale,
      };

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setSelectedFile(file);
      setNaturalSize(nextNaturalSize);
      setZoom(1);
      setPosition(clampPosition(centeredPosition(nextMetrics), nextMetrics));
      setPreviewUrl(nextPreviewUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(nextPreviewUrl);
      toast.error("Could not load the selected image");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      resetSelection();
    };
    image.src = nextPreviewUrl;
  }

  function handleZoomChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!naturalSize || !metrics) {
      return;
    }

    const nextZoom = Number(event.target.value);
    const nextBaseScale = Math.max(
      CIRCLE_SIZE / naturalSize.width,
      CIRCLE_SIZE / naturalSize.height
    );
    const nextScale = nextBaseScale * nextZoom;
    const nextMetrics: ImageMetrics = {
      scale: nextScale,
      width: naturalSize.width * nextScale,
      height: naturalSize.height * nextScale,
    };

    // Keep the same image point under the crop viewport center when zooming.
    const centerImageX = (CROP_SIZE / 2 - position.x) / metrics.scale;
    const centerImageY = (CROP_SIZE / 2 - position.y) / metrics.scale;
    const nextPosition = {
      x: CROP_SIZE / 2 - centerImageX * nextMetrics.scale,
      y: CROP_SIZE / 2 - centerImageY * nextMetrics.scale,
    };

    setZoom(nextZoom);
    setPosition(clampPosition(nextPosition, nextMetrics));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!metrics || !previewUrl) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState || !metrics || event.pointerId !== dragState.pointerId) {
      return;
    }

    const nextPosition = {
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY),
    };
    setPosition(clampPosition(nextPosition, metrics));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState && event.pointerId === dragState.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragState(null);
    }
  }

  async function buildCroppedAvatar(): Promise<File | null> {
    if (!selectedFile || !previewUrl || !metrics || !imageRef.current) {
      return selectedFile;
    }

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) {
      return selectedFile;
    }

    const sourceX = (CIRCLE_OFFSET - position.x) / metrics.scale;
    const sourceY = (CIRCLE_OFFSET - position.y) / metrics.scale;
    const sourceSize = CIRCLE_SIZE / metrics.scale;

    context.drawImage(
      imageRef.current,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      return selectedFile;
    }

    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    startTransition(async () => {
      const data = new FormData();
      const croppedFile = await buildCroppedAvatar();
      if (croppedFile) {
        data.append("avatar", croppedFile);
      }

      const result = await updateAvatarAction(data);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Avatar updated");
        router.refresh();
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        resetSelection();
      }
    });
  }

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Label>Avatar</Label>
      <div className="grid gap-4 md:grid-cols-[224px_minmax(0,1fr)] md:items-start">
        <div className="space-y-3">
          <div
            className="bg-muted/40 relative h-56 w-56 touch-none overflow-hidden rounded-2xl border"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {previewUrl && metrics ? (
              <Image
                ref={imageRef}
                src={previewUrl}
                alt="Avatar crop preview"
                unoptimized
                width={Math.max(1, Math.round(metrics.width))}
                height={Math.max(1, Math.round(metrics.height))}
                className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
                style={{
                  width: `${metrics.width}px`,
                  height: `${metrics.height}px`,
                  transform: `translate(${position.x}px, ${position.y}px)`,
                }}
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Avatar
                  style={{ width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px` }}
                  className="rounded-full"
                >
                  <AvatarImage src={avatarUrl ?? undefined} alt="Avatar" className="object-cover" />
                  <AvatarFallback className="text-2xl font-semibold">{initials}</AvatarFallback>
                </Avatar>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="rounded-full border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                style={{ width: `${CIRCLE_SIZE}px`, height: `${CIRCLE_SIZE}px` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 md:max-w-xl">
          <div className="space-y-2 rounded-2xl border p-3">
            <Label htmlFor="avatar-file">Choose image</Label>
            <Input
              id="avatar-file"
              ref={inputRef}
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="file:border-border file:bg-background hover:file:bg-muted/50 w-full rounded-xl file:mr-3 file:cursor-pointer file:rounded-full file:border file:px-3 file:font-semibold file:shadow-none file:transition-colors"
              onChange={handleFileChange}
            />
            <p className="text-muted-foreground text-xs">
              JPG, PNG, WEBP, or GIF. A square crop will be applied for your avatar.
            </p>
          </div>

          {previewUrl ? (
            <div className="space-y-2 rounded-2xl border p-3">
              <Label htmlFor="avatar-zoom" className="text-xs">
                Zoom
              </Label>
              <input
                id="avatar-zoom"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={handleZoomChange}
                className="w-full"
              />
              <p className="text-muted-foreground text-xs">
                Drag the image in the preview to position it inside the circle.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" size="sm" disabled={isPending || !selectedFile}>
              {isPending ? "Uploading…" : "Upload avatar"}
            </Button>
            {selectedFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                  resetSelection();
                }}
                disabled={isPending}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
