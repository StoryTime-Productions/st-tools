"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CACHE_KEY = "st-tools-puppy-of-the-day-v1";
const FALLBACK_IMAGE_URL = "https://images.dog.ceo/breeds/retriever-golden/n02099601_3004.jpg";

type PuppyCache = {
  day: string;
  imageUrl: string;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readPuppyCache(): PuppyCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PuppyCache;
    if (!parsed.day || !parsed.imageUrl) return null;

    return parsed;
  } catch {
    return null;
  }
}

function writePuppyCache(cache: PuppyCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Best-effort cache only.
  }
}

async function fetchPuppyImage(): Promise<string> {
  const response = await fetch("https://dog.ceo/api/breeds/image/random", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Puppy service is unavailable.");
  }

  const payload = (await response.json()) as { status?: string; message?: string };
  if (payload.status !== "success" || !payload.message) {
    throw new Error("Puppy service returned an invalid response.");
  }

  return payload.message;
}

export function PuppyOfTheDayCard() {
  const [imageUrl, setImageUrl] = useState(FALLBACK_IMAGE_URL);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPuppy() {
      setIsLoading(true);

      const day = todayKey();
      const cached = readPuppyCache();
      if (cached?.day === day) {
        if (!cancelled) {
          setImageUrl(cached.imageUrl);
          setIsLoading(false);
        }
        return;
      }

      try {
        const nextImage = await fetchPuppyImage();
        if (cancelled) return;

        setImageUrl(nextImage);
        writePuppyCache({ day, imageUrl: nextImage });
      } catch {
        if (cancelled) return;

        setImageUrl(FALLBACK_IMAGE_URL);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPuppy();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="border-border/70 bg-background/85 overflow-hidden rounded-3xl shadow-none">
      <CardHeader className="gap-1">
        <CardDescription className="text-xs tracking-[0.24em] uppercase">
          Daily pick
        </CardDescription>
        <CardTitle className="text-lg">Puppy of the day</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-muted relative aspect-4/3 overflow-hidden rounded-2xl">
          <Image
            src={imageUrl}
            alt="Puppy of the day"
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 100vw, 320px"
          />
          {isLoading ? (
            <div className="bg-background/45 absolute inset-0 backdrop-blur-sm" />
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs"></p>
      </CardContent>
    </Card>
  );
}
