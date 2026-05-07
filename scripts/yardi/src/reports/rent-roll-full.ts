import { Page, Frame } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's Commercial Analytics > Property > Rent Roll for one property.
 *
 * URL: pages/CommReportPropertySummary.aspx?sMenuSet=iAnalytics
 * (verified 2026-05; the legacy `CmrRentl.aspx` family does not exist on
 * this Yardi instance.)
 *
 * Form fields (from probe-comm-analytics.ts):
 *   PropertyId_LookupCode       — property code (lowercase d in "Id")
 *   PropertyId_Description      — property name
 *   ReportType_DropDownList     — value="2" for "Rent Roll"
 *   FromDate_TextBox            — MM/DD/YYYY (we use first day of month)
 *   PeriodType_DropDownList     — "1" Monthly (default)
 *   SummarizeBy_DropDownList    — "1" Property (default)
 *   chkIsDetail_CheckBox        — Show Detail (must be checked at POST time
 *                                  for per-lease detail; otherwise server
 *                                  returns 10-col property summary)
 *   YsiChkShowActiveLease_CheckBox / chkShowSpecialtyLeases_CheckBox / etc.
 *   Excel_Button                — triggers the xlsx download
 *
 * The exported Excel ("Rent Roll" sheet "Report1") has 16 columns including
 * Security Deposit (col 14) and LOC Amount/Bank Guarantee (col 15) — these
 * are exactly what the dashboard "Current Leases" panel scrape was missing.
 */
export async function runRentRollFullForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  asOfMonthIso: string
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — Rent Roll (Commercial Analytics) for ${asOfMonthIso}`);

  await openCommercialAnalytics(voyagerPage);

  const frame = voyagerPage.frame({ name: "filter" });
  if (!frame) throw new Error("Voyager 'filter' iframe not found.");

  // Wait for the Property field to render (signal the form is ready)
  await frame.locator("#PropertyId_LookupCode").waitFor({ timeout: 30_000 });

  // 1. Property — set both LookupCode + Description so Yardi doesn't fall back
  //    to the multi-property default ("bel^.redhorn^hol")
  await frame.evaluate(({ code, name }: any) => {
    const codeEl = document.getElementById("PropertyId_LookupCode") as HTMLInputElement | null;
    const descEl = document.getElementById("PropertyId_Description") as HTMLInputElement | null;
    if (codeEl) {
      codeEl.value = code;
      codeEl.dispatchEvent(new Event("change", { bubbles: true }));
      codeEl.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    if (descEl) {
      descEl.value = name;
      descEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, { code: property.code, name: property.name });

  const settledCode = await frame.locator("#PropertyId_LookupCode").inputValue().catch(() => "");
  console.log(`   PropertyId set to: "${settledCode}"`);

  // 2. Report Type = Rent Roll
  await frame.locator("#ReportType_DropDownList").selectOption("2");

  // 3. From Date = first day of as-of month (e.g. "05/01/2026")
  const [y, m] = asOfMonthIso.split("-").map(Number);
  const mmddyyyy = `${String(m).padStart(2, "0")}/01/${y}`;
  const dateField = frame.locator("#FromDate_TextBox");
  await dateField.click();
  await dateField.press("Control+A");
  await dateField.fill(mmddyyyy);
  await dateField.press("Tab");
  console.log(`   FromDate = ${mmddyyyy}`);

  // 4. Show Detail = checked, AT POST TIME. This is the load-bearing step.
  //
  //    Investigation (probe-rr-detail.ts: scenarios A vs B):
  //      Scenario A — set field values, then check Show Detail with
  //        .check({force:true}) twice (once before, once after setProperty),
  //        click Excel immediately. Network capture: the POST body sent to
  //        the server has chkIsDetail ABSENT, even though `cb.checked` reads
  //        `true` and the form's element collection serializes it as "on".
  //        Result: 10-col property-summary export.
  //      Scenario B — set fields, wait 3000ms after the date Tab postback,
  //        re-verify the checkbox (it reads `false` after the wait — the
  //        postback wiped it), re-check, then click Excel. Network capture:
  //        chkIsDetail=on is in the POST body. Result: 16-col detail export.
  //
  //    Root cause: the date-field Tab postback, the ReportType selectOption
  //    postback, and any Property-change postback all queue a server round
  //    trip that re-renders the form and resets chkIsDetail to its server
  //    default (off, on this instance). When Playwright's `.check()` runs
  //    BEFORE the postback completes, the postback's response wins and our
  //    check is silently undone — but the new form's HTML hasn't been parsed
  //    into `cb.checked` yet, so a synchronous read still returns `true`.
  //    By the time Excel is submitted, the box is unchecked AT POST TIME.
  //
  //    The fix: wait for postback quiescence, THEN check + re-verify in a
  //    short loop until the state is stable. Only THEN click Excel.
  await ensureShowDetailOnAndStable(voyagerPage, frame, property.code);

  // 5. Click Excel and capture the download
  const outPath = resolve(
    downloadDirFor(asOfMonthIso),
    `${slugForProperty(property.code)}-rent-roll-full.xlsx`
  );
  const excelBtn = frame.locator("#Excel_Button");
  const [download] = await Promise.all([
    voyagerPage.waitForEvent("download", { timeout: 180_000 }),
    excelBtn.click(),
  ]);
  await download.saveAs(outPath);

  console.log(`   saved → ${outPath}`);
  return outPath;
}

/**
 * Wait for any pending field-driven postback to settle, then check the
 * Show Detail box and re-verify it actually stays checked. The probe found
 * the postback can take up to ~2.5s after the date Tab event to land and
 * uncheck the box behind our back; we wait longer than that and then
 * verify-and-recheck up to 5 times. If the state can't be stabilised we
 * throw — better to fail loudly than ship summary-only data and wipe leases.
 */
async function ensureShowDetailOnAndStable(page: Page, frame: Frame, propertyCode: string): Promise<void> {
  // Initial settle delay: the date Tab + ReportType selectOption postbacks
  // are async; give them ~3s to land and reset the form.
  await page.waitForTimeout(3000);

  const cbLoc = frame.locator("#chkIsDetail_CheckBox");
  await cbLoc.waitFor({ timeout: 10_000 }).catch(() => {});

  for (let attempt = 1; attempt <= 5; attempt++) {
    // Check the box (no-op if already checked).
    await cbLoc.check({ force: true, timeout: 10_000 });

    // Wait long enough for any onclick-driven postback to land. The Yardi
    // chkIsDetail handler doesn't trigger a server postback (verified — its
    // onclick is just `gotChange2(this);` which is a client-side change tracker),
    // but the form may still be processing a residual postback from the date
    // Tab event. 1.5s is conservatively past the longest observed roundtrip.
    await page.waitForTimeout(1500);

    // Re-read the checkbox state. If a postback re-rendered the form and
    // unchecked it, this read will catch that.
    const stillChecked = await cbLoc.isChecked().catch(() => false);
    if (stillChecked) {
      // Stable — do one final read after another short wait to make sure no
      // late postback flips it after we look.
      await page.waitForTimeout(500);
      const finalChecked = await cbLoc.isChecked().catch(() => false);
      if (finalChecked) {
        console.log(`   Show Detail = on (stable on attempt ${attempt})`);
        return;
      }
    }
    console.log(`   Show Detail attempt ${attempt}: was reset by a late postback — retrying`);
  }

  throw new Error(
    `Show Detail could not be held stable for ${propertyCode} across 5 attempts; ` +
    `refusing to submit and produce a summary-only export that would wipe lease data.`
  );
}

async function openCommercialAnalytics(page: Page) {
  // Force a fresh load so Yardi resets the form (otherwise it can carry stale
  // ViewState from the previous property's submit).
  const baseUrl = new URL(page.url());
  const formUrl =
    `${baseUrl.origin}${baseUrl.pathname.replace(/[^/]*$/, "")}CommReportPropertySummary.aspx?sMenuSet=iAnalytics&_=${Date.now()}`;

  const filterFrame = page.frame({ name: "filter" });
  if (filterFrame) {
    await filterFrame.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } else {
    await page.evaluate((url) => {
      const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
      if (f) f.src = url;
    }, formUrl);
  }

  await page.waitForFunction(() => {
    const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
    return !!f?.contentDocument?.getElementById("PropertyId_LookupCode")
      && !!f.contentDocument.getElementById("ReportType_DropDownList");
  }, { timeout: 60_000 });
}
