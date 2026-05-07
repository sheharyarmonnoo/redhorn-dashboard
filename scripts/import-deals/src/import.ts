import { ConvexHttpClient } from "convex/browser";
import { config as dotenvConfig } from "dotenv";
import { resolve as resolvePath } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { parseDealFlow, type ParsedUpdate } from "./parse-deal-flow.js";

// Load .env.local from the repo root so we get NEXT_PUBLIC_CONVEX_URL.
const repoRoot = resolvePath(import.meta.dirname || ".", "..", "..", "..");
const envPath = resolvePath(repoRoot, ".env.local");
if (existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const FN = {
  bulkImport: "deals:bulkImport",
  upsertFieldDef: "dealFieldDefinitions:upsertByKey",
} as const;

// Custom-field definitions auto-seeded on first import. Order matches what
// the user is most likely to scan first.
const FIELD_DEFS: Array<{
  key: string;
  label: string;
  type: "text" | "longtext" | "number" | "currency" | "date" | "select";
  options?: string[];
  showOnCard?: boolean;
}> = [
  { key: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"], showOnCard: true },
  { key: "contactStatus", label: "Contact Status", type: "select", options: [
    "Need to Contact",
    "Contacted Awaiting Update",
    "Contacted Follow-Up",
    "Contacted Continue Conversations",
  ] },
  { key: "lastContactDate", label: "Last Contact Date", type: "date" },
  { key: "nextStep", label: "Next Step", type: "text" },
  { key: "followUpCount", label: "Follow-Up Count", type: "number" },
  { key: "leadTier", label: "Lead Tier", type: "number" },
  { key: "leadScore", label: "Lead Score", type: "number" },
  { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
  { key: "lastSaleDate", label: "Last Sale Date", type: "date" },
  { key: "appraisedValue", label: "Appraised Value", type: "currency" },
  { key: "hcadAccount", label: "HCAD Account #", type: "text" },
  { key: "ownerEntity", label: "Owner Entity", type: "text" },
  { key: "rates", label: "Rates", type: "text" },
  { key: "brokerNotes", label: "Broker Notes", type: "longtext" },
];

async function main() {
  const fileArg = process.argv.find(a => a.startsWith("--file="))?.split("=")[1]
    || process.argv.find(a => a.startsWith("--file"))?.split(/\s+/)[1]
    || (process.argv[2] === "--file" ? process.argv[3] : undefined);
  if (!fileArg) {
    console.error('Usage: npm run import -- --file "<path-to-xlsx>"');
    process.exit(1);
  }
  if (!existsSync(fileArg)) {
    console.error(`File not found: ${fileArg}`);
    process.exit(1);
  }

  const deploymentEnv = process.env.CONVEX_DEPLOYMENT || "";
  const deploymentMatch = deploymentEnv.match(/^(?:prod|dev):([a-z0-9-]+)$/);
  const convexUrl = deploymentMatch
    ? `https://${deploymentMatch[1]}.convex.cloud`
    : process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Could not resolve Convex URL — set CONVEX_DEPLOYMENT or NEXT_PUBLIC_CONVEX_URL in .env.local.");
  }
  console.log(`Convex target: ${convexUrl}${deploymentMatch ? "  (from CONVEX_DEPLOYMENT)" : "  (from .env.local)"}`);

  console.log(`\nParsing ${fileArg}...`);
  const { deals, updates } = parseDealFlow(fileArg);
  console.log(`  parsed ${deals.length} deals, ${updates.length} updates`);

  // Bucket updates by Monday item ID
  const updatesByItem: Record<string, ParsedUpdate[]> = {};
  for (const u of updates) {
    (updatesByItem[u.itemId] = updatesByItem[u.itemId] || []).push(u);
  }
  // Sort each bucket chronologically (oldest first).
  for (const k of Object.keys(updatesByItem)) {
    updatesByItem[k].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const client = new ConvexHttpClient(convexUrl);

  // Seed field definitions first (idempotent — upsertByKey patches if exists).
  console.log(`\nSeeding ${FIELD_DEFS.length} custom field definitions...`);
  for (let i = 0; i < FIELD_DEFS.length; i++) {
    const def = FIELD_DEFS[i];
    try {
      await client.mutation(FN.upsertFieldDef as any, {
        key: def.key,
        label: def.label,
        type: def.type,
        options: def.options,
        order: i,
        showOnCard: def.showOnCard,
      });
    } catch (err: any) {
      console.error(`  field def "${def.key}" failed: ${err?.message || err}`);
    }
  }
  console.log(`  done.`);

  // Bulk import deals — chunk to avoid huge mutation payloads.
  const CHUNK = 50;
  let totalInserted = 0, totalUpdated = 0, totalSkipped = 0;
  console.log(`\nBulk importing ${deals.length} deals in chunks of ${CHUNK}...`);
  for (let i = 0; i < deals.length; i += CHUNK) {
    const chunk = deals.slice(i, i + CHUNK).map(d => ({
      ...d,
      updatesFromMonday: (updatesByItem[d.mondayItemId] || []).map(u => ({
        author: u.author,
        text: u.text,
        createdAt: u.createdAt,
      })),
    }));
    try {
      const result: any = await client.mutation(FN.bulkImport as any, { rows: chunk });
      totalInserted += result.inserted || 0;
      totalUpdated += result.updated || 0;
      totalSkipped += result.skipped || 0;
      console.log(`  chunk ${Math.floor(i / CHUNK) + 1}: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`);
    } catch (err: any) {
      console.error(`  chunk failed: ${err?.message || err}`);
    }
  }

  console.log(`\nDone.  inserted=${totalInserted}  updated=${totalUpdated}  skipped=${totalSkipped}`);
}

main().catch((err) => {
  console.error("\nFatal:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
