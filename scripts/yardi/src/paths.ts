import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/yardi/src/paths.ts → scripts/yardi
export const scraperRoot = resolve(__dirname, "..");
export const storageStateFile = resolve(scraperRoot, "storageState.json");
export const downloadsRoot = resolve(scraperRoot, "downloads");

// "Latest closed month" = the most recent month that has fully ended. On any
// day in May, that's April (the prior calendar month). The previous version
// double-stepped early in the month and ended up returning prior-prior month
// (March on May 1-4), which made every default sync pull stale data.
export function latestClosedMonth(now: Date = new Date()): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function downloadDirFor(monthIso: string): string {
  const dir = resolve(downloadsRoot, monthIso);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function slugForProperty(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function incomeStatementFilename(propertyCodeOrName: string): string {
  return `${slugForProperty(propertyCodeOrName)}-income-statement.xlsx`;
}
