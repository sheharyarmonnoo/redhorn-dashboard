import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's 12 Month Budget report (Reports → Financial Reports →
 * 12 Month Budget) for one property + period range. Output drives the
 * Budget vs Actuals tab on the Financials page.
 *
 * Verified URL: pages/GlRepFinancial.aspx?sMenuSet=iData
 * (the Financial Analytics filter form).
 *
 * Form fields (from probe-budget.ts):
 *   PropertyID_LookupCode      — Yardi property code (e.g. "hol")
 *   PropertyID_Description     — property name
 *   ReportNum_DropDownList     — value="8" for "12 Month Budget"
 *   BookID_LookupCode          — "Accrual" (default)
 *   TreeID_LookupCode          — account tree (optional, defaults to instance default)
 *   FromMMYY_TextBox           — "MM/YYYY" (period start)
 *   ToMMYY_TextBox             — "MM/YYYY" (period end)
 *   Excel_Button               — triggers the xlsx download
 *
 * Excel layout (Sheet "Report1"):
 *   row 0: "Hollister BP1 LLC (hol)"
 *   row 1: "Budget"
 *   row 2: "Period = Jun 2025-May 2026"
 *   row 3: "Book = Accrual"
 *   row 4: ["", "Jun 2025", "Jul 2025", …, "May 2026", "Total"]   ← month headers
 *   row 5+: line items (indented), 12 monthly numbers + total
 */
export async function runTwelveMonthBudgetForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  periodStartIso: string,        // "2025-06"
  periodEndIso: string            // "2026-05"
): Promise<string> {
  console.log(
    `\n→ ${property.name} (${property.code}) — 12 Month Budget for ${periodStartIso} → ${periodEndIso}`
  );

  await openFinancialAnalytics(voyagerPage);

  let frame = voyagerPage.frame({ name: "filter" });
  if (!frame) throw new Error("Voyager 'filter' iframe not found.");

  await frame.locator("#PropertyID_LookupCode").waitFor({ timeout: 30_000 });

  // 1. Property — write LookupCode + Description directly so Yardi doesn't
  //    fall back to the default multi-property selection.
  await frame.evaluate(({ code, name }: any) => {
    const codeEl = document.getElementById("PropertyID_LookupCode") as HTMLInputElement | null;
    const descEl = document.getElementById("PropertyID_Description") as HTMLInputElement | null;
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

  const settledCode = await frame.locator("#PropertyID_LookupCode").inputValue().catch(() => "");
  console.log(`   PropertyID set: "${settledCode}"`);

  // 2. ReportNum = 8 (12 Month Budget)
  await frame.locator("#ReportNum_DropDownList").selectOption("8");

  // 3. Book = Accrual
  await setInput(frame, "#BookID_LookupCode", "Accrual");

  // 4. Period MM/YYYY
  const fromMmYy = `${periodStartIso.slice(5, 7)}/${periodStartIso.slice(0, 4)}`;
  const toMmYy = `${periodEndIso.slice(5, 7)}/${periodEndIso.slice(0, 4)}`;
  await setInput(frame, "#FromMMYY_TextBox", fromMmYy);
  await setInput(frame, "#ToMMYY_TextBox", toMmYy);
  console.log(`   period: ${fromMmYy} → ${toMmYy}`);

  // 5. Click Excel and capture download. Use the period-end month as the
  //    download dir anchor so syncs landing on month X save the budget
  //    alongside the income statement / rent roll for the same X.
  const outPath = resolve(
    downloadDirFor(periodEndIso),
    `${slugForProperty(property.code)}-12month-budget.xlsx`
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

async function openFinancialAnalytics(page: Page) {
  // Force fresh load with cache-busting query so Yardi doesn't carry
  // ViewState from the previous property's submit.
  const baseUrl = new URL(page.url());
  const formUrl =
    `${baseUrl.origin}${baseUrl.pathname.replace(/[^/]*$/, "")}GlRepFinancial.aspx?sMenuSet=iData&_=${Date.now()}`;

  const filterFrame = page.frame({ name: "filter" });
  if (filterFrame) {
    try {
      await filterFrame.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch {
      // Yardi sometimes detaches the frame mid-navigation. Fall through to
      // the parent-side iframe.src assignment.
      await page.evaluate((url) => {
        const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
        if (f) f.src = url;
      }, formUrl);
    }
  } else {
    await page.evaluate((url) => {
      const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
      if (f) f.src = url;
    }, formUrl);
  }

  // Wait for the Property + ReportNum fields to render
  await page.waitForFunction(
    () => {
      const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
      return (
        !!f?.contentDocument?.getElementById("PropertyID_LookupCode") &&
        !!f.contentDocument.getElementById("ReportNum_DropDownList")
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
