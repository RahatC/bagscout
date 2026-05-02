import { db } from "@workspace/db";
import { listingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { recomputeListingIntelligence } from "../lib/intelligence";

async function main() {
  const rows = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(eq(listingsTable.availabilityStatus, "available"));

  console.log(`Recomputing intelligence for ${rows.length} listings...`);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await recomputeListingIntelligence(row.id);
      if (result) ok++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`Failed listing ${row.id}:`, err);
    }
  }
  console.log(`Done. ok=${ok} failed=${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
