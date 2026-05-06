import { Page } from "playwright";
import { resolve } from "node:path";
import { YardiProperty } from "../properties.js";
import { downloadDirFor, slugForProperty } from "../paths.js";

/**
 * Run Yardi's Tenancy Schedule (a.k.a. Lease Expiration Schedule) report for
 * one property and save the Excel. This carries each lease's rent escalation
 * schedule — the data behind the "Next Rent Increase" rent-roll column.
 *
 * NOTE: Untested against this Yardi instance. The candidate URLs below are
 * common across versions; if none render, the report is soft-failed at the
 * run level (manual override values still drive the column until then).
 */
const CANDIDATE_URLS = [
  "CmrTenancy.aspx",        // Commercial Tenancy Schedule
  "TenancySch.aspx",
  "CmrLeaseExp.aspx",       // Lease Expiration Report
  "LeaseExpiration.aspx",
  "CmrEscalation.aspx",     // Rent Escalation Schedule
];

export async function runTenancyScheduleForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  asOfMonthIso: string
): Promise<string> {
  console.log(`\n→ ${property.name} (${property.code}) — Tenancy Schedule for ${asOfMonthIso}`);

  // Reuse the same form-probe + field-set + Excel button pattern that
  // rent-roll-full.ts uses. Until we have access to a live test instance, this
  // file is a placeholder — runReceivableDetailForProperty + parseReceivableDetail
  // already give us per-lease rent and term, which approximates the data.
  // Once the URL pattern is confirmed, port that probe here.
  throw new Error(
    `runTenancyScheduleForProperty not yet implemented. Candidate URLs to probe: ${CANDIDATE_URLS.join(", ")}`
  );
}
