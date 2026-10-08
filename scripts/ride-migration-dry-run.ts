// Runs the ride_assignments migration inside a transaction, prints rider and passenger
// counts before and after, then rolls back so nothing is kept. Run it against a copy of prod
// before deploying. Usage: pnpm ride:dry-run   (uses DIRECT_URL; exits 1 if counts differ)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const sql = readFileSync(
  join(__dirname, "../prisma/migrations/20261009100000_ride_assignments/migration.sql"),
  "utf8"
);

async function main() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  const count = async (table: string, where = "true") =>
    Number((await client.query(`SELECT count(*) FROM "${table}" WHERE ${where}`)).rows[0].count);
  try {
    await client.query("BEGIN");
    const ridersBefore = await count("hangout_riders");
    const commonBefore = await count("hangout_riders", `"atCommonPoint"`);
    await client.query(sql);
    const pickups = await count("hangout_passengers", `"direction" = 'PICKUP'`);
    const dropoffs = await count("hangout_passengers", `"direction" = 'DROPOFF'`);
    const common = await count("hangout_passengers", `"pointKind" = 'COMMON'`);
    console.log(`before: ${ridersBefore} riders (${commonBefore} at a common point)`);
    console.log(`after:  ${pickups} pick-ups, ${dropoffs} drop-offs (${common} common entries)`);
    const ok = pickups === ridersBefore && dropoffs === ridersBefore && common <= commonBefore * 2;
    console.log(ok ? "OK: counts match" : "MISMATCH: do not deploy");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
