import { Page } from "playwright";

export interface YardiProperty {
  code: string;        // Yardi property code (e.g. "hol", "bel") — used inside Yardi UI
  convexCode: string;  // Convex `properties.code` — used when ingesting to income_lines
  name: string;        // Human-readable name
}

/**
 * The properties visible in Redhorn's Yardi Voyager property picker:
 *
 *   .redhorn  Redhorn Properties (portfolio rollup — skipped, we want per-property)
 *   bel       7012 Belgold Business Park LLC
 *   hol       Hollister BP1 LLC
 *
 * Hardcoded for now because the "Custom Financial Reports" page expects a property
 * code typed directly into the LookupCode field — we don't need to scrape the list.
 * If Redhorn adds a new property this list needs updating (or we swap in the
 * discoverFromPicker() scraping path below).
 */
export const KNOWN_PROPERTIES: YardiProperty[] = [
  { code: "hol", convexCode: "hollister", name: "Hollister BP1 LLC" },
  { code: "bel", convexCode: "belgold",  name: "7012 Belgold Business Park LLC" },
];

export async function getProperties(_page: Page): Promise<YardiProperty[]> {
  return KNOWN_PROPERTIES;
}

/**
 * Optional alternative: open the Property lookup modal and scrape the table.
 * Not used by default because the modal only opens from inside a report page,
 * and we already know the codes. Kept here for when the list grows.
 */
export async function discoverFromPicker(voyagerPage: Page): Promise<YardiProperty[]> {
  const frame = voyagerPage.frame({ name: "filter" });
  if (!frame) throw new Error("Voyager 'filter' iframe not found.");

  await frame.locator("#PropertyID_LookupLink").click();
  // Modal lives in the top document, not the iframe
  const modal = voyagerPage.locator("text=Property").locator("..").locator("table").first();
  await modal.waitFor({ timeout: 10_000 });

  const rows = await modal.locator("tr").evaluateAll((trs: Element[]) =>
    (trs as HTMLTableRowElement[])
      .map(tr => {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 2) return null;
        const code = (cells[1]?.textContent || "").trim();
        const name = (cells[2]?.textContent || "").trim();
        return code ? { code, name } : null;
      })
      .filter(Boolean)
  );

  // Close modal
  await voyagerPage.keyboard.press("Escape").catch(() => {});

  return (rows as any[])
    .filter(p => p.code && !p.code.startsWith("."))  // drop portfolio rollups
    .map(p => ({ code: p.code, convexCode: p.code, name: p.name || p.code }));
}
