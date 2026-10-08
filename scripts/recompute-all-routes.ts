// Re-routes every scheduled hangout so stored car schedules use the pick-up and drop-off lists.
// Run once after the ride_assignments migration is deployed (needs TOMTOM_API_KEY, DATABASE_URL).
// Usage: pnpm routes:recompute
import { HangoutStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { recomputeRoutes } from "../src/lib/routes";

async function main() {
  const hangouts = await prisma.hangout.findMany({
    where: { status: HangoutStatus.SCHEDULED, cars: { some: {} } },
    select: { id: true, title: true },
  });
  for (const { id, title } of hangouts) {
    await recomputeRoutes(id);
    console.log(`routed ${title}`);
  }
  console.log(`${hangouts.length} hangouts recomputed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
