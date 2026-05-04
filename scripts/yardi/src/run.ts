import { openAuthenticatedSession } from "./auth.js";
import { getProperties } from "./properties.js";
import { runIncomeStatementForProperty } from "./reports/income-statement.js";
import { runRentRollForProperty, runTotalUnitsForProperty } from "./reports/rent-roll.js";
import { runReceivableDetailForProperty } from "./reports/receivable-detail.js";
// Held back until we have a viable Yardi delivery path:
//   import { runPastDueForProperty } from "./reports/rent-roll.js";
//   import { runRentRollFullForProperty } from "./reports/rent-roll-full.js";
//   import { runGlDetailForProperty } from "./reports/gl-detail.js";
import { latestClosedMonth } from "./paths.js";
import { uploadRunToConvex } from "./convex-upload.js";

interface RunResult {
  property: string;
  propertyCode: string;
  reportType: "income_statement" | "rent_roll" | "total_units" | "past_due" | "rent_roll_full" | "gl_detail" | "receivable_detail";
  ok: boolean;
  path?: string;
  error?: string;
}

async function main() {
  const headed = !process.argv.includes("--headless");
  const monthArg = process.argv.find(a => a.startsWith("--month="))?.split("=")[1];
  const month = monthArg ?? latestClosedMonth();
  const templateArg = process.argv.find(a => a.startsWith("--template="))?.split("=")[1];
  const codeArg = process.argv.find(a => a.startsWith("--code="))?.split("=")[1];
  const skipUpload = process.argv.includes("--no-upload");
  const historical = process.argv.includes("--historical");

  console.log(`\nYardi Income Statement scraper`);
  console.log(`  month:     ${month}${historical ? "  (historical backfill)" : ""}`);
  console.log(`  browser:   ${headed ? "headed" : "headless"}`);
  console.log(`  upload:    ${skipUpload ? "off" : "Convex sync_jobs"}`);
  if (templateArg) console.log(`  template:  ${templateArg}`);
  if (codeArg) console.log(`  mfa code:  [provided via --code]`);
  console.log("");

  const session = await openAuthenticatedSession({ headed, manualCode: codeArg });
  const { voyager, close } = session;

  try {
    const properties = await getProperties(voyager);

    console.log(`Scraping ${properties.length} propert${properties.length === 1 ? "y" : "ies"}:`);
    for (const p of properties) console.log(`  • ${p.name} (${p.code})`);

    const results: RunResult[] = [];
    for (const property of properties) {
      // Income Statement — always run
      try {
        const path = await runIncomeStatementForProperty(voyager, property, month, templateArg);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "income_statement", ok: true, path });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`   IS FAILED — ${msg}`);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "income_statement", ok: false, error: msg });
      }

      // Historical backfill mode skips everything except the income statement —
      // we only need IS rows to build the monthly_revenue rollup, and we don't
      // want to overwrite current rent-roll / past-due data with a snapshot of
      // last month's leases.
      if (historical) continue;

      // Rent Roll (Current Leases panel)
      try {
        const path = await runRentRollForProperty(voyager, property, month);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "rent_roll", ok: true, path });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`   RR FAILED — ${msg}`);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "rent_roll", ok: false, error: msg });
      }

      // Total Units (Space/Facilities panel)
      try {
        const path = await runTotalUnitsForProperty(voyager, property, month);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "total_units", ok: true, path });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`   TU FAILED — ${msg}`);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "total_units", ok: false, error: msg });
      }

      // Receivable Detail — Lease Ledger via SSRS Screen + ReportViewer
      // exportReport API. Per-tenant charge + payment + balance with aging
      // buckets. ~30-60s per property.
      try {
        const path = await runReceivableDetailForProperty(voyager, property, month);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "receivable_detail", ok: true, path });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`   RD FAILED — ${msg}`);
        results.push({ property: property.name, propertyCode: property.convexCode, reportType: "receivable_detail", ok: false, error: msg });
      }

      // Past Due / Rent Roll (full) / GL Detail are still held back. Their
      // scrapers exist in scripts/yardi/src/reports/ but the URL paths I
      // probed don't render in this Yardi instance. Re-enable each by
      // uncommenting its import + try-block once the right URL/menu path is
      // identified — the parsers + Convex mutations are already wired.
    }

    console.log("\n=== Download Summary ===");
    const ok = results.filter(r => r.ok).length;
    const bad = results.length - ok;
    console.log(`  ${ok} succeeded, ${bad} failed`);
    for (const r of results) {
      if (r.ok) console.log(`  ✓ ${r.property} → ${r.path}`);
      else console.log(`  ✗ ${r.property}: ${r.error}`);
    }

    // Upload all successful downloads to Convex as a single sync_job
    if (!skipUpload) {
      const filesToUpload = results
        .filter(r => r.ok && r.path)
        .map(r => ({
          filePath: r.path!,
          propertyCode: r.propertyCode,
          reportType: r.reportType,
        }));

      if (filesToUpload.length === 0) {
        console.log("\nNo files to upload to Convex.");
      } else {
        console.log(`\nUploading ${filesToUpload.length} file(s) to Convex…`);
        try {
          const bundle = await uploadRunToConvex(filesToUpload, {
            source: historical ? "yardi_sync_historical" : "yardi_sync",
            historical,
            month,
          });
          console.log(`Convex sync_job: ${bundle.jobId}`);
        } catch (err: any) {
          console.error(`Convex upload failed: ${err?.message || err}`);
        }
      }
    }

    process.exitCode = bad > 0 ? 1 : 0;
  } finally {
    await close();
  }
}

main().catch(err => {
  console.error("\nFatal error:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
