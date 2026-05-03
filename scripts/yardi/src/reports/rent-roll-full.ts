import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's full Commercial Rent Roll report (the one under
 * Reports > Tenant Reports / Commercial > Rent Roll) for one property and
 * save the Excel.
 *
 * Difference from the dashboard "Current Leases" panel: this report includes
 * Base Rent, Recovery / CAM, lease start dates, and security deposits — which
 * the dashboard panel does NOT carry. We use it to populate the rent + start
 * columns on the dashboard's Rent Roll page.
 *
 * Yardi versions name this report differently. We probe a set of likely
 * URLs and use the first one whose form actually renders. The form fields
 * are consistent across versions (PropertyID + AsOfDate + Excel_Button).
 */
const CANDIDATE_URLS = [
  "CmrRentl.aspx",      // most common: Commercial Rent Roll (classic)
  "CMRR.aspx",
  "CMRRChrgs.aspx",     // Rent Roll with Charges
  "CMRRRecur.aspx",     // Recurring Rent Roll
  "RentRoll.aspx",
  "RRollByLease.aspx",
];

export async function runRentRollFullForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  asOfMonthIso: string
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — Rent Roll (full) for ${asOfMonthIso}`);

  const frame = await openRentRollForm(voyagerPage);
  if (!frame) {
    throw new Error(
      `Rent roll form did not render at any candidate URL. Tried: ${CANDIDATE_URLS.join(", ")}`
    );
  }

  // Property
  await setLookupDirect(frame, "PropertyID", property.code, property.name);

  // As-of date — either a separate AsOfDate textbox or a Period MM/YYYY pair.
  // Try AsOfDate first (commercial rent roll classic), fall back to MM/YY pair.
  const [y, m] = asOfMonthIso.split("-").map(Number);
  // Use end-of-month for snapshot semantics
  const lastDay = new Date(y, m, 0).getDate();
  const mmddyyyy = `${String(m).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}/${y}`;
  const mmyy = `${String(m).padStart(2, "0")}/${y}`;
  const dateFieldSet = await trySetAsOfDate(frame, mmddyyyy, mmyy);
  console.log(`   date field set via: ${dateFieldSet}`);

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
 * Probe each candidate URL in order. A URL "works" when the filter iframe
 * renders a `#PropertyID_LookupCode` field within a few seconds — that's the
 * universal Yardi signal that the form loaded.
 */
async function openRentRollForm(page: Page) {
  const baseUrl = new URL(page.url());
  const baseDir = baseUrl.pathname.replace(/[^/]*$/, "");
  for (const candidate of CANDIDATE_URLS) {
    const url = `${baseUrl.origin}${baseDir}${candidate}?sMenuSet=iData&_=${Date.now()}`;
    try {
      const frame = page.frame({ name: "filter" });
      if (frame) {
        await frame.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      } else {
        await page.evaluate((u) => {
          const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
          if (f) f.src = u;
        }, url);
      }

      // Wait briefly for the property field to appear; if it does, we found the form.
      const ok = await page.waitForFunction(
        () => {
          const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
          return !!f?.contentDocument?.getElementById("PropertyID_LookupCode");
        },
        { timeout: 6_000 }
      ).then(() => true).catch(() => false);

      if (ok) {
        const matched = page.frame({ name: "filter" });
        if (matched) {
          console.log(`   matched rent roll URL → ${candidate}`);
          return matched;
        }
      } else {
        console.log(`   ${candidate}: form did not render`);
      }
    } catch (err: any) {
      console.log(`   ${candidate}: ${err?.message || err}`);
    }
  }
  return null;
}

async function trySetAsOfDate(frame: any, mmddyyyy: string, mmyy: string): Promise<string> {
  // Common Yardi date inputs for rent-roll: AsOfDate, As_Of_Date, RptDate, FromDate
  const dateCandidates = [
    "#AsOfDate", "#AsOfDate_TextBox",
    "#As_Of_Date", "#AsOf_Date_TextBox",
    "#RptDate", "#RptDate_TextBox",
    "#FromDate", "#FromDate_TextBox",
  ];
  for (const sel of dateCandidates) {
    const loc = frame.locator(sel).first();
    if ((await loc.count()) > 0) {
      await loc.click();
      await loc.press("Control+A");
      await loc.fill(mmddyyyy);
      await loc.press("Tab");
      return sel;
    }
  }
  // Fall back to the period MM/YY pair used by financial reports
  const pairCandidates: Array<[string, string]> = [
    ["#FromMMYY_TextBox", "#ToMMYY_TextBox"],
    ["#FromPeriod", "#ToPeriod"],
  ];
  for (const [from, to] of pairCandidates) {
    const f = frame.locator(from).first();
    const t = frame.locator(to).first();
    if ((await f.count()) > 0 && (await t.count()) > 0) {
      for (const loc of [f, t]) {
        await loc.click();
        await loc.press("Control+A");
        await loc.fill(mmyy);
        await loc.press("Tab");
      }
      return `${from} + ${to}`;
    }
  }
  return "(none — form has no recognized date field)";
}

async function setLookupDirect(frame: any, prefix: string, code: string, description: string) {
  const codeId = `${prefix}_LookupCode`;
  const descId = `${prefix}_Description`;
  await frame.evaluate(({ codeId, descId, code, description }: any) => {
    const codeEl = document.getElementById(codeId) as HTMLInputElement | null;
    const descEl = document.getElementById(descId) as HTMLInputElement | null;
    if (codeEl) {
      codeEl.value = code;
      codeEl.dispatchEvent(new Event("change", { bubbles: true }));
      codeEl.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    if (descEl) {
      descEl.value = description;
      descEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, { codeId, descId, code, description });
}
