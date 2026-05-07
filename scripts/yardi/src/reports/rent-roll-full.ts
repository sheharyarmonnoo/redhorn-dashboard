import { Page } from "playwright";
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
 *   chkIsDetail_CheckBox        — Show Detail (default checked)
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

  // 1. Force Show Detail = checked FIRST — before any other field. The form's
  //    default is "checked" on a fresh load, but Yardi reuses the iframe across
  //    properties in the same session and ASP.NET ViewState carries the
  //    previous-property state (often "unchecked" after a postback). Worse,
  //    setting the DOM `.checked = true` directly does NOT update the server's
  //    perception — when Excel_Button submits, Yardi serializes from the
  //    current DOM but its server-side state machine treats unchecked-at-
  //    render as the source of truth for the report layout, producing a
  //    10-column property-summary export (1 row per property) instead of the
  //    16-column per-lease detail. That mismatch is why the previous fix
  //    (`.checked = true` + `change` event) logged "Show Detail = on" yet
  //    Yardi still exported summary-only — wiping Hollister's 37 tenants down
  //    to a single rollup row on the 2026-05 sync.
  //
  //    The reliable fix is to use Playwright's locator.check() which performs
  //    a real user-style click when the box is unchecked. That fires the
  //    onclick handler, updates the form's submit-time state, and (because we
  //    do this BEFORE setting Property/ReportType/FromDate) any postback that
  //    follows can't clobber values we haven't set yet. check() is a no-op
  //    when already checked, so it doesn't toggle a default-on state OFF.
  const showDetailLoc = frame.locator("#chkIsDetail_CheckBox");
  await showDetailLoc.waitFor({ timeout: 10_000 }).catch(() => {});
  const initiallyChecked = await showDetailLoc.isChecked().catch(() => false);
  await showDetailLoc.check({ force: true, timeout: 10_000 });
  // Let any onclick-driven postback settle. The form may briefly tear down
  // and re-render — wait for the Property field to be available again before
  // proceeding.
  await frame.locator("#PropertyId_LookupCode").waitFor({ timeout: 30_000 });
  const detailChecked = await showDetailLoc.isChecked().catch(() => false);
  if (!detailChecked) {
    throw new Error(
      `Show Detail checkbox failed to enable for ${property.code}; refusing to ` +
      `submit (would produce summary-only export and wipe lease data on ingest).`
    );
  }
  console.log(`   Show Detail = on (was ${initiallyChecked ? "already" : "set via check()"})`);

  // 2. Property — set both LookupCode + Description so Yardi doesn't fall back
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

  // 3. Report Type = Rent Roll
  await frame.locator("#ReportType_DropDownList").selectOption("2");

  // 4. From Date = first day of as-of month (e.g. "05/01/2026")
  const [y, m] = asOfMonthIso.split("-").map(Number);
  const mmddyyyy = `${String(m).padStart(2, "0")}/01/${y}`;
  const dateField = frame.locator("#FromDate_TextBox");
  await dateField.click();
  await dateField.press("Control+A");
  await dateField.fill(mmddyyyy);
  await dateField.press("Tab");
  console.log(`   FromDate = ${mmddyyyy}`);

  // 4b. Re-verify Show Detail survived any field-driven postback. If a server
  //     handler for the Property/ReportType change re-rendered the form, the
  //     checkbox state could have been blown away. Re-check if needed.
  const detailStillChecked = await showDetailLoc.isChecked().catch(() => false);
  if (!detailStillChecked) {
    console.log(`   Show Detail was reset by a postback — re-checking`);
    await showDetailLoc.check({ force: true, timeout: 10_000 });
    const recheck = await showDetailLoc.isChecked().catch(() => false);
    if (!recheck) {
      throw new Error(
        `Show Detail checkbox could not be re-enabled after field changes ` +
        `for ${property.code}; refusing to submit.`
      );
    }
  }

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
