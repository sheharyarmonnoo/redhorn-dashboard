import { ConvexHttpClient } from "convex/browser";
import { config as dotenvConfig } from "dotenv";
import { resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";
import * as xlsx from "xlsx";

// Load .env.local from the repo root so we get NEXT_PUBLIC_CONVEX_URL.
const repoRoot = resolvePath(import.meta.dirname || ".", "..", "..", "..");
const envPath = resolvePath(repoRoot, ".env.local");
if (existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const FN = {
  bulkUpsertLineBudgets: "lineBudgets:bulkUpsertByCode",
} as const;

// Property code in Convex. The dashboard's RV park is currently named
// "Bradenburg RV Park" with code "rv-ohio". The xlsx is for Lake Wapusun
// (LWP) — same property; the in-app name will be updated separately.
const PROPERTY_CODE = "rv-ohio";
const YEAR = "2026";

// Subtotal labels in the LWP sheet — promoted to a higher hierarchy level so
// the Budget vs Actuals tab can render them as section totals (level 2) and
// distinguish from leaf line items (level 1). Grand totals get level 3.
const SUBTOTAL_PATTERNS: Array<{ re: RegExp; level: number }> = [
  { re: /^TOTAL INCOME$/i, level: 3 },
  { re: /^TOTAL OPERATING EXPENSES$/i, level: 3 },
  { re: /^NET OPERATING INCOME$/i, level: 3 },
  { re: /^TOTAL\b/i, level: 2 }, // catch-all for any other "TOTAL …" line
  { re: /^GROSS PROFIT/i, level: 2 },
];

interface BudgetRow {
  lineItem: string;
  hierarchyLevel: number;
  monthlyBudgets: number[]; // 12 entries Jan..Dec
  annualBudget: number;
}

function toNumber(v: any): number {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/,/g, "").replace(/\$/g, "").trim();
  if (s === "" || s === "-") return 0;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(neg ? s.slice(1, -1) : s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function parseLwpBudget(filePath: string): BudgetRow[] {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  // Column layout (from probing the file):
  //   col 0 = NetSuite Account Code (or blank for subtotals)
  //   col 1 = Property Code ("LWP")
  //   col 2 = Account Name (the line label; leading whitespace marks subtotals)
  //   col 3 = blank separator
  //   cols 4..15 = Jan, Feb, …, Dec budget values
  //   col 16 = Annual Total
  //
  // Header rows (top 13 of the sheet) carry days-open / occupancy stats
  // we don't want — start parsing from row 14 onwards.
  const rows: BudgetRow[] = [];
  const seen = new Set<string>();

  for (let r = 14; r < grid.length; r++) {
    const row = grid[r];
    if (!Array.isArray(row)) continue;
    const accountName = String(row[2] ?? "").replace(/\s+/g, " ").trim();
    if (!accountName) continue;
    // Skip rows whose monthly cells AND annual are all zero/empty —
    // the sheet has many placeholder accounts with no values.
    const monthly = [];
    let annualSum = 0;
    let anyValue = false;
    for (let c = 4; c <= 15; c++) {
      const n = toNumber(row[c]);
      monthly.push(n);
      annualSum += n;
      if (n !== 0) anyValue = true;
    }
    const reportedAnnual = toNumber(row[16]);
    if (!anyValue && reportedAnnual === 0) continue;

    let hierarchyLevel = 1;
    for (const { re, level } of SUBTOTAL_PATTERNS) {
      if (re.test(accountName)) {
        hierarchyLevel = level;
        break;
      }
    }

    // Some labels appear multiple times (e.g. NetSuite has several
    // "COGS - Alcohol" rows). Disambiguate by appending the account code
    // when present so the upsert doesn't collapse them.
    const code = String(row[0] ?? "").trim();
    let key = accountName;
    if (seen.has(key) && code) {
      key = `${accountName} (${code})`;
    }
    seen.add(key);

    rows.push({
      lineItem: key,
      hierarchyLevel,
      monthlyBudgets: monthly,
      annualBudget: reportedAnnual !== 0 ? reportedAnnual : annualSum,
    });
  }

  return rows;
}

async function main() {
  const fileArg = process.argv.find(a => a.startsWith("--file="))?.split("=")[1]
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
    throw new Error("Could not resolve Convex URL — set CONVEX_DEPLOYMENT or NEXT_PUBLIC_CONVEX_URL.");
  }
  console.log(`Convex target: ${convexUrl}${deploymentMatch ? "  (from CONVEX_DEPLOYMENT)" : "  (from .env.local)"}`);

  console.log(`\nParsing ${fileArg}...`);
  const rows = parseLwpBudget(fileArg);
  console.log(`  parsed ${rows.length} non-zero budget lines`);
  for (const r of rows.slice(0, 5)) {
    console.log(`   • L${r.hierarchyLevel}  ${r.lineItem}  →  $${r.annualBudget.toLocaleString()}/yr`);
  }
  if (rows.length > 5) console.log(`   … (${rows.length - 5} more)`);

  const client = new ConvexHttpClient(convexUrl);
  console.log(`\nWriting line_budgets for property=${PROPERTY_CODE} year=${YEAR}...`);
  try {
    const result: any = await client.mutation(FN.bulkUpsertLineBudgets as any, {
      propertyCode: PROPERTY_CODE,
      year: YEAR,
      rows: rows.map(r => ({
        lineItem: r.lineItem,
        annualBudget: r.annualBudget,
        monthlyBudgets: r.monthlyBudgets,
        hierarchyLevel: r.hierarchyLevel,
      })),
    });
    console.log(`  done. inserted=${result.inserted} superseded=${result.supersededPrior}`);
  } catch (err: any) {
    console.error(`Mutation failed: ${err?.message || err}`);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
