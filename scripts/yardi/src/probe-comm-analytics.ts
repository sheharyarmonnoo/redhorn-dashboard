/**
 * Probe v3: dump the full menu definition.
 * Found that the menu page contains a `menuItem` JS array with the full
 * tree (id, label, URL). Just dump it all and grep for "Rent Roll".
 */
import { openAuthenticatedSession } from "./auth.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

async function main() {
  const outDir = resolve(process.cwd(), "downloads", "2026-05");
  mkdirSync(outDir, { recursive: true });

  const headed = process.argv.includes("--headed");
  console.log(`probe-comm-analytics v3: ${headed ? "headed" : "headless"}`);

  const session = await openAuthenticatedSession({ headed });
  const { voyager, close } = session;

  try {
    // Switch the menu set to iAnalytics so the menu data array gets populated
    const baseUrl = new URL(voyager.url());
    const menuUrl = `${baseUrl.origin}${baseUrl.pathname}?sMenuSet=iAnalytics`;
    await voyager.goto(menuUrl, { waitUntil: "domcontentloaded" });
    await voyager.waitForTimeout(2500);

    // Pull the entire menuItem array from page-level scripts
    const menuItems = await voyager.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"));
      const out: any[] = [];
      for (const s of scripts) {
        const txt = s.textContent || "";
        // Each line: menuItem[N] = new Array("id", "label", "url");
        const re = /menuItem\[(\d+)\]\s*=\s*new Array\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(txt)) !== null) {
          out.push({ idx: Number(m[1]), id: m[2], label: m[3], url: m[4] });
        }
      }
      return out;
    });

    console.log(`Total menu items: ${menuItems.length}`);
    const path = resolve(outDir, "menu-items.json");
    writeFileSync(path, JSON.stringify(menuItems, null, 2));
    console.log(`Saved → ${path}`);

    // Grep for Rent Roll
    const rrItems = menuItems.filter((m: any) =>
      /rent\s*roll/i.test(m.label) || /rent\s*roll/i.test(m.url)
    );
    console.log("\n=== RENT ROLL menu items ===");
    console.log(JSON.stringify(rrItems, null, 2));

    // Also grep for Analytics tree branches
    const analyticsItems = menuItems.filter((m: any) =>
      /^[\d.]+$/.test(m.id) && (m.label.toLowerCase().includes("analytics") || m.label.toLowerCase().includes("commercial"))
    );
    console.log("\n=== ANALYTICS branches ===");
    console.log(JSON.stringify(analyticsItems, null, 2));

    // Print the full tree for inspection
    console.log("\n=== FULL MENU TREE (first 200) ===");
    for (const m of menuItems.slice(0, 200)) {
      console.log(`  ${m.id.padEnd(10)} | ${m.label.padEnd(40)} | ${m.url.slice(0, 100)}`);
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
