import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's commercial Rent Roll for one property and save the Excel.
 *
 * Yardi serves the rent-roll report at `pages/CMRentRoll.aspx` (commercial
 * rent roll) or `pages/RRollByLease.aspx` depending on the instance. We
 * load `CMRentRoll.aspx` directly into the filter iframe, set the property
 * + as-of date, and click Excel.
 */
export async function runRentRollForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  asOfMonthIso: string
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — Rent Roll as of ${asOfMonthIso}`);

  await openRentRoll(voyagerPage);

  const frame = voyagerPage.frame({ name: "filter" });
  if (!frame) throw new Error("Voyager 'filter' iframe not found.");

  await frame.locator('#PropertyID_LookupCode, input[id*="Property" i][id$="LookupCode"]').first().waitFor({ timeout: 30_000 });

  // Property — same direct JS field-set as the income statement scraper
  await setLookupDirect(frame, "PropertyID", property.code, property.name);

  // As-of date: month-end of the requested month, MM/DD/YYYY
  const [y, m] = asOfMonthIso.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const asOf = `${String(m).padStart(2, "0")}/${String(lastDay).padStart(2, "0")}/${y}`;
  await setIfPresent(frame, '#DateInput, input[id*="AsOfDate" i], input[id*="AsOf" i], input[id*="ReportDate" i]', asOf);

  const outPath = resolve(downloadDirFor(asOfMonthIso), `${slugForProperty(property.code)}-rent-roll.xlsx`);
  const excelBtn = frame.locator('#Excel_Button, input[type="button"][value*="Excel" i], button:has-text("Excel")').first();
  await excelBtn.waitFor({ timeout: 15_000 });

  const [download] = await Promise.all([
    voyagerPage.waitForEvent("download", { timeout: 180_000 }),
    excelBtn.click(),
  ]);
  await download.saveAs(outPath);
  console.log(`   saved → ${outPath}`);
  return outPath;
}

async function openRentRoll(page: Page) {
  // First go home to clear stale iframe state (different report types share the iframe)
  const baseUrl = new URL(page.url());
  const homeUrl = `${baseUrl.origin}${baseUrl.pathname.replace(/menu\.aspx.*$/i, "menu.aspx")}?_=${Date.now()}`;
  await page.goto(homeUrl, { waitUntil: "domcontentloaded" });

  // Probe known Yardi commercial rent-roll / tenancy-schedule URLs directly.
  // Whichever loads a form with a Property field + Excel button wins.
  const basePath = baseUrl.pathname.replace(/menu\.aspx.*$/i, "");
  const candidates = [
    "CMRentRoll.aspx", "RRBLease.aspx", "RRollByLease.aspx", "RentRoll.aspx",
    "CMRRoll.aspx", "CFRentRoll.aspx", "CFunctRentRoll.aspx",
    "TenancySchedule.aspx", "CMTenancySchedule.aspx", "CMTenancySched.aspx",
    "CMTSchedule.aspx", "TenancyScheduleSummary.aspx", "CMTSchedSum.aspx",
    "RTBLease.aspx", "RentRollSummary.aspx",
  ];

  let success = false;
  let loadedFromUrl = "";
  for (const file of candidates) {
    const url = `${baseUrl.origin}${basePath}${file}?sMenuSet=iData&_=${Date.now()}`;
    const filterFrame = page.frame({ name: "filter" });
    try {
      if (filterFrame) {
        await filterFrame.goto(url, { waitUntil: "domcontentloaded", timeout: 8_000 });
      } else {
        await page.evaluate((u) => {
          const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
          if (f) f.src = u;
        }, url);
      }
      // Wait briefly for the form to render. Permissive check — any property field + any Excel-ish button.
      await page.waitForFunction(() => {
        const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
        const doc = f?.contentDocument;
        if (!doc) return false;
        const txt = (doc.body?.innerText || "").toLowerCase();
        if (txt.includes("404") || txt.includes("not found") || txt.includes("error")) return false;
        const hasProperty =
          !!doc.querySelector('input[id*="Property" i][id$="LookupCode"]') ||
          !!doc.querySelector('input[id*="Property" i]');
        const hasExcel =
          !!doc.querySelector('#Excel_Button') ||
          !!doc.querySelector('input[type="button"][value*="Excel" i]') ||
          !!doc.querySelector('input[type="submit"][value*="Excel" i]') ||
          !!doc.querySelector('button:has-text("Excel")') ||
          !!doc.querySelector('a[href*="excel" i]');
        return hasProperty && hasExcel;
      }, { timeout: 4_000 });
      success = true;
      loadedFromUrl = file;
      break;
    } catch {
      // try next
    }
  }

  if (!success) {
    throw new Error(
      `None of ${candidates.length} candidate rent-roll URLs loaded a usable form. ` +
      `The rent-roll URL on this Yardi instance is likely something custom — ` +
      `please navigate to it once in Yardi and share the iframe URL.`
    );
  }
  console.log(`   loaded rent-roll from ${loadedFromUrl}`);
}

async function scanForReportItem(page: Page, patterns: RegExp[]) {
  const topMenus = ["Reports", "Analytics", "Lease Admin"];
  for (const menu of topMenus) {
    const menuLink = page.locator(`a:has-text("${menu}"), td:has-text("${menu}")`).first();
    const visible = await menuLink.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!visible) continue;
    await menuLink.click().catch(() => {});
    await page.waitForTimeout(400);

    // Hover EVERY plausible submenu first to fully expand the menu, then scan
    const subParents = ["Property", "Unit", "Lease / Tenant", "Lease/Tenant", "Lease", "Customer",
      "Recoveries", "Retail", "KPI", "Tenancy Schedule", "Commercial", "Financial",
      "Adhoc", "Workflow"];
    for (const sub of subParents) {
      const subLoc = page.locator(`td:has-text("${sub}"), a:has-text("${sub}")`).first();
      if (await subLoc.isVisible({ timeout: 200 }).catch(() => false)) {
        await subLoc.hover().catch(() => {});
        await page.waitForTimeout(200);
        // Scan inside this submenu
        for (const pat of patterns) {
          const child = page.locator(`a, td`).filter({ hasText: pat }).first();
          if (await child.isVisible({ timeout: 300 }).catch(() => false)) {
            // Verify it's a leaf (not the parent itself) by checking the element text exactly
            const txt = (await child.textContent())?.trim() || "";
            if (pat.test(txt) && !subParents.some(p => p.toLowerCase() === txt.toLowerCase())) {
              const href = await child.evaluate(el => (el as HTMLAnchorElement).href || el.getAttribute("onclick") || "").catch(() => "");
              console.log(`   matched rent-roll under "${menu}" → "${sub}": text="${txt}" href="${href.slice(0, 100)}"`);
              return child;
            }
          }
        }
      }
    }

    // Close menu
    await page.locator("body").click({ position: { x: 5, y: 500 } }).catch(() => {});
    await page.waitForTimeout(200);
  }
  return null;
}

async function dumpAllMenuLeaves(page: Page) {
  // Stub kept for reference. The previous hover-then-scan approach didn't reveal
  // Yardi's second-level submenus reliably. We now use direct-iframe-URL probing
  // (see openRentRoll candidates list) instead of menu navigation.
  console.log(`   (menu-dump skipped — using direct-URL probe path)`);
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

async function setIfPresent(frame: any, selector: string, value: string) {
  const loc = frame.locator(selector).first();
  if (await loc.count() === 0) return;
  await loc.click();
  await loc.press("Control+A");
  await loc.fill(value);
  await loc.press("Tab");
}
