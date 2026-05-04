import { Page } from "playwright";
import { YardiProperty } from "../properties.js";
import { slugForProperty } from "../paths.js";
import { runSsrsReportForProperty } from "./ssrs.js";

/**
 * Run Yardi's Commercial Lease Ledger SSRS report — per-tenant charge +
 * payment + balance activity for the period. This is what we previously
 * called "Receivable Detail"; Yardi's commercial term for the same data is
 * the Lease Ledger. Powers per-tenant utility-posting checks, aging buckets,
 * payment-pattern analysis, and verified Electric Not Posted alerts.
 *
 * Verified URL: pages/SSRSReportFilter.aspx?select=reports/rs_Comm_Lease_Ledger.SSRS.txt
 */
export async function runReceivableDetailForProperty(
  voyagerPage: Page,
  property: YardiProperty,
  monthIso: string
): Promise<string> {
  return runSsrsReportForProperty(voyagerPage, property, monthIso, {
    reportFile: "rs_Comm_Lease_Ledger.SSRS.txt",
    outputFilename: `${slugForProperty(property.code)}-receivable-detail.xlsx`,
    reportLabel: "Receivable Detail (Lease Ledger)",
    emailSubjectKeywords: ["lease ledger", "commercial lease ledger"],
    setMonthRange: true,
    setBegDate: true,
  });
}
