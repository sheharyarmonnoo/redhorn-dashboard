/**
 * Probe v4: Direct nav to CommReportPropertySummary.aspx (Commercial Analytics > Property)
 * to dump form structure and confirm Rent Roll report type generates Excel.
 */
import { openAuthenticatedSession } from "./auth.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const PROPERTY_CODE = "hol";
const PROPERTY_NAME = "Hollister BP1 LLC";
const FROM_DATE = "05/01/2026";
const TARGET_PAGE = "CommReportPropertySummary.aspx";

async function main() {
  const outDir = resolve(process.cwd(), "downloads", "2026-05");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "commercial-analytics-probe.xlsx");

  const headed = process.argv.includes("--headed");
  console.log(`probe-comm-analytics v4 — ${TARGET_PAGE}`);

  const session = await openAuthenticatedSession({ headed });
  const { voyager, close } = session;

  try {
    const baseUrl = new URL(voyager.url());
    const formUrl = `${baseUrl.origin}${baseUrl.pathname.replace(/[^/]*$/, "")}${TARGET_PAGE}?sMenuSet=iAnalytics&_=${Date.now()}`;
    console.log(`Navigating filter iframe to: ${formUrl}`);

    let frame = voyager.frame({ name: "filter" });
    if (frame) {
      await frame.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } else {
      await voyager.evaluate((u) => {
        const f = document.querySelector('iframe[name="filter"]') as HTMLIFrameElement | null;
        if (f) f.src = u;
      }, formUrl);
    }
    await voyager.waitForTimeout(3000);

    frame = voyager.frame({ name: "filter" });
    if (!frame) throw new Error("filter iframe missing");
    console.log(`filter iframe URL: ${frame.url()}`);

    // Dump form structure
    const dump = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input,select,textarea")).map((el: Element) => {
        const e = el as any;
        const out: any = {
          tag: e.tagName,
          id: e.id,
          name: e.name,
          type: e.type || "",
          value: e.value || "",
        };
        if (e.tagName === "SELECT") {
          out.options = Array.from((e as HTMLSelectElement).options).map((o: any) => ({
            value: o.value,
            text: o.text,
            selected: o.selected,
          }));
        }
        return out;
      });
      const buttons = Array.from(document.querySelectorAll("input[type='button'],input[type='submit'],button,input[type='image'],a[onclick]")).map((el: Element) => {
        const e = el as HTMLInputElement;
        return {
          tag: e.tagName,
          id: e.id,
          name: (e as any).name,
          value: (e as any).value || "",
          alt: e.getAttribute("alt") || "",
          text: (e.textContent || "").trim().slice(0, 60),
          onclick: (e.getAttribute("onclick") || "").slice(0, 250),
          href: (e as HTMLAnchorElement).href || "",
        };
      });
      return { inputs, buttons };
    });

    const outDumpPath = resolve(outDir, "comm-analytics-form-dump.json");
    writeFileSync(outDumpPath, JSON.stringify(dump, null, 2));
    console.log(`form dump saved → ${outDumpPath}`);

    console.log("\n=== TEXT inputs (visible fields) ===");
    for (const i of dump.inputs.filter((x: any) => x.type === "text" || x.type === "checkbox" || x.tag === "SELECT")) {
      console.log(`  ${i.tag} id=${i.id} name=${i.name} type=${i.type} value="${i.value}"${i.options ? ` options=${i.options.length}` : ""}`);
      if (i.options && i.options.length < 30) {
        for (const o of i.options) console.log(`     - ${o.value} :: ${o.text}${o.selected ? " (selected)" : ""}`);
      }
    }
    console.log("\n=== BUTTONS / clickables ===");
    for (const b of dump.buttons) {
      const label = b.value || b.alt || b.text || "(none)";
      if (!label && !b.onclick) continue;
      console.log(`  ${b.tag} id=${b.id} value="${label}" onclick=${b.onclick.slice(0, 100)}`);
    }

    // Find select for Report Type
    const reportTypeSel = dump.inputs.find((x: any) =>
      x.tag === "SELECT" && (x.options || []).some((o: any) => /rent.*roll/i.test(o.text))
    );
    if (reportTypeSel) {
      console.log(`\n>>> Report Type dropdown is: id=${reportTypeSel.id} name=${reportTypeSel.name}`);
      console.log(`    Rent Roll option:`, reportTypeSel.options.find((o: any) => /rent.*roll/i.test(o.text)));
    }

    // === Now actually run a Rent Roll export ===
    console.log("\n=== ATTEMPTING RENT ROLL EXPORT ===");
    // 1. Set Property
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
    }, { code: PROPERTY_CODE, name: PROPERTY_NAME });
    console.log(`  set PropertyID = ${PROPERTY_CODE}`);

    // 2. Set Report Type to Rent Roll
    if (reportTypeSel) {
      const rrOption = reportTypeSel.options.find((o: any) => /rent.*roll/i.test(o.text));
      if (rrOption) {
        await frame.locator(`#${reportTypeSel.id}`).selectOption(rrOption.value);
        console.log(`  set ${reportTypeSel.id} = "${rrOption.value}" (${rrOption.text})`);
      }
    }

    // 3. Set From Date
    for (const sel of ["#FromDate", "#FromDate_TextBox", "#fromdate", "[name='FromDate']"]) {
      const loc = frame.locator(sel).first();
      if ((await loc.count()) > 0) {
        await loc.click().catch(() => {});
        await loc.press("Control+A").catch(() => {});
        await loc.fill(FROM_DATE).catch(() => {});
        await loc.press("Tab").catch(() => {});
        const v = await loc.inputValue().catch(() => "");
        console.log(`  set FromDate via ${sel} = "${v}"`);
        break;
      }
    }

    // 4. Make sure Show Detail is checked
    for (const sel of ["#bShowDetail", "[name='bShowDetail']", "input[type='checkbox'][name*='Detail' i]"]) {
      const loc = frame.locator(sel).first();
      if ((await loc.count()) > 0) {
        const isChecked = await loc.isChecked().catch(() => false);
        if (!isChecked) await loc.check().catch(() => {});
        console.log(`  Show Detail (${sel}) checked = ${await loc.isChecked().catch(() => "?")}`);
        break;
      }
    }

    // 5. Click Excel
    let excelClicked = false;
    for (const sel of ["#Excel_Button", 'input[value="Excel" i]', 'input[alt="Excel" i]', 'button:has-text("Excel")']) {
      const loc = frame.locator(sel).first();
      if ((await loc.count()) > 0) {
        console.log(`  clicking Excel via: ${sel}`);
        try {
          const [download] = await Promise.all([
            voyager.waitForEvent("download", { timeout: 90_000 }),
            loc.click(),
          ]);
          await download.saveAs(outPath);
          console.log(`\n✓ DOWNLOADED: ${outPath}`);
          excelClicked = true;
        } catch (err: any) {
          console.log(`  download error: ${err?.message}`);
        }
        break;
      }
    }
    if (!excelClicked) {
      console.log("Excel button not found or click failed.");
    }
  } finally {
    await close();
  }
}

main().catch(err => {
  console.error("\nFATAL:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
