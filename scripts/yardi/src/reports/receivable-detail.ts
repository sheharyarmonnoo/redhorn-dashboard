import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's Receivable Detail report (per-tenant charge + payment activity)
 * for one property and save the Excel.
 *
 * Probes a list of likely Yardi commercial AR detail URLs and uses the first
 * one whose form actually renders. Form fields are consistent across versions:
 * PropertyID + a date range + Excel button.
 */
const CANDIDATE_URLS = [
  "RecvDetl.aspx",
  "RecRcvDetl.aspx",
  "RecvDetail.aspx",
  "RentDetl.aspx",
  "ARDetail.aspx",
  "OpenRcv.aspx",
  "AgeRcvDetail.aspx",
  "CMOAgeingDetail.aspx",
];

export async function runReceivableDetailForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  monthIso: string
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — Receivable Detail for ${monthIso}`);

  const frame = await openReceivableForm(voyagerPage);
  if (!frame) {
    throw new Error(
      `Receivable detail form did not render at any candidate URL. Tried: ${CANDIDATE_URLS.join(", ")}`
    );
  }

  await setLookupDirect(frame, "PropertyID", property.code, property.name);

  const [y, m] = monthIso.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const fromDate = `${String(m).padStart(2, "0")}/01/${y}`;
  const toDate = `${String(m).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}/${y}`;
  const fieldUsed = await trySetDateRange(frame, fromDate, toDate);
  console.log(`   date range set via: ${fieldUsed}`);

  const outPath = resolve(downloadDirFor(monthIso), `${slugForProperty(property.code)}-receivable-detail.xlsx`);
  const excelBtn = frame.locator("#Excel_Button");
  const [download] = await Promise.all([
    voyagerPage.waitForEvent("download", { timeout: 180_000 }),
    excelBtn.click(),
  ]);
  await download.saveAs(outPath);
  console.log(`   saved → ${outPath}`);
  return outPath;
}

async function openReceivableForm(page: Page) {
  const baseUrl = new URL(page.url());
  const baseDir = baseUrl.pathname.replace(/[^/]*$/, "");
  for (const candidate of CANDIDATE_URLS) {
    const url = `${baseUrl.origin}${baseDir}${candidate}?sMenuSet=iData&_=${Date.now()}`;
    try {
      const frame = page.frame({ name: "filter" });
      if (frame) {
        await frame.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      }
      const ok = await page.waitForFunction(
        () => {
          const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
          return !!f?.contentDocument?.getElementById("PropertyID_LookupCode");
        },
        { timeout: 5_000 }
      ).then(() => true).catch(() => false);

      if (ok) {
        const matched = page.frame({ name: "filter" });
        if (matched) {
          console.log(`   matched receivable URL → ${candidate}`);
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

async function trySetDateRange(frame: any, from: string, to: string): Promise<string> {
  const pairCandidates: Array<[string, string]> = [
    ["#FromDate", "#ToDate"],
    ["#FromDate_TextBox", "#ToDate_TextBox"],
    ["#StartDate", "#EndDate"],
    ["#TransDateFrom", "#TransDateTo"],
    ["#PostDateFrom", "#PostDateTo"],
  ];
  for (const [fromSel, toSel] of pairCandidates) {
    const f = frame.locator(fromSel).first();
    const t = frame.locator(toSel).first();
    if ((await f.count()) > 0 && (await t.count()) > 0) {
      await setInput(frame, fromSel, from);
      await setInput(frame, toSel, to);
      return `${fromSel} + ${toSel}`;
    }
  }
  // Some receivable reports use a single AsOfDate
  const asOfCandidates = ["#AsOfDate", "#AsOfDate_TextBox", "#RptDate"];
  for (const sel of asOfCandidates) {
    if ((await frame.locator(sel).first().count()) > 0) {
      await setInput(frame, sel, to);
      return sel;
    }
  }
  return "(none — form has no recognized date field)";
}

async function setInput(frame: any, selector: string, value: string) {
  const loc = frame.locator(selector).first();
  await loc.click();
  await loc.press("Control+A");
  await loc.fill(value);
  await loc.press("Tab");
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
