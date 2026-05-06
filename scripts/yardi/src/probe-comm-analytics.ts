/**
 * Probe: discover Voyager Commercial Analytics > Property > Rent Roll URL.
 *
 * The user's screenshot shows a form with these fields:
 *   - Property (lookup), Active checkbox, CFDA, DM Markets, DM Property Type
 *   - Right pane: Report Type (Rent Roll), From Date (05/01/2026), Period (Monthly),
 *     Summarize By (Property), Show Detail / Show Future / Show Pending checkboxes
 *   - Buttons: Display, PDF, Excel, Clear
 *
 * Strategy:
 *   1. Open Voyager.
 *   2. Walk the menu tree. Voyager Classic has a tree menu in iframe `menu_tree`
 *      or expands via JS in the top frame. We dump every <a> on every visible
 *      frame and grep for "Rent Roll" / "Analytics".
 *   3. Once we've discovered the URL the menu uses to load the form, we probe
 *      that directly.
 */
import { openAuthenticatedSession } from "./auth.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const PROPERTY_CODE = "hol";
const PROPERTY_NAME = "Hollister BP1 LLC";
const FROM_DATE = "05/01/2026";

async function main() {
  const outDir = resolve(process.cwd(), "downloads", "2026-05");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "commercial-analytics-probe.xlsx");

  const headed = process.argv.includes("--headed");
  console.log(`probe-comm-analytics: starting (${headed ? "headed" : "headless"})`);

  const session = await openAuthenticatedSession({ headed });
  const { voyager, close, context } = session;

  try {
    console.log(`voyager URL: ${voyager.url()}`);
    await voyager.waitForTimeout(2000);

    // Step 1 — full DOM dump of every frame to find the menu tree
    console.log("\n=== FRAME INVENTORY ===");
    const frameInfo: any[] = [];
    for (const f of voyager.frames()) {
      frameInfo.push({ name: f.name(), url: f.url().slice(0, 120) });
    }
    console.log(JSON.stringify(frameInfo, null, 2));

    // Step 2 — try every frame's anchors for "Rent Roll"
    console.log("\n=== SEARCHING FOR RENT ROLL LINKS ===");
    const allRentRollLinks: any[] = [];
    for (const f of voyager.frames()) {
      try {
        const links = await f.evaluate(() => {
          const result: any[] = [];
          document.querySelectorAll("a").forEach(a => {
            const text = (a.textContent || "").trim();
            const href = (a as HTMLAnchorElement).getAttribute("href") || "";
            const onclick = a.getAttribute("onclick") || "";
            if (text && /rent\s*roll|analytics|commercial/i.test(text) && text.length < 80) {
              result.push({ text, href: href.slice(0, 200), onclick: onclick.slice(0, 200) });
            }
          });
          return result;
        });
        if (links.length > 0) {
          console.log(`Frame ${f.name() || "(root)"}:`);
          console.log(JSON.stringify(links, null, 2));
          for (const l of links) allRentRollLinks.push({ frame: f.name(), ...l });
        }
      } catch { /* skip cross-origin */ }
    }

    // Step 3 — Voyager's left-side menu loads via JS. Look at the menu structure
    // in the main frame. The menu source is typically in a <script> tag with
    // serialized tree data, or loaded via XHR.
    console.log("\n=== MENU.ASPX PAGE STRUCTURE ===");
    const menuStructure = await voyager.evaluate(() => {
      const out: any = { hasMenuFrame: false, hasFilterFrame: false, frames: [] };
      document.querySelectorAll("iframe,frame").forEach(f => {
        const fr = f as HTMLIFrameElement;
        out.frames.push({ name: fr.name, src: fr.src.slice(0, 150) });
        if (fr.name === "filter") out.hasFilterFrame = true;
        if (fr.name === "menu" || fr.name === "menu_tree" || fr.name === "navigation") out.hasMenuFrame = true;
      });
      // Look for menu data in scripts
      const scripts = Array.from(document.querySelectorAll("script"));
      const menuScript = scripts.find(s => /Analytics|RentRoll|PropertyMenu|menuItems/i.test(s.textContent || ""));
      if (menuScript) {
        out.menuScriptSnippet = (menuScript.textContent || "").slice(0, 2000);
      }
      // Top-level menu items
      const menuLinks: any[] = [];
      document.querySelectorAll("a, span[onclick], div[onclick], li[onclick]").forEach(el => {
        const text = (el.textContent || "").trim();
        if (text && text.length < 60 && /analytics|reports|commercial/i.test(text)) {
          menuLinks.push({
            tag: el.tagName,
            text: text.slice(0, 60),
            onclick: (el.getAttribute("onclick") || "").slice(0, 200),
            href: (el as HTMLAnchorElement).href || "",
          });
        }
      });
      out.menuLinks = menuLinks;
      return out;
    });
    console.log(JSON.stringify(menuStructure, null, 2));

    // Step 4 — Voyager menu is built dynamically. Try clicking through the
    // menu tree by hovering "Analytics" then "Commercial Analytics" then
    // "Property" then "Rent Roll".
    console.log("\n=== ATTEMPTING MENU NAVIGATION ===");
    const navResult = await tryMenuClick(voyager);
    console.log(`Menu nav result: ${navResult}`);

    // Step 5 — capture network — every URL fetched while we click around
    const networkUrls: string[] = [];
    voyager.on("request", req => {
      const u = req.url();
      if (u.includes(".aspx") && !u.includes("favicon")) {
        networkUrls.push(u);
      }
    });

    // Navigate through menu hover/click
    await clickAnalyticsMenu(voyager);

    await voyager.waitForTimeout(3000);

    console.log("\n=== NETWORK URLs CAPTURED ===");
    const filteredNetwork = networkUrls.filter(u =>
      /Analytic|RentRoll|RR|Comm/i.test(u)
    );
    console.log(JSON.stringify(filteredNetwork.slice(0, 30), null, 2));

    // Now check what's in the filter iframe
    const filterFrame = voyager.frame({ name: "filter" });
    if (filterFrame) {
      const filterUrl = filterFrame.url();
      console.log(`\nFilter frame URL after navigation: ${filterUrl}`);

      // Dump form fields
      const formFields = await filterFrame.evaluate(() => {
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
        return { inputs, buttons, htmlSnippet: document.body.innerHTML.slice(0, 5000) };
      }).catch((e: any) => ({ error: e.message }));

      console.log("\nFilter form fields:");
      console.log(JSON.stringify(formFields, null, 2));

      // Save HTML for debugging
      try {
        const html = await filterFrame.content();
        const htmlPath = resolve(outDir, "filter-frame.html");
        writeFileSync(htmlPath, html);
        console.log(`\nFilter frame HTML saved to ${htmlPath}`);
      } catch { /* skip */ }

      // If we have a PropertyID field, try to set it and click Excel
      const hasProperty = await filterFrame.locator("#PropertyID_LookupCode, #PropertyID, [name='PropertyID']").count();
      if (hasProperty > 0) {
        console.log("\n=== FORM HAS PROPERTY FIELD — PROCEEDING WITH SUBMIT ===");

        await filterFrame.evaluate(({ code, name }: any) => {
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

        // Set From Date
        for (const sel of ["#FromDate", "#FromDate_TextBox", "#AsOfDate", "#AsOfDate_TextBox"]) {
          const loc = filterFrame.locator(sel).first();
          if ((await loc.count()) > 0) {
            await loc.click().catch(() => {});
            await loc.press("Control+A").catch(() => {});
            await loc.fill(FROM_DATE).catch(() => {});
            await loc.press("Tab").catch(() => {});
            console.log(`  set date via ${sel}`);
            break;
          }
        }

        // Set Report Type to Rent Roll if there's a select
        const rptSelects = await filterFrame.locator('select').all();
        for (const sel of rptSelects) {
          try {
            const options = await sel.evaluate((el: HTMLSelectElement) =>
              Array.from(el.options).map(o => o.text)
            );
            if (options.some(o => /rent.*roll/i.test(o))) {
              await sel.selectOption({ label: "Rent Roll" }).catch(async () => {
                const targetIdx = options.findIndex(o => /rent.*roll/i.test(o));
                if (targetIdx >= 0) await sel.selectOption({ index: targetIdx });
              });
              console.log(`  set ReportType=Rent Roll`);
              break;
            }
          } catch { /* skip */ }
        }

        // Click Excel
        for (const sel of ["#Excel_Button", 'input[value*="Excel" i]', 'button:has-text("Excel")']) {
          const loc = filterFrame.locator(sel).first();
          if ((await loc.count()) > 0) {
            console.log(`  clicking Excel via: ${sel}`);
            try {
              const [download] = await Promise.all([
                voyager.waitForEvent("download", { timeout: 60_000 }),
                loc.click(),
              ]);
              await download.saveAs(outPath);
              console.log(`\n✓ DOWNLOADED: ${outPath}`);
            } catch (err: any) {
              console.log(`  download error: ${err?.message}`);
            }
            break;
          }
        }
      } else {
        console.log("\nFilter frame does not have PropertyID — menu nav didn't reach the form.");
      }
    }

    console.log("\n=== ALL NETWORK CAPTURED ===");
    console.log(JSON.stringify(networkUrls.slice(-50), null, 2));
  } finally {
    await close();
  }
}

async function tryMenuClick(voyager: any): Promise<string> {
  // Voyager's menu is rendered in `menu.aspx` itself — the top frame of the
  // page is `menu.aspx` and `filter` is a child iframe. The menu navigates
  // by setting filter.src. Look for top-level menu items.
  return await voyager.evaluate(() => {
    // Find anchors in the top page
    const all = Array.from(document.querySelectorAll("a, span")).filter(el => {
      const t = (el.textContent || "").trim();
      return t.length > 0 && t.length < 50;
    });
    return `found ${all.length} candidate menu items`;
  });
}

async function clickAnalyticsMenu(voyager: any) {
  // Voyager classic uses sMenuSet=iAnalytics. The menu page itself is
  // menu.aspx?sMenuSet=iAnalytics. Navigate there to refresh the menu.
  console.log("Navigating to Analytics menu...");
  const baseUrl = new URL(voyager.url());
  const menuUrl = `${baseUrl.origin}${baseUrl.pathname}?sMenuSet=iAnalytics`;
  await voyager.goto(menuUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  await voyager.waitForTimeout(2500);

  // Dump the menu structure
  const menuDump = await voyager.evaluate(() => {
    const out: any = { url: location.href, links: [] };
    document.querySelectorAll("a").forEach(a => {
      const text = (a.textContent || "").trim();
      const href = a.getAttribute("href") || "";
      const onclick = a.getAttribute("onclick") || "";
      if (text && text.length < 60) {
        out.links.push({ text, href: href.slice(0, 250), onclick: onclick.slice(0, 250) });
      }
    });
    return out;
  });
  console.log("Menu page after Analytics navigation:");
  console.log(JSON.stringify(menuDump, null, 2));

  // Try clicking a "Rent Roll" link
  try {
    const rrLink = voyager.locator('a:has-text("Rent Roll")').first();
    if ((await rrLink.count()) > 0) {
      const href = await rrLink.getAttribute("href");
      const onclick = await rrLink.getAttribute("onclick");
      console.log(`Found Rent Roll link: href=${href} onclick=${onclick}`);
      await rrLink.click().catch(() => {});
      await voyager.waitForTimeout(3000);
    }
  } catch (err: any) {
    console.log(`No Rent Roll link in menu page: ${err?.message}`);
  }
}

main().catch(err => {
  console.error("\nFATAL:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
