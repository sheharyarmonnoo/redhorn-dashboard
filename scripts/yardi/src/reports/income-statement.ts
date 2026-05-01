import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, incomeStatementFilename } from "../paths.js";

// Redhorn's custom income statement template in Yardi.
// Other options seen in their instance: ILPA_BS (balance sheet), ILPA_CF (cash flow), ILPA_IS (ILPA income statement).
const DEFAULT_TEMPLATE_CODE = "IS_CFTem";

/**
 * Drive the Custom Financial Reports page for one property:
 *   - Navigate to Analytics > Financial > Custom Financials
 *   - Type the property code into PropertyID_LookupCode
 *   - Type the template code into TemplateID_LookupCode
 *   - Set Period MM/YYYY (From + To = the target month)
 *   - Click Excel_Button → save the download
 *
 * All fields live inside an iframe named "filter" on the Voyager page.
 */
export async function runIncomeStatementForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  monthIso: string,                       // "2026-03"
  templateCode: string = DEFAULT_TEMPLATE_CODE
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — Income Statement for ${monthIso}`);

  await openCustomFinancials(voyagerPage);

  const frame = voyagerPage.frame({ name: "filter" });
  if (!frame) throw new Error("Voyager 'filter' iframe not found — did the page load?");

  // Wait for the Custom Financials form to settle
  await frame.locator("#PropertyID_LookupCode").waitFor({ timeout: 30_000 });

  // Strategy: write LookupCode + Description directly via JS. Bypasses picker
  // entirely — the report-generating form reads these fields at submit time.
  await setLookupDirect(frame, "PropertyID", property.code, property.name);
  await setLookupDirect(frame, "TemplateID", templateCode, templateCode);

  // Period MM/YYYY — From and To both set to the target month
  const [y, m] = monthIso.split("-").map(Number);
  const mmyy = `${String(m).padStart(2, "0")}/${y}`;
  await setInput(frame, "#FromMMYY_TextBox", mmyy);
  await setInput(frame, "#ToMMYY_TextBox", mmyy);

  // Trigger Excel download
  const outPath = resolve(downloadDirFor(monthIso), incomeStatementFilename(property.code));
  const excelBtn = frame.locator("#Excel_Button");
  const [download] = await Promise.all([
    voyagerPage.waitForEvent("download", { timeout: 180_000 }),
    excelBtn.click(),
  ]);
  await download.saveAs(outPath);

  console.log(`   saved → ${outPath}`);
  return outPath;
}

async function openCustomFinancials(page: Page) {
  // Force a fresh load by directly navigating the filter iframe via Playwright's
  // frame.goto(). Use a cache-busting query param to ensure server returns a
  // fresh form (Yardi sometimes caches per-session form state otherwise).
  const baseUrl = new URL(page.url());
  const customFinancialsUrl =
    `${baseUrl.origin}${baseUrl.pathname.replace(/menu\.aspx.*$/i, "GlRepCustom.aspx")}?sMenuSet=iData&_=${Date.now()}`;

  const filterFrame = page.frame({ name: "filter" });
  if (filterFrame) {
    await filterFrame.goto(customFinancialsUrl, { waitUntil: "domcontentloaded" });
  } else {
    // First time — fall back to setting iframe.src
    await page.evaluate((url) => {
      const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
      if (f) f.src = url;
    }, customFinancialsUrl);
  }

  // Wait for the form fields to render
  await page.waitForFunction(() => {
    const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
    return !!f?.contentDocument?.getElementById("PropertyID_LookupCode");
  }, { timeout: 60_000 });
}

/**
 * Write LookupCode + Description fields directly via JS, bypassing the picker.
 * Yardi reads these fields at form-submit time, so as long as they have valid
 * values the report generates correctly — no need for the multi-select dance.
 */
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

  const settledCode = await frame.locator(`#${codeId}`).inputValue().catch(() => "");
  const settledDesc = await frame.locator(`#${descId}`).inputValue().catch(() => "");
  console.log(`   ${prefix} set directly: code="${settledCode}" desc="${settledDesc}"`);
}

/**
 * Set a Yardi lookup field by typing the code into LookupCode and tabbing out.
 * Falls back to the modal picker if direct fill doesn't auto-resolve.
 * Kept around as a fallback option but not used by the main flow.
 */
async function setLookupValue(page: Page, frame: any, prefix: string, code: string) {
  const codeField = frame.locator(`#${prefix}_LookupCode`);
  await codeField.waitFor({ timeout: 10_000 });

  // Direct fill + tab — fires Yardi's onblur validation
  await codeField.click();
  await codeField.press("Control+A");
  await codeField.fill(code);
  await codeField.press("Tab");
  await page.waitForTimeout(800);

  // Check if Yardi resolved the code (description should be populated)
  const description = await frame.locator(`#${prefix}_Description`).inputValue().catch(() => "");
  const resolvedCode = await codeField.inputValue();
  console.log(`   ${prefix} after fill: code="${resolvedCode}" description="${description}"`);

  if (description && description.trim().length > 0) {
    return; // auto-resolved successfully
  }

  // Fallback: open the picker modal
  console.log(`   ${prefix} did not auto-resolve — falling back to picker`);
  await selectViaPicker(page, frame, `#${prefix}_LookupLink`, code);
}

/**
 * Open a Yardi lookup modal, check the row whose Code column matches `code`,
 * click OK. Works for both Property and Report Template pickers. The modal
 * renders inside a nested iframe (#popupiframe with Lookup2.aspx src).
 */
async function selectViaPicker(page: Page, _frameUnused: any, linkSelector: string, code: string) {
  const filterFrame = page.frame({ name: "filter" });
  if (!filterFrame) throw new Error("filter frame missing");

  // Yardi's lookup link is an <a> with an onclick handler. Playwright's normal click
  // sometimes doesn't fire it depending on how the element is laid out. Click via the
  // element's own click() method to force the JS handler, with normal click as fallback.
  const linkElementId = linkSelector.replace(/^#/, "");

  // Diagnostic: dump the element to see what kind of handler it has
  const elemInfo = await filterFrame.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { found: false };
    return {
      found: true,
      tag: el.tagName,
      onclick: el.getAttribute("onclick")?.slice(0, 200) || null,
      href: (el as HTMLAnchorElement).href || null,
      visible: !!el.offsetParent,
      rect: el.getBoundingClientRect(),
    };
  }, linkElementId);
  console.log(`   ${linkElementId} elem:`, JSON.stringify(elemInfo));

  await filterFrame.evaluate((id) => {
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) el.click();
  }, linkElementId);

  // Dump all frame URLs after click
  await page.waitForTimeout(2_000);
  const framesAfter = page.frames().map(f => f.url().slice(0, 150));
  console.log(`   frames after click:`, JSON.stringify(framesAfter));

  // The picker is a nested iframe (`<iframe id="popupiframe" src="...Lookup.aspx?...">`).
  // Wait for it to appear and become a usable frame.
  let popupFrame = await waitForLookupFrame(page, 5_000);
  if (!popupFrame) {
    // Fallback: regular Playwright click
    await filterFrame.locator(linkSelector).click({ force: true });
    popupFrame = await waitForLookupFrame(page, 10_000);
  }
  if (!popupFrame) throw new Error("Lookup popup iframe never appeared.");

  const rowSelector = `tr:has(input[type="checkbox"]):has(td:has-text("${code}"))`;
  const row = popupFrame.locator(rowSelector).first();
  await row.waitFor({ timeout: 15_000 });

  // Diagnostic: dump picker DOM to find the right interaction model
  const debug = await popupFrame.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    return {
      total: boxes.length,
      sample: boxes.slice(0, 6).map(b => {
        const el = b as HTMLInputElement;
        return {
          id: el.id,
          name: el.name,
          value: el.value,
          checked: el.checked,
          onclick: el.getAttribute("onclick")?.slice(0, 120) || null,
          parentTag: el.parentElement?.tagName,
          parentOnclick: el.parentElement?.getAttribute("onclick")?.slice(0, 120) || null,
          rowText: el.closest("tr")?.textContent?.trim()?.slice(0, 80),
        };
      }),
    };
  });
  console.log(`   picker DOM:`, JSON.stringify(debug, null, 2));

  // Uncheck every row by clicking each checked checkbox via Playwright (fires real handlers)
  const allCheckboxes = popupFrame.locator('input[type="checkbox"]');
  const cbCount = await allCheckboxes.count();
  for (let i = 0; i < cbCount; i++) {
    const cb = allCheckboxes.nth(i);
    if (await cb.isChecked().catch(() => false)) {
      await cb.click({ force: true });
    }
  }

  // Click the target row's checkbox
  const checkbox = row.locator('input[type="checkbox"]').first();
  await checkbox.click({ force: true });
  const isChecked = await checkbox.isChecked().catch(() => false);
  console.log(`   picker: target row "${code}" checked=${isChecked}`);

  const okBtn = popupFrame.locator(
    'input[type="button"][value="OK"], input[type="submit"][value="OK"], button:has-text("OK")'
  ).first();
  await okBtn.click();

  // Wait for the popup iframe to detach (modal closes)
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll("iframe")).some(f => /Lookup2?\.aspx/i.test((f as HTMLIFrameElement).src || "")),
    undefined,
    { timeout: 10_000 }
  ).catch(() => {});
}

async function waitForLookupFrame(page: Page, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const f = page.frames().find(f => /Lookup2?\.aspx/i.test(f.url()));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  return null;
}

async function setInput(frame: any, selector: string, value: string) {
  const input = frame.locator(selector);
  await input.waitFor({ timeout: 10_000 });
  await input.click();
  await input.press("Control+A");
  await input.fill(value);
  await input.press("Tab");
}
