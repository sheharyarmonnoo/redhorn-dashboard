/**
 * One-shot probe: figure out the URL pattern for Yardi Voyager's
 * Commercial Analytics > Property > Rent Roll page.
 *
 * Usage:
 *   npx tsx src/probe-comm-analytics.ts
 *
 * Strategy:
 *   1. Open authenticated session, get into Voyager.
 *   2. Click through Analytics → Commercial Analytics → Property → Rent Roll
 *      via the visible menu chain (or probe a list of likely URLs).
 *   3. Capture the iframe URL of the rendered form (this is the missing piece).
 *   4. Set Property=hol, Report Type=Rent Roll, From Date=05/01/2026.
 *   5. Click Excel; save the download.
 *   6. Log every form field name/id + every button event handler so the
 *      production scraper can pin selectors.
 */
import { openAuthenticatedSession } from "./auth.js";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const PROPERTY_CODE = "hol";
const PROPERTY_NAME = "Hollister BP1 LLC";
const FROM_DATE = "05/01/2026";

// Candidate URLs ordered most-to-least likely. The Commercial Analytics
// Rent Roll is a *different* page than the legacy CmrRentl.aspx. Common
// names across Yardi versions:
const CANDIDATE_URLS = [
  "CmRR.aspx",            // commercial rent roll analytics
  "CmRentRoll.aspx",
  "CmRentRollAnal.aspx",
  "CmAnaly.aspx",
  "CmAnalytic.aspx",
  "CmAnalyRR.aspx",
  "CmrRRoll.aspx",
  "CmAnaProp.aspx",
  "CmAnalyProp.aspx",
  "PropertyAnalytics.aspx",
  "RentRollAnal.aspx",
  "AnaProperty.aspx",
  "rrPropAnalytics.aspx",
  // The visible URL pattern in screenshot (sMenuSet="iAnalytics") tells us
  // the category but the file name is what we need — try anything containing
  // "Analy" in the menu set.
];

async function main() {
  const outDir = resolve(process.cwd(), "downloads", "2026-05");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "commercial-analytics-probe.xlsx");

  const headed = process.argv.includes("--headed");
  console.log(`probe-comm-analytics: starting (${headed ? "headed" : "headless"})`);

  const session = await openAuthenticatedSession({ headed });
  const { voyager, close } = session;

  try {
    console.log(`voyager URL: ${voyager.url()}`);

    // Step 1 — navigate via the visible menu. The Voyager top menu is rendered
    // as anchors inside an iframe named "navigation" in classic Voyager skins.
    // We try clicking Analytics → Commercial Analytics → Property → Rent Roll
    // in case probe-by-URL fails.
    let foundFrame: any = null;
    let foundUrl: string | null = null;

    // Try every candidate URL by setting filter iframe src directly
    for (const candidate of CANDIDATE_URLS) {
      const baseUrl = new URL(voyager.url());
      const baseDir = baseUrl.pathname.replace(/[^/]*$/, "");
      const url = `${baseUrl.origin}${baseDir}${candidate}?sMenuSet=iAnalytics&_=${Date.now()}`;

      const frame = voyager.frame({ name: "filter" });
      try {
        if (frame) {
          await frame.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        } else {
          await voyager.evaluate((u) => {
            const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
            if (f) f.src = u;
          }, url);
        }
        await voyager.waitForTimeout(1500);

        const matched = voyager.frame({ name: "filter" });
        if (!matched) continue;

        const fUrl = matched.url();
        const hasPropField = await matched.locator('#PropertyID_LookupCode, [name="PropertyID"], #PropertyID').count();
        const hasReportType = await matched.locator('#sReportType, [name="ReportType"], select:has(option:has-text("Rent Roll"))').count();
        const hasFromDate = await matched.locator('#FromDate, #FromDate_TextBox, [name="FromDate"]').count();
        const hasExcel = await matched.locator('#Excel_Button, input[value*="Excel" i]').count();

        console.log(`  candidate=${candidate}: url=${fUrl.slice(0, 100)} prop=${hasPropField} rpt=${hasReportType} from=${hasFromDate} excel=${hasExcel}`);

        if (hasPropField > 0 && (hasReportType > 0 || hasFromDate > 0)) {
          foundFrame = matched;
          foundUrl = fUrl;
          console.log(`  ✓ MATCH at ${candidate} → ${fUrl}`);
          break;
        }
      } catch (err: any) {
        console.log(`  candidate=${candidate}: ${err?.message || err}`);
      }
    }

    if (!foundFrame) {
      console.log("\n--- No URL probe matched. Trying menu navigation ---");
      foundFrame = await navigateViaMenus(voyager);
      if (foundFrame) foundUrl = foundFrame.url();
    }

    if (!foundFrame) {
      // Final fallback: dump every iframe URL on the page so user can see
      // what's there, plus a list of every menu link.
      console.log("\n--- Falling back to discovery dump ---");
      const frameUrls = voyager.frames().map(f => ({ name: f.name(), url: f.url() }));
      console.log("All frame URLs:", JSON.stringify(frameUrls, null, 2));

      const navLinks = await voyager.evaluate(() => {
        const all: any[] = [];
        function walk(doc: Document) {
          doc.querySelectorAll("a").forEach(a => {
            const href = (a as HTMLAnchorElement).href;
            const text = (a.textContent || "").trim();
            if (text && /rent\s*roll|analytics/i.test(text)) {
              all.push({ text: text.slice(0, 80), href: href.slice(0, 200) });
            }
          });
          // Recurse into iframes
          doc.querySelectorAll("iframe").forEach(f => {
            try {
              const cd = (f as HTMLIFrameElement).contentDocument;
              if (cd) walk(cd);
            } catch { /* cross-origin */ }
          });
        }
        walk(document);
        return all;
      });
      console.log("Anchor links matching rent-roll/analytics:", JSON.stringify(navLinks, null, 2));
      throw new Error("Could not find Commercial Analytics Rent Roll URL");
    }

    console.log(`\n=== FOUND FORM at: ${foundUrl} ===`);

    // Dump every form field name + id
    const formDump = await foundFrame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input,select,textarea")).map((el: Element) => {
        const e = el as HTMLInputElement | HTMLSelectElement;
        return {
          tag: e.tagName,
          id: e.id,
          name: (e as any).name,
          type: (e as HTMLInputElement).type || "",
          value: (e as HTMLInputElement).value || "",
        };
      });
      const buttons = Array.from(document.querySelectorAll("input[type='button'],input[type='submit'],button,input[type='image']")).map((el: Element) => {
        const e = el as HTMLInputElement;
        return {
          id: e.id,
          name: (e as any).name,
          value: (e as any).value || "",
          alt: e.getAttribute("alt") || "",
          onclick: (e.getAttribute("onclick") || "").slice(0, 200),
        };
      });
      return { inputs, buttons };
    });
    console.log("\nForm inputs:", JSON.stringify(formDump.inputs, null, 2));
    console.log("\nForm buttons:", JSON.stringify(formDump.buttons, null, 2));

    // Step 2 — set Property
    await foundFrame.evaluate(({ code, name }: any) => {
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
    }, { code: PROPERTY_CODE, name: PROPERTY_NAME });

    // Step 3 — set From Date (any of these field IDs)
    const dateCandidates = ["#FromDate", "#FromDate_TextBox", "#AsOfDate", "#AsOfDate_TextBox", "#RptDate"];
    for (const sel of dateCandidates) {
      const loc = foundFrame.locator(sel).first();
      if ((await loc.count()) > 0) {
        await loc.click().catch(() => {});
        await loc.press("Control+A").catch(() => {});
        await loc.fill(FROM_DATE).catch(() => {});
        await loc.press("Tab").catch(() => {});
        console.log(`  set date via ${sel}`);
        break;
      }
    }

    // Step 4 — make sure Report Type is Rent Roll if there's a select for it
    const rptTypeSelect = foundFrame.locator('select[name*="ReportType" i], select#sReportType, select#ReportType').first();
    if ((await rptTypeSelect.count()) > 0) {
      try {
        await rptTypeSelect.selectOption({ label: "Rent Roll" });
        console.log("  set ReportType=Rent Roll");
      } catch (err: any) {
        console.log(`  could not select Rent Roll: ${err?.message}`);
      }
    }

    // Step 5 — click Excel (try every plausible selector)
    const excelSelectors = [
      "#Excel_Button",
      'input[value*="Excel" i]',
      'button:has-text("Excel")',
      'input[type="image"][alt*="Excel" i]',
    ];
    let excelLoc: any = null;
    for (const sel of excelSelectors) {
      const l = foundFrame.locator(sel).first();
      if ((await l.count()) > 0) {
        excelLoc = l;
        console.log(`  excel button via: ${sel}`);
        break;
      }
    }
    if (!excelLoc) throw new Error("No Excel button found on form");

    try {
      const [download] = await Promise.all([
        voyager.waitForEvent("download", { timeout: 60_000 }),
        excelLoc.click(),
      ]);
      await download.saveAs(outPath);
      console.log(`\n✓ DOWNLOADED: ${outPath}`);
    } catch (err: any) {
      // Excel might trigger via popup or via a separate window. Dump any new pages.
      console.log(`  download wait failed: ${err?.message}`);
      const pages = session.context.pages().map(p => p.url());
      console.log(`  context pages: ${JSON.stringify(pages)}`);
      throw err;
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`URL: ${foundUrl}`);
    console.log(`Output: ${outPath}`);
  } finally {
    await close();
  }
}

async function navigateViaMenus(voyager: any): Promise<any | null> {
  // Voyager's top menu is in iframe "menu_top" with .aspx links. Click
  // Analytics > Commercial Analytics > Property > Rent Roll.
  console.log("Trying menu navigation...");
  const allFrames = voyager.frames();
  console.log("Available frames:", allFrames.map((f: any) => `${f.name()}:${f.url().slice(0, 80)}`).join(", "));

  for (const f of allFrames) {
    try {
      // Look for "Rent Roll" anchor under Analytics menu
      const rrLink = f.locator('a:has-text("Rent Roll")').first();
      if ((await rrLink.count()) > 0) {
        const href = await rrLink.getAttribute("href").catch(() => null);
        const onclick = await rrLink.getAttribute("onclick").catch(() => null);
        console.log(`Found Rent Roll link in ${f.name()}: href=${href} onclick=${onclick?.slice(0, 200)}`);
      }
    } catch { /* skip */ }
  }
  return null;
}

main().catch(err => {
  console.error("\nFATAL:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
