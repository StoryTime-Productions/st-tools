import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/get-current-user";

export const dynamic = "force-dynamic";

const int = (value: string) => (/^\d+$/.test(value) ? Number(value) : NaN);

/** Logged-in-only proxy for TomTom raster tiles, so the key stays on the server. */
export async function GET(
  request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> }
) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return NextResponse.json({ error: "Maps aren't set up" }, { status: 404 });

  const params = await context.params;
  const [z, x, y] = [int(params.z), int(params.x), int(params.y)];
  if (!(z <= 22 && x >= 0 && y >= 0)) {
    return NextResponse.json({ error: "Bad tile" }, { status: 400 });
  }

  const style = new URL(request.url).searchParams.get("style") === "night" ? "night" : "main";
  try {
    const tile = await fetch(
      `https://api.tomtom.com/map/1/tile/basic/${style}/${z}/${x}/${y}.png?key=${key}`
    );
    if (!tile.ok) return NextResponse.json({ error: "Tile unavailable" }, { status: 502 });
    return new Response(tile.body, {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Tile unavailable" }, { status: 502 });
  }
}
