import { notFound, redirect } from "next/navigation";
import { BoardView } from "@/app/boards/[boardId]/_components/board-view";
import { getCurrentUser } from "@/lib/get-current-user";
import { getBoardDetailsData } from "@/lib/board-details";

export const dynamic = "force-dynamic";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const { boardId } = await params;

  const boardData = await getBoardDetailsData(boardId, { id: user.id, role: user.role });

  if (!boardData) {
    notFound();
  }

  return <BoardView board={boardData} />;
}
