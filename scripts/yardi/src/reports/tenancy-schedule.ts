import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's Commercial Tenancy Schedule (Lease Admin → Tenancy Schedule)
 * for one property. The export has a per-lease block with "Rent Steps" rows
 * — these carry the future rent escalation dates + new monthly amounts that
 * drive the rent-roll "Next Rent Increase" column.
 *
 * Verified URL: pages/CommTenancyScheduleSummary.aspx
 *
 * Form fields (from probe-tenancy.ts):
 *   PropertyId_LookupCode   — Yardi property code (e.g. "hol")
 *   PropertyId_Description  — property name
 *   FromDate_TextBox        — "MM/DD/YYYY" (As of Date — required)
 *   RentSchedule_CheckBox   — must be checked to expose Rent Steps section
 *   Amendments_CheckBox     — must be checked to include amendment history
 *   FutureAmendment_CheckBox— include future amendments (we want the new rent
 *                             from any pending amendment on top of base steps)
 *   Excel_Button            — triggers the .xlsx download
 *
 * Excel layout: see parse-tenancy-schedule.ts for the row-by-row breakdown.
 *
 * Soft-fails: the report only returns leases with active steps. Smaller
 * properties may have no escalations at all — caller treats an empty rows[]
 * array as "no scheduled increases" rather than an error.
 */
export async function runTenancyScheduleForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  asOfMonthIso: string
): Promise<string> {
  console.log(
    `\n→ ${property.name} (${property.code}) — Tenancy Schedule for ${asOfMonthIso}`
  );

  await openTenancySchedule(voyagerPage);

  const frame = voyagerPage.frame({ name: "filter" });
  if (!frame) throw new Error("Voyager 'filter' iframe not found.");

  await frame.locator("#PropertyId_LookupCode").waitFor({ timeout: 30_000 });

  // 1. Property — set both LookupCode + Description so Yardi doesn't fall back
  //    to the multi-property default.
  await frame.evaluate(
    ({ code, name }: any) => {
      const codeEl = document.getElementById(
        "PropertyId_LookupCode"
      ) as HTMLInputElement | null;
      const descEl = document.getElementById(
        "PropertyId_Description"
      ) as HTMLInputElement | null;
      if (codeEl) {
        codeEl.value = code;
        codeEl.dispatchEvent(new Event("change", { bubbles: true }));
        codeEl.dispatchEvent(new Event("blur", { bubbles: true }));
      }
      if (descEl) {
        descEl.value = name;
        descEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    { code: property.code, name: property.name }
  );

  const settledCode = await frame
    .locator("#PropertyId_LookupCode")
    .inputValue()
    .catch(() => "");
  console.log(`   PropertyId set: "${settledCode}"`);

  // 2. As-of Date — Yardi needs the date that determines which leases are
  //    active. Using the FIRST of asOfMonthIso (e.g. "2026-05-01") so the
  //    snapshot lines up with the rent roll.
  const [y, m] = asOfMonthIso.split("-").map(Number);
  const mmddyyyy = `${String(m).padStart(2, "0")}/01/${y}`;
  await setInput(frame, "#FromDate_TextBox", mmddyyyy);
  console.log(`   FromDate = ${mmddyyyy}`);

  // 3. Enable the sections we need. RentSchedule exposes the per-step rows
  //    that carry future escalation dates + new rent amounts. Amendments +
  //    FutureAmendment include any pending lease modifications so we pick
  //    up new rents that haven't activated yet.
  const sectionCheckboxes = [
    "RentSchedule_CheckBox",
    "ChargeSchedule_CheckBox",
    "Amendments_CheckBox",
    "FutureAmendment_CheckBox",
  ];
  for (const id of sectionCheckboxes) {
    const cb = frame.locator(`#${id}`);
    if ((await cb.count()) === 0) continue;
    if (!(await cb.isChecked().catch(() => false))) {
      await cb.check().catch(() => {});
    }
  }

  // 4. Trigger Excel download
  const outPath = resolve(
    downloadDirFor(asOfMonthIso),
    `${slugForProperty(property.code)}-tenancy-schedule.xlsx`
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

async function openTenancySchedule(page: Page) {
  // Force fresh load so Yardi resets the form (otherwise it can carry stale
  // ViewState from the previous property's submit).
  const baseUrl = new URL(page.url());
  const formUrl = `${baseUrl.origin}${baseUrl.pathname.replace(
    /[^/]*$/,
    ""
  )}CommTenancyScheduleSummary.aspx?_=${Date.now()}`;

  const filterFrame = page.frame({ name: "filter" });
  if (filterFrame) {
    try {
      await filterFrame.goto(formUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    } catch {
      // Yardi sometimes detaches the frame mid-navigation; fall back to
      // parent-side iframe.src assignment.
      await page.evaluate((url) => {
        const f = document.querySelector(
          'iframe[name="filter"]'
        ) as HTMLIFrameElement | null;
        if (f) f.src = url;
      }, formUrl);
    }
  } else {
    await page.evaluate((url) => {
      const f = document.querySelector(
        'iframe[name="filter"]'
      ) as HTMLIFrameElement | null;
      if (f) f.src = url;
    }, formUrl);
  }

  await page.waitForFunction(
    () => {
      const f = document.querySelector(
        'iframe[name="filter"]'
      ) as HTMLIFrameElement | null;
      return (
        !!f?.contentDocument?.getElementById("PropertyId_LookupCode") &&
        !!f.contentDocument.getElementById("FromDate_TextBox")
      );
    },
    { timeout: 60_000 }
  );
}

async function setInput(frame: any, selector: string, value: string) {
  const el = frame.locator(selector);
  if ((await el.count()) === 0) return;
  await el.click();
  await el.press("Control+A");
  await el.fill(value);
  await el.press("Tab");
}
