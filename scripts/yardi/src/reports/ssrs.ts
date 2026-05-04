import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Generic Yardi SSRS report scraper.
 *
 * SSRS reports in Yardi all live behind one gateway:
 *   pages/SSRSReportFilter.aspx?select=reports/<reportFile>.SSRS.txt
 *
 * Form fields are consistent across reports:
 *   phMy        → property code (text input)
 *   begmonth    → MM/YYYY start of period
 *   endmonth    → MM/YYYY end of period
 *   begdate     → "as of" date for aging-style reports (MM/DD/YYYY)
 *   RptOutput   → output destination select; we set "Filexlsx" for Excel download
 *   <submit>    → form's <input type="submit"> triggers the report
 *
 * Verified against rs_Comm_Lease_Ledger.SSRS.txt; same structure applies to all
 * commercial SSRS reports (Customer Ledger, Customer Statement, etc.).
 */
export interface SsrsRunOptions {
  reportFile: string;            // e.g. "rs_Comm_Lease_Ledger.SSRS.txt"
  outputFilename: string;        // local filename to save (within month dir)
  reportLabel: string;           // human label for logs
  setMonthRange?: boolean;       // default true — fill begmonth/endmonth
  setBegDate?: boolean;          // default false — fill begdate to end-of-period
}

export async function runSsrsReportForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  monthIso: string,
  opts: SsrsRunOptions
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — ${opts.reportLabel} for ${monthIso}`);

  const baseUrl = new URL(voyagerPage.url());
  const ssrsUrl = `${baseUrl.origin}${baseUrl.pathname.replace(/menu\.aspx.*$/i, "SSRSReportFilter.aspx")}?select=reports/${opts.reportFile}&sMenuSet=iData&_=${Date.now()}`;

  const filterFrame = voyagerPage.frame({ name: "filter" });
  if (!filterFrame) throw new Error("Voyager 'filter' iframe not found.");

  await filterFrame.goto(ssrsUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Wait for SSRS form to render — the property text input (phMy) is the
  // canonical signal that the form is live.
  await voyagerPage.waitForFunction(
    () => {
      const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
      return !!f?.contentDocument?.querySelector('input[name="phMy"], input[id="phMy"]');
    },
    { timeout: 30_000 }
  );

  const frame = voyagerPage.frame({ name: "filter" })!;

  // Property
  await setSsrsField(frame, "phMy", property.code);

  // Period
  if (opts.setMonthRange !== false) {
    const [y, m] = monthIso.split("-").map(Number);
    const mmyy = `${String(m).padStart(2, "0")}/${y}`;
    await setSsrsField(frame, "begmonth", mmyy);
    await setSsrsField(frame, "endmonth", mmyy);
  }

  // Optional as-of date (some SSRS reports use begdate for aging)
  if (opts.setBegDate) {
    const [y, m] = monthIso.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const mmddyyyy = `${String(m).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}/${y}`;
    await setSsrsField(frame, "begdate", mmddyyyy);
  }

  // Output to Excel file (downloads as .xlsx)
  await setSsrsSelect(frame, "RptOutput", "Filexlsx");

  // Submit — first <input type="submit"> in the form
  const outPath = resolve(downloadDirFor(monthIso), opts.outputFilename || `${slugForProperty(property.code)}-${opts.reportFile.replace(/\.SSRS\.txt$/i, "")}.xlsx`);

  const submitBtn = frame.locator('input[type="submit"]').first();
  const [download] = await Promise.all([
    voyagerPage.waitForEvent("download", { timeout: 240_000 }),
    submitBtn.click(),
  ]);
  await download.saveAs(outPath);
  console.log(`   saved → ${outPath}`);
  return outPath;
}

async function setSsrsField(frame: any, fieldName: string, value: string) {
  // SSRS fields are addressed by `name` attribute, not always by id. Try both.
  const byName = frame.locator(`input[name="${fieldName}"]`).first();
  const byId = frame.locator(`#${fieldName}`).first();
  const target = (await byName.count()) > 0 ? byName : (await byId.count()) > 0 ? byId : null;
  if (!target) {
    console.log(`   warn: SSRS field ${fieldName} not found — skipping`);
    return;
  }
  await target.click();
  await target.press("Control+A");
  await target.fill(value);
  await target.press("Tab");
}

async function setSsrsSelect(frame: any, fieldName: string, value: string) {
  const byName = frame.locator(`select[name="${fieldName}"]`).first();
  const byId = frame.locator(`#${fieldName}`).first();
  const target = (await byName.count()) > 0 ? byName : (await byId.count()) > 0 ? byId : null;
  if (!target) {
    console.log(`   warn: SSRS select ${fieldName} not found — skipping`);
    return;
  }
  await target.selectOption(value);
}
