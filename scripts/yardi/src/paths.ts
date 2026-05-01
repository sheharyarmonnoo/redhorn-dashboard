import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/yardi/src/paths.ts → scripts/yardi
export const scraperRoot = resolve(__dirname, "..");
export const storageStateFile = resolve(scraperRoot, "storageState.json");
export const downloadsRoot = resolve(scraperRoot, "downloads");

// "Latest closed month" — assume today's month if we're past the 5th, else previous month.
// Covers the common case: Yardi reports are usually finalized in the first week of the next month.
export function latestClosedMonth(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getDate() < 5) d.setMonth(d.getMonth() - 1);
  // Otherwise we want the *previous* month's close — Income Statement is always reported for a completed month.
  // So regardless of day, step one month back.
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
