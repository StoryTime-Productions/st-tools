import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/get-current-user";
import { getBoardDetailsData } from "@/lib/board-details";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ boardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { boardId } = await context.params;
  const board = await getBoardDetailsData(boardId, { id: user.id, role: user.role });

  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  return NextResponse.json(board, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
