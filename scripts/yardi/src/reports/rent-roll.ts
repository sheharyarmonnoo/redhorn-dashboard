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
  return runDashboardListExport(
    voyagerPage,
    property,
    asOfMonthIso,
    "Current Leases",
    `${slugForProperty(property.code)}-rent-roll.xlsx`,
    "Rent Roll (Current Leases)"
  );
}

export async function runTotalUnitsForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  asOfMonthIso: string
): Promise<string> {
  return runDashboardListExport(
    voyagerPage,
    property,
    asOfMonthIso,
    "Total Units",
    `${slugForProperty(property.code)}-total-units.xlsx`,
    "Total Units"
  );
}

async function runDashboardListExport(
  voyagerPage: Page,
  property: YardiProperty,
  asOfMonthIso: string,
  panelLabel: string,
  filename: string,
  reportLabel: string
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — ${reportLabel} for ${asOfMonthIso}`);

  await navigateDashboardLink(voyagerPage, property.code, panelLabel);

  const outPath = resolve(downloadDirFor(asOfMonthIso), filename);

  // The Voyager dashboard has TWO Excel icons:
  //   - CriticalDateGrid$_ctl4 — always-present Critical Dates tab (we don't want this)
  //   - DashBoardGrid$_ctl4    — the dynamic tab that gets added when clicking
  //                              "Current Leases", "Total Units", etc.
  // Pick the DashBoardGrid one — it's what holds our just-opened panel data.
  const frames = voyagerPage.frames();
  let exportInfo: { frame: any; postback: string } | null = null;
  for (const f of frames) {
    const found = await f.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
      // First pass: prefer DashBoardGrid (dynamic tab)
      for (const img of imgs) {
        const handler = img.getAttribute("doonclick") || img.getAttribute("onclick") || "";
        if (handler.includes("DashBoardGrid") && /excel/i.test(handler)) {
          return { handler };
        }
      }
      // Fallback: any Excel icon (excluding CriticalDate)
      for (const img of imgs) {
        const src = (img.src || "").toLowerCase();
        const handler = img.getAttribute("doonclick") || img.getAttribute("onclick") || "";
        if ((src.includes("excel") || /excel/i.test(handler)) && !handler.includes("CriticalDate")) {
          return { handler };
        }
      }
      return null;
    }).catch(() => null);
    if (found && found.handler) {
      exportInfo = { frame: f, postback: found.handler };
      console.log(`   Excel export found in ${f.url().split("?")[0].split("/").pop()}: ${found.handler.slice(0, 100)}`);
      break;
    }
  }
  if (!exportInfo) throw new Error(`No Excel export image found on ${panelLabel} page.`);

  // Run the doPostBack handler in the frame's context (it's plain JS code as a string)
  const [download] = await Promise.all([
    voyagerPage.waitForEvent("download", { timeout: 180_000 }),
    exportInfo.frame.evaluate((handler: string) => {
      // eslint-disable-next-line no-eval
      (0, eval)(handler);
    }, exportInfo.postback),
  ]);
  await download.saveAs(outPath);
  console.log(`   saved → ${outPath}`);
  return outPath;
}

/**
 * Set the Property filter on the Property Manager Dashboard, click Go, then
 * click the dashboard panel link by its label (e.g. "Current Leases" or
 * "Total Units"). The link's count value is rendered as an <a> next to the
 * label; clicking it opens the underlying detail listing in the iframe.
 */
export async function navigateDashboardLink(page: Page, propertyCode: string, panelLabel: string) {
  const baseUrl = new URL(page.url());
  const homeUrl = `${baseUrl.origin}${baseUrl.pathname.replace(/menu\.aspx.*$/i, "menu.aspx")}?_=${Date.now()}`;
  await page.goto(homeUrl, { waitUntil: "domcontentloaded" });

  // Wait for the dashboard iframe to be fully rendered (Lease Administration panel visible)
  await page.waitForFunction(() => {
    const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
    const txt = f?.contentDocument?.body?.innerText || "";
    return /Lease Administration/i.test(txt) || /Space \/ Facilities/i.test(txt);
  }, { timeout: 30_000 });

  const filterFrame = page.frame({ name: "filter" });
  if (!filterFrame) throw new Error("Voyager dashboard iframe not found.");

  // Set the Property field by its exact id (`PropertyLookup_LookupCode`) and
  // click the Go button (`YSIGo_Button`). Verified via DOM inspection.
  const propField = filterFrame.locator("#PropertyLookup_LookupCode");
  await propField.waitFor({ timeout: 10_000 });
  await propField.click();
  await propField.press("Control+A");
  await propField.fill(propertyCode);
  await propField.press("Tab");
  await page.waitForTimeout(400);

  // Click Go and wait for the dashboard grid to refresh with the new property's data
  const goBtn = filterFrame.locator("#YSIGo_Button");
  await goBtn.click();
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_500);

  // Verify the property filter applied — re-acquire the iframe (it may have re-rendered)
  // and check that PropertyLookup_LookupCode now reads our requested code.
  const refreshed = page.frame({ name: "filter" });
  if (refreshed) {
    const settled = await refreshed.locator("#PropertyLookup_LookupCode").inputValue().catch(() => "");
    console.log(`   property filter set to "${settled}" (requested "${propertyCode}")`);
  }

  // Find and click the link matching `panelLabel`. We search for an <a> whose
  // row text starts with the label, then locate it by its href/text in
  // Playwright so we can fire a real click (full event chain — important
  // because Yardi binds doonclick handlers that JS-level .click() doesn't fire).
  const linkInfo = await filterFrame.evaluate((label) => {
    const labelLower = label.toLowerCase();
    const anchors = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
    for (const a of anchors) {
      const row = a.closest("tr");
      if (!row) continue;
      const rowText = (row.textContent || "").trim().toLowerCase();
      if (rowText.startsWith(labelLower) || rowText.includes(labelLower + " ")) {
        // Tag with a stable attribute we can target from Playwright
        a.setAttribute("data-rh-panel", label);
        return { found: true, href: a.getAttribute("href") || "", text: (a.textContent || "").trim() };
      }
    }
    return { found: false };
  }, panelLabel);

  if (!linkInfo.found) {
    throw new Error(`Could not find "${panelLabel}" link on the dashboard.`);
  }
  console.log(`   located "${panelLabel}" link (text="${(linkInfo as any).text}", href="${(linkInfo as any).href.slice(0, 80)}")`);

  const linkLoc = filterFrame.locator(`a[data-rh-panel="${panelLabel}"]`).first();
  // Race a real Playwright click against potential popup or frame navigation
  const navPromise = page.waitForEvent("popup", { timeout: 5_000 }).catch(() => null);
  await linkLoc.click({ force: true });
  await navPromise; // if a popup opened it'll be tracked in context.pages

  // The Lease Administration / Space / Facilities links don't navigate — they update
  // a single shared grid widget at the bottom of the Property Manager Dashboard.
  // We need to wait for that grid's CONTENT to match what we're expecting for this
  // panel — otherwise we'll export whatever was previously shown (e.g. the default
  // Critical Dates widget).
  const expectedHeaders = panelLabelToExpectedHeaders(panelLabel);
  await page.waitForFunction(({ headers, label }) => {
    const all: Document[] = [document];
    for (const f of Array.from(document.querySelectorAll("iframe"))) {
      try { if ((f as HTMLIFrameElement).contentDocument) all.push((f as HTMLIFrameElement).contentDocument!); } catch {}
    }
    for (const d of all) {
      // Look for a table whose header row contains the expected headers
      const tables = Array.from(d.querySelectorAll("table"));
      for (const t of tables) {
        const headerRow = t.querySelector("tr");
        if (!headerRow) continue;
        const txt = (headerRow.textContent || "").toLowerCase();
        const all_headers_present = headers.every((h: string) => txt.includes(h.toLowerCase()));
        if (all_headers_present) return true;
      }
    }
    return false;
  }, { headers: expectedHeaders, label: panelLabel }, { timeout: 30_000 });
  console.log(`   ${panelLabel} grid populated with expected headers`);

  // Give the grid an extra beat to fully render its data rows
  await page.waitForTimeout(800);
}

function panelLabelToExpectedHeaders(label: string): string[] {
  // Headers we expect to see in Yardi's dynamic dashboard grid for each panel.
  // Verified from the Current Leases listing — columns are:
  //   Property Id | Customer Id | Unit Id | Lease Name(Id) | Lease Type | Expiration Date | Area
  switch (label) {
    case "Current Leases":
      return ["property id", "lease name"]; // distinguishes from Critical Dates grid
    case "Total Units":
      return ["unit id"]; // Total Units lists unit IDs
    case "Lease Expirations within Date Range":
      return ["expiration"];
    default:
      return [];
  }
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
