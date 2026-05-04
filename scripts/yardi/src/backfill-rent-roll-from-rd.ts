import { ConvexHttpClient } from "convex/browser";
import { config } from "./config.js";
import { parseReceivableDetail } from "./parse-receivable-detail.js";

/**
 * One-off backfill: read every receivable_detail.xlsx we have on disk, extract
 * the lease-information blocks, and enrich the existing tenants table via
 * tenants.enrichRentByCode. Lets us populate monthly rent / lease term / sqft
 * / lease type without re-running the full Yardi scrape.
 */
async function main() {
  const url = config.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL missing");
  const client = new ConvexHttpClient(url);

  const files: Array<{ filePath: string; propertyCode: string }> = [
    { filePath: "downloads/2026-04/hol-receivable-detail.xlsx", propertyCode: "hollister" },
    { filePath: "downloads/2026-04/bel-receivable-detail.xlsx", propertyCode: "belgold" },
  ];

  for (const f of files) {
    console.log(`\n${f.propertyCode}: parsing ${f.filePath}`);
    const parsed = parseReceivableDetail(f.filePath);
    console.log(`  ${parsed.leases.length} lease blocks · ${parsed.rows.length} transactions`);
    const rows = parsed.leases
      .filter(l => l.unit || l.tenantName)
      .map(l => ({
        unit: (l.unit || "").trim(),
        tenant: l.tenantName,
        monthlyRent: l.monthlyRent,
        leaseType: l.leaseType,
        sqft: l.sqft,
        leaseFrom: l.leaseFrom,
        leaseTo: l.leaseTo,
      }))
      .filter(r => r.unit.length > 0);
    if (rows.length === 0) {
      console.log(`  (no enrich rows)`);
      continue;
    }
    const result: any = await client.mutation("tenants:enrichRentByCode" as any, {
      propertyCode: f.propertyCode,
      rows,
    });
    console.log(`  enriched ${result.matched}/${result.tenants} tenants from ${rows.length} lease blocks`);
  }
}

main().catch(err => {
  console.error("Fatal:", err?.message || err);
  process.exit(1);
});
