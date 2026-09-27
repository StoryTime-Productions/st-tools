import { notFound, redirect } from "next/navigation";
import { BoardView } from "@/app/boards/[boardId]/_components/board-view";
import { getCurrentUser } from "@/lib/get-current-user";
import { getBoardDetailsData } from "@/lib/board-details";

export const dynamic = "force-dynamic";

export default async function BoardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams?: Promise<{ card?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const { boardId } = await params;

  const boardData = await getBoardDetailsData(boardId, { id: user.id, role: user.role });

  if (!boardData) {
    notFound();
  }

  const { card } = (await searchParams) ?? {};

  return <BoardView board={boardData} initialCardId={card} />;
}
