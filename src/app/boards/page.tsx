import { redirect } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { CreateBoardDialog } from "@/app/boards/_components/create-board-dialog";
import { BoardList, type BoardListItem } from "@/app/boards/_components/board-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/get-current-user";
import { getAccessibleBoardWhere, getUserDisplayName } from "@/lib/boards";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Boards" };

export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function BoardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const boardRows = await prisma.board.findMany({
    where: getAccessibleBoardWhere({ id: user.id, role: user.role }),
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      ownerId: true,
      isPersonal: true,
      isOpenToWorkspace: true,
      createdAt: true,
      owner: {
        select: {
          name: true,
          email: true,
        },
      },
      columns: {
        select: {
          _count: {
            select: {
              cards: true,
            },
          },
        },
      },
    },
  });

  const boards: BoardListItem[] = boardRows.map((board) => {
    const isOwner = board.ownerId === user.id;
    return {
      id: board.id,
      href: `/boards/${board.id}`,
      title: board.title,
      createdAtLabel: formatDate(board.createdAt),
      cardCount: board.columns.reduce((total, column) => total + column._count.cards, 0),
      ownerLabel: isOwner ? "Owned by you" : `Owned by ${getUserDisplayName(board.owner)}`,
      scopeLabel: board.isPersonal ? "Private" : "Collaborative",
      accessDescription: board.isPersonal
        ? "Visible only to your account."
        : board.isOpenToWorkspace
          ? "Open to the whole workspace."
          : "Shared with selected teammates.",
      canManage: user.role === "ADMIN" || isOwner,
    };
  });

  const totalCards = boards.reduce((total, board) => total + board.cardCount, 0);
  const collaborativeBoards = boardRows.filter((board) => !board.isPersonal).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.24em] uppercase">
            Kanban workspace
          </p>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Boards</h2>
            <p className="text-muted-foreground max-w-2xl text-sm leading-6">
              Manage private boards, collaborative team boards, and the cards flowing through each
              project.
            </p>
          </div>
        </div>

        <CreateBoardDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:max-w-4xl">
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="space-y-2">
            <CardDescription className="text-xs tracking-[0.24em] uppercase">
              Accessible boards
            </CardDescription>
            <CardTitle className="text-3xl tracking-tight">{boards.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="space-y-2">
            <CardDescription className="text-xs tracking-[0.24em] uppercase">
              Collaborative boards
            </CardDescription>
            <CardTitle className="text-3xl tracking-tight">{collaborativeBoards}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="space-y-2">
            <CardDescription className="text-xs tracking-[0.24em] uppercase">
              Cards across boards
            </CardDescription>
            <CardTitle className="text-3xl tracking-tight">{totalCards}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {boards.length === 0 ? (
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
            <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
              <FolderKanban className="text-muted-foreground size-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold tracking-tight">No boards yet</h3>
              <p className="text-muted-foreground max-w-md text-sm leading-6">
                Create your first private or collaborative board to start organising work with
                columns and cards.
              </p>
            </div>
            <CreateBoardDialog triggerLabel="Create your first board" />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70 bg-background/85 overflow-hidden rounded-3xl shadow-none">
          <CardHeader className="border-border/60 flex flex-col gap-2 border-b sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Your boards</CardTitle>
              <CardDescription>Open a board to manage members, columns, and cards.</CardDescription>
            </div>
            <Badge variant="outline">{boards.length} total</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <BoardList boards={boards} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
