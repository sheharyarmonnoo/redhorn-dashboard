import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's Budget Comparison / Budget vs Actual report for one property +
 * year. Output drives the Budget vs Actuals tab on the Financials page —
 * line-by-line annual budget that can be compared against income_lines YTD.
 *
 * NOTE: Untested. Candidate URLs below are best-guess from common Yardi
 * naming. Until the report URL is confirmed and the parser landed, the
 * Budget vs Actuals tab supports manual entry (one annual figure per line
 * item) which is sufficient for the user to populate at any cadence.
 */
const CANDIDATE_URLS = [
  "BudgetCompare.aspx",
  "BudgetVsActual.aspx",
  "BudgetCmp.aspx",
  "ISBudget.aspx",          // Income Statement w/ Budget column
  "BudgetReport.aspx",
];

export async function runBudgetComparisonForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  yearIso: string             // "2026"
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — Budget Comparison for FY${yearIso}`);

  // See tenancy-schedule.ts notes — placeholder until the live URL is
  // confirmed. Manual entry path on the Financials page works in the
  // meantime.
  throw new Error(
    `runBudgetComparisonForProperty not yet implemented. Candidate URLs to probe: ${CANDIDATE_URLS.join(", ")}`
  );
}
