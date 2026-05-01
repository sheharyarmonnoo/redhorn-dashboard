import { openAuthenticatedSession } from "./auth.js";
import { getProperties } from "./properties.js";
import { runIncomeStatementForProperty } from "./reports/income-statement.js";
import { latestClosedMonth } from "./paths.js";
import { uploadRunToConvex } from "./convex-upload.js";

interface RunResult {
  property: string;
  propertyCode: string;
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

  console.log(`\nYardi Income Statement scraper`);
  console.log(`  month:     ${month}`);
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
      try {
        const path = await runIncomeStatementForProperty(voyager, property, month, templateArg);
        // We pass convexCode downstream so the ingest mutation can resolve to the right propertyId.
        results.push({ property: property.name, propertyCode: property.convexCode, ok: true, path });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`   FAILED — ${msg}`);
        results.push({ property: property.name, propertyCode: property.convexCode, ok: false, error: msg });
      }
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
          reportType: "income_statement",
        }));

      if (filesToUpload.length === 0) {
        console.log("\nNo files to upload to Convex.");
      } else {
        console.log(`\nUploading ${filesToUpload.length} file(s) to Convex…`);
        try {
          const bundle = await uploadRunToConvex(filesToUpload, { source: "yardi_playwright" });
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
