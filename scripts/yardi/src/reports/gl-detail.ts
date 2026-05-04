import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's GL Transaction Detail report for one property and save the Excel.
 *
 * The same Custom Financials engine that drives the income statement can emit
 * GL detail with a different template. We try a list of known-good template
 * codes (transaction-level / detail variants) before falling back to the
 * "GLDetail.aspx" page if Custom Financials doesn't have a detail template
 * configured.
 *
 * Output is a file with one row per journal entry: post date, account,
 * description, reference, debit, credit. The parser handles header variation.
 */
const DETAIL_TEMPLATE_CANDIDATES = [
  "GL_Detail",
  "GLDetail",
  "TransDetail",
  "GL_TransDtl",
  "PostingDtl",
];

const DIRECT_URLS = [
  "GLDetail.aspx",
  "GlDetail.aspx",
  "GLPosDtl.aspx",
  "PostingDetail.aspx",
];

export async function runGlDetailForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  monthIso: string
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — GL Transaction Detail for ${monthIso}`);

  // Strategy 1: try Custom Financials with a detail-flavored template. This
  // reuses the same form we already drive for the income statement, so we
  // know the field IDs work.
  const customFinancialsResult = await tryCustomFinancials(voyagerPage, property, monthIso);
  if (customFinancialsResult) return customFinancialsResult;

  // Strategy 2: fall back to a dedicated GL detail page if Custom Financials
  // doesn't have a detail template configured.
  const directResult = await tryDirectPage(voyagerPage, property, monthIso);
  if (directResult) return directResult;

  throw new Error(
    `GL detail report did not render. Tried templates: ${DETAIL_TEMPLATE_CANDIDATES.join(", ")} and pages: ${DIRECT_URLS.join(", ")}`
  );
}

async function tryCustomFinancials(page: Page, property: YardiProperty, monthIso: string): Promise<string | null> {
  const baseUrl = new URL(page.url());
  const url = `${baseUrl.origin}${baseUrl.pathname.replace(/menu\.aspx.*$/i, "GlRepCustom.aspx")}?sMenuSet=iData&_=${Date.now()}`;
  const filterFrame = page.frame({ name: "filter" });
  if (!filterFrame) return null;
  await filterFrame.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});

  const ready = await page.waitForFunction(
    () => {
      const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
      return !!f?.contentDocument?.getElementById("PropertyID_LookupCode");
    },
    { timeout: 8_000 }
  ).then(() => true).catch(() => false);
  if (!ready) return null;

  const frame = page.frame({ name: "filter" })!;
  await setLookupDirect(frame, "PropertyID", property.code, property.name);

  const [y, m] = monthIso.split("-").map(Number);
  const mmyy = `${String(m).padStart(2, "0")}/${y}`;

  for (const template of DETAIL_TEMPLATE_CANDIDATES) {
    try {
      await setLookupDirect(frame, "TemplateID", template, template);
      await setInputIfPresent(frame, "#FromMMYY_TextBox", mmyy);
      await setInputIfPresent(frame, "#ToMMYY_TextBox", mmyy);

      const outPath = resolve(downloadDirFor(monthIso), `${slugForProperty(property.code)}-gl-detail.xlsx`);
      const excelBtn = frame.locator("#Excel_Button");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        excelBtn.click(),
      ]).catch(() => [null]);
      if (download) {
        await download.saveAs(outPath);
        console.log(`   matched custom-financials template → ${template}`);
        console.log(`   saved → ${outPath}`);
        return outPath;
      }
    } catch {
      // try next template
    }
  }
  return null;
}

async function tryDirectPage(page: Page, property: YardiProperty, monthIso: string): Promise<string | null> {
  const baseUrl = new URL(page.url());
  const baseDir = baseUrl.pathname.replace(/[^/]*$/, "");
  const [y, m] = monthIso.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mmddyyyy = (d: number) => `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;

  for (const candidate of DIRECT_URLS) {
    const url = `${baseUrl.origin}${baseDir}${candidate}?sMenuSet=iData&_=${Date.now()}`;
    try {
      const filterFrame = page.frame({ name: "filter" });
      if (filterFrame) {
        await filterFrame.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      }
      const ok = await page.waitForFunction(
        () => {
          const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
          return !!f?.contentDocument?.getElementById("PropertyID_LookupCode");
        },
        { timeout: 5_000 }
      ).then(() => true).catch(() => false);
      if (!ok) continue;

      const frame = page.frame({ name: "filter" })!;
      await setLookupDirect(frame, "PropertyID", property.code, property.name);
      await trySetDateRange(frame, mmddyyyy(1), mmddyyyy(lastDay));

      const outPath = resolve(downloadDirFor(monthIso), `${slugForProperty(property.code)}-gl-detail.xlsx`);
      const excelBtn = frame.locator("#Excel_Button");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 90_000 }),
        excelBtn.click(),
      ]);
      await download.saveAs(outPath);
      console.log(`   matched direct page → ${candidate}`);
      console.log(`   saved → ${outPath}`);
      return outPath;
    } catch {
      // try next URL
    }
  }
  return null;
}

async function trySetDateRange(frame: any, from: string, to: string) {
  const fromCandidates = ["#FromDate", "#FromDate_TextBox", "#StartDate", "#PostDateFrom"];
  const toCandidates = ["#ToDate", "#ToDate_TextBox", "#EndDate", "#PostDateTo"];
  for (const sel of fromCandidates) {
    const loc = frame.locator(sel).first();
    if ((await loc.count()) > 0) { await setInputIfPresent(frame, sel, from); break; }
  }
  for (const sel of toCandidates) {
    const loc = frame.locator(sel).first();
    if ((await loc.count()) > 0) { await setInputIfPresent(frame, sel, to); break; }
  }
}

async function setInputIfPresent(frame: any, selector: string, value: string) {
  const loc = frame.locator(selector).first();
  if ((await loc.count()) === 0) return;
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
