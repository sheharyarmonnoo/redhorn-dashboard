import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";
import { fetchYardiReportAttachment } from "../gmail.js";

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
  emailSubjectKeywords?: string[]; // legacy — only used if we ever fall back to email
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

  // Output: render to Screen. Yardi opens a popup at SSRSReportViewer.aspx
  // with the rendered report. Standard Microsoft SSRS ReportViewer exposes
  // a public JS API: $find('ReportViewer1').exportReport('EXCELOPENXML').
  // We call it in the popup's context to trigger a clean .xlsx download.
  await setSsrsSelect(frame, "RptOutput", "Screen");

  const outPath = resolve(
    downloadDirFor(monthIso),
    opts.outputFilename || `${slugForProperty(property.code)}-${opts.reportFile.replace(/\.SSRS\.txt$/i, "")}.xlsx`
  );

  const submitBtn = frame.locator('input[type="submit"]').first();
  const context = voyagerPage.context();

  // Yardi's form has target="filter" which matches the iframe we loaded the
  // form into — so submit normally posts back INTO the iframe, no new window.
  // In manual usage outside an iframe, target="filter" has no match and the
  // browser opens a new window. We need that new-window behavior in Playwright
  // too, so we retarget to "_blank" right before submit.
  await frame.evaluate(() => {
    const form = document.querySelector("form");
    if (form) form.setAttribute("target", "_blank");
  });

  const [viewerPopup] = await Promise.all([
    context.waitForEvent("page", { timeout: 60_000 }),
    submitBtn.click(),
  ]);

  console.log(`   ${opts.reportLabel} viewer popup opened`);

  // Wait until the SSRS ReportViewer JS object is alive in the popup.
  await viewerPopup.waitForFunction(
    () => {
      const w = window as any;
      return typeof w.$find === "function" && w.$find("ReportViewer1") !== null && w.$find("ReportViewer1") !== undefined;
    },
    null,
    { timeout: 120_000 }
  );

  // Give the report itself a beat to render (SSRS exports won't bind to the
  // dataset until the viewer has finished its initial paint).
  await viewerPopup.waitForTimeout(2000);

  // Trigger Excel export and capture the resulting download. SSRS opens a
  // throwaway popup to deliver the file; the download event bubbles up to
  // the context, so listen there.
  const [download] = await Promise.all([
    context.waitForEvent("page", { timeout: 60_000 })
      .then(p => p.waitForEvent("download", { timeout: 60_000 })
        .then(d => { p.close().catch(() => {}); return d; }))
      .catch(() => null),
    viewerPopup.evaluate(() => {
      const w = window as any;
      w.$find("ReportViewer1").exportReport("EXCELOPENXML");
    }),
  ]);

  // Some SSRS configs deliver the download directly on the viewer page
  // instead of a child popup; if the popup race didn't catch it, try the
  // viewer page's download event as a fallback.
  let final = download;
  if (!final) {
    console.log(`   no popup download; checking viewer page directly…`);
    final = await viewerPopup.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
  }
  if (!final) {
    throw new Error(`SSRS export download never fired for ${opts.reportLabel}`);
  }

  await final.saveAs(outPath);
  await viewerPopup.close().catch(() => {});

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
