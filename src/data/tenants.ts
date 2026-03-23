export type TenantStatus = "current" | "past_due" | "locked_out" | "vacant" | "expiring_soon";

// Delinquency workflow: current → past_due → lockout_pending → locked_out → auction_pending → auction
export type DelinquencyStage = "none" | "past_due" | "default_notice" | "lockout_pending" | "locked_out" | "auction_pending" | "auction";

export interface Tenant {
  unit: string;
  building: "A" | "C" | "D";
  tenant: string;
  leaseType: "Office Net Lease" | "Office Gross Lease";
  sqft: number;
  leaseFrom: string;
  leaseTo: string;
  monthlyRent: number;
  monthlyElectric: number;
  securityDeposit: number;
  status: TenantStatus;
  pastDueAmount: number;
  electricPosted: boolean;
  lastPaymentDate: string;
  notes: string;
  // Unit metadata
  amps?: number;
  makeReady?: boolean;
  splittable?: boolean;
  splitDetail?: string;
  // Delinquency workflow stage
  delinquencyStage?: DelinquencyStage;
  delinquencyDate?: string;
}

export interface LedgerEntry {
  date: string;
  description: string;
  unit: string;
  charge: number;
  payment: number;
  balance: number;
  type: "charge" | "payment";
}

export interface MonthlyRevenue {
  month: string;
  rent: number;
  cam: number;
  electric: number;
  lateFees: number;
  total: number;
  occupancy: number;
}

// Seed data from Yardi RentRoll + Income Statement exports dated 03/23/2026
// Property: Hollister BP1 LLC (hol), Houston TX — Buildings A, C, D
// 45 occupied / 10 vacant / 55 total units — 249,236 SF total
// Trophy Windows LLC is anchor tenant: 195,812 SF (78.6% of property), lease thru Dec 2029

export const tenants: Tenant[] = [

  // ── BUILDING A ──────────────────────────────────────────────────────────────

  // Trophy Windows LLC — anchor tenant spanning ABD + C-218 + D-150 + D-155
  // 195,812 SF total, $123,714.02/mo, lease Aug 2023 – Dec 2029
  // Represents ~78.6% of property SF and ~78.8% of monthly rent
  { unit: "ABD", building: "A", tenant: "Trophy Windows, LLC", leaseType: "Office Gross Lease", sqft: 195812, leaseFrom: "2023-08-01", leaseTo: "2029-12-31", monthlyRent: 123714.02, monthlyElectric: 0, securityDeposit: 138302.19, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Anchor tenant. Spans ABD + C-218 + D-150 + D-155. Includes escalation per lease schedule. Security deposit held in trust." },

  // A-85A — Royal A Logistics Corporation (EXPIRES MARCH 31 — 8 DAYS)
  { unit: "A-85A", building: "A", tenant: "Royal A Logistics Corporation", leaseType: "Office Gross Lease", sqft: 80, leaseFrom: "2022-05-01", leaseTo: "2026-03-31", monthlyRent: 315, monthlyElectric: 0, securityDeposit: 200, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "LEASE EXPIRES MARCH 31, 2026 — 8 days. No renewal on file. Same tenant holds C-209 (Apr 30 expiry)." },

  // A-90 — TRTP Services
  { unit: "A-90", building: "A", tenant: "TRTP Services", leaseType: "Office Net Lease", sqft: 110, leaseFrom: "2024-10-01", leaseTo: "2027-01-31", monthlyRent: 290.20, monthlyElectric: 30, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Net lease. No security deposit on file." },

  // A-102 — Houston Luxury Lighting LLC
  { unit: "A-102", building: "A", tenant: "Houston Luxury Lighting LLC", leaseType: "Office Net Lease", sqft: 180, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 412, monthlyElectric: 15, securityDeposit: 400, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Net lease. CAM-Electric billed separately." },

  // A-103 / A-112 / A-85 — Alliance Cargo Inc (combined lease, 728 SF)
  { unit: "A-103", building: "A", tenant: "Alliance Cargo, Inc", leaseType: "Office Gross Lease", sqft: 728, leaseFrom: "2023-08-01", leaseTo: "2026-07-14", monthlyRent: 1646.40, monthlyElectric: 0, securityDeposit: 1450, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Combined lease covers A-103, A-112, A-85 (728 SF total). Expires Jul 14, 2026 — within 90 days. Renewal discussion needed." },

  // A-106 — CNJ Holdings
  { unit: "A-106", building: "A", tenant: "CNJ Holdings", leaseType: "Office Gross Lease", sqft: 208, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 548.87, monthlyElectric: 0, securityDeposit: 450, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },

  // A-106A — Texas State Builders
  { unit: "A-106A", building: "A", tenant: "Texas State Builders", leaseType: "Office Gross Lease", sqft: 208, leaseFrom: "2024-09-01", leaseTo: "2026-08-31", monthlyRent: 546, monthlyElectric: 0, securityDeposit: 1600, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires Aug 31, 2026." },

  // A-107 — Gracious Advance Auto LLC
  { unit: "A-107", building: "A", tenant: "Gracious Advance Auto, LLC", leaseType: "Office Gross Lease", sqft: 208, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 450.67, monthlyElectric: 0, securityDeposit: 450.67, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant holds C-207." },

  // A-108 / A-110 / A-95 — Clean Spec LLC (combined, 466 SF)
  { unit: "A-108", building: "A", tenant: "Clean Spec, LLC", leaseType: "Office Net Lease", sqft: 466, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 915, monthlyElectric: 30, securityDeposit: 550, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Combined lease covers A-108, A-110, A-95 (466 SF total). Same tenant holds C-215." },

  // A-111 / C-216 — Beacon Restoration and Cleaning of Houston LLC (combined, 2,008 SF)
  { unit: "A-111", building: "A", tenant: "Beacon Restoration and Cleaning of Houston, LLC", leaseType: "Office Net Lease", sqft: 2008, leaseFrom: "2024-06-01", leaseTo: "2026-06-30", monthlyRent: 1747, monthlyElectric: 60, securityDeposit: 1696, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Combined lease covers A-111 + C-216 (2,008 SF). Expires Jun 30, 2026 — within 90 days. Renewal needed." },

  // A-120 — Car Care Cosmetics of Houston Inc (EXPIRES APRIL 30)
  { unit: "A-120", building: "A", tenant: "Car Care Cosmetics of Houston, Inc.", leaseType: "Office Gross Lease", sqft: 250, leaseFrom: "2023-05-01", leaseTo: "2026-04-30", monthlyRent: 277.15, monthlyElectric: 0, securityDeposit: 800, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026 — 38 days. No renewal on file." },

  // ── BUILDING C ──────────────────────────────────────────────────────────────

  // C-100 — Flavorly LLC
  { unit: "C-100", building: "C", tenant: "Flavorly, LLC", leaseType: "Office Gross Lease", sqft: 5000, leaseFrom: "2023-12-01", leaseTo: "2028-12-31", monthlyRent: 3997.50, monthlyElectric: 0, securityDeposit: 3250, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Long-term lease through Dec 2028." },

  // C-192 — Sergio Cuellar (expires May 31)
  { unit: "C-192", building: "C", tenant: "Sergio Cuellar", leaseType: "Office Net Lease", sqft: 1250, leaseFrom: "2023-05-01", leaseTo: "2026-05-31", monthlyRent: 1025, monthlyElectric: 0, securityDeposit: 1000, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires May 31, 2026 — 69 days. Renewal discussion needed." },

  // C-194 — Mark Rendon / Design HVAC Inc (NEW TENANT as of Mar 1, 2026)
  { unit: "C-194", building: "C", tenant: "Mark Rendon / Design HVAC Inc.", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2026-03-01", leaseTo: "2027-02-28", monthlyRent: 1070, monthlyElectric: 0, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "New tenant as of Mar 2026. No security deposit collected. 12-month lease." },

  // C-202 — Elite Pool Plastering (EXPIRES APRIL 30)
  { unit: "C-202", building: "C", tenant: "Elite Pool Plastering", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2023-05-01", leaseTo: "2026-04-30", monthlyRent: 1060.50, monthlyElectric: 0, securityDeposit: 950, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026 — 38 days. No renewal on file." },

  // C-203 — Fervent Designs LLC (EXPIRES APRIL 30)
  { unit: "C-203", building: "C", tenant: "Fervent Designs, LLC", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2024-04-01", leaseTo: "2026-04-30", monthlyRent: 1034.25, monthlyElectric: 0, securityDeposit: 985, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026 — 38 days. No renewal on file." },

  // C-205 — Miguel Angel Bueno Jr
  { unit: "C-205", building: "C", tenant: "Miguel Angel Bueno, Jr.", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-07-01", leaseTo: "2026-07-31", monthlyRent: 556.29, monthlyElectric: 0, securityDeposit: 530, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires Jul 31, 2026." },

  // C-206 — Mohammad S. Imam
  { unit: "C-206", building: "C", tenant: "Mohammad S. Imam", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 584.46, monthlyElectric: 0, securityDeposit: 530, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },

  // C-207 — Gracious Advance Auto LLC (2nd unit)
  { unit: "C-207", building: "C", tenant: "Gracious Advance Auto, LLC", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 595.83, monthlyElectric: 0, securityDeposit: 595.83, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant holds A-107." },

  // C-208 — Visual Design Blinds LLC (EXPIRES MARCH 31 — 8 DAYS)
  { unit: "C-208", building: "C", tenant: "Visual Design Blinds, LLC", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2025-04-01", leaseTo: "2026-03-31", monthlyRent: 550, monthlyElectric: 0, securityDeposit: 550, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "LEASE EXPIRES MARCH 31, 2026 — 8 days. No renewal on file." },

  // C-209 — Royal A Logistics Corporation (2nd unit, EXPIRES APRIL 30)
  { unit: "C-209", building: "C", tenant: "Royal A Logistics Corporation", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2022-05-01", leaseTo: "2026-04-30", monthlyRent: 1155, monthlyElectric: 0, securityDeposit: 1100, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026 — 38 days. Same tenant holds A-85A (expires Mar 31). Coordinate both renewals." },

  // C-210 — Chert Capital Management (EXPIRES APRIL 30)
  { unit: "C-210", building: "C", tenant: "Chert Capital Management", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2025-05-01", leaseTo: "2026-04-30", monthlyRent: 568.75, monthlyElectric: 0, securityDeposit: 568.75, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026 — 38 days. No renewal on file." },

  // C-211 — Emily W. Ogutu (expires May 31)
  { unit: "C-211", building: "C", tenant: "Emily W. Ogutu", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-06-01", leaseTo: "2026-05-31", monthlyRent: 598.50, monthlyElectric: 0, securityDeposit: 530, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires May 31, 2026 — 69 days." },

  // C-212 — Ecofibre (expires May 31)
  { unit: "C-212", building: "C", tenant: "Ecofibre", leaseType: "Office Net Lease", sqft: 1800, leaseFrom: "2024-10-01", leaseTo: "2026-05-31", monthlyRent: 1650, monthlyElectric: 75, securityDeposit: 1350, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires May 31, 2026 — 69 days. Net lease." },

  // C-212A — Hugo Ayala
  { unit: "C-212A", building: "C", tenant: "Hugo Ayala", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2025-09-01", leaseTo: "2026-08-31", monthlyRent: 552.08, monthlyElectric: 0, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "No security deposit collected." },

  // C-213 — Mauricio Cruz
  { unit: "C-213", building: "C", tenant: "Mauricio Cruz", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "2024-03-01", leaseTo: "2027-02-28", monthlyRent: 1311, monthlyElectric: 0, securityDeposit: 1000, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },

  // C-215 — Clean Spec LLC (2nd unit)
  { unit: "C-215", building: "C", tenant: "Clean Spec, LLC", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 1590, monthlyElectric: 0, securityDeposit: 1750, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant holds A-108." },

  // C-301 — Alexis M. Munoz & Myles Q. Jones (EXPIRES MARCH 31 — 8 DAYS)
  { unit: "C-301", building: "C", tenant: "Alexis M. Munoz & Myles Q. Jones", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2023-03-01", leaseTo: "2026-03-31", monthlyRent: 1013.54, monthlyElectric: 0, securityDeposit: 1000, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "LEASE EXPIRES MARCH 31, 2026 — 8 days. No renewal on file." },

  // C-302 — APRR Solutions LLC
  { unit: "C-302", building: "C", tenant: "APRR Solutions, LLC", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-11-01", leaseTo: "2026-11-30", monthlyRent: 535, monthlyElectric: 0, securityDeposit: 520, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant holds C-303." },

  // C-303 — APRR Solutions LLC (2nd unit, EXPIRES APRIL 30)
  { unit: "C-303", building: "C", tenant: "APRR Solutions, LLC", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2024-05-01", leaseTo: "2026-04-30", monthlyRent: 520, monthlyElectric: 0, securityDeposit: 450, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026 — 38 days. Same tenant holds C-302 through Nov 2026." },

  // C-304 — Ace Custom Fab LLC (expires May 31)
  { unit: "C-304", building: "C", tenant: "Ace Custom Fab, LLC", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2025-06-01", leaseTo: "2026-05-31", monthlyRent: 560, monthlyElectric: 0, securityDeposit: 1120, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires May 31, 2026 — 69 days. Double security deposit on file." },

  // C-305 — Cody R. Risner
  { unit: "C-305", building: "C", tenant: "Cody R. Risner", leaseType: "Office Net Lease", sqft: 662, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 551, monthlyElectric: 0, securityDeposit: 535, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Net lease." },

  // C-306 — Angel Fabian Andueza
  { unit: "C-306", building: "C", tenant: "Angel Fabian Andueza", leaseType: "Office Gross Lease", sqft: 466, leaseFrom: "2025-08-01", leaseTo: "2027-07-31", monthlyRent: 500, monthlyElectric: 0, securityDeposit: 550, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },

  // C-307 — G&M Grocery Express
  { unit: "C-307", building: "C", tenant: "G&M Grocery Express", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2023-08-01", leaseTo: "2026-08-31", monthlyRent: 540.75, monthlyElectric: 0, securityDeposit: 500, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires Aug 31, 2026." },

  // C-308 — Pierre-Louis Edriss
  { unit: "C-308", building: "C", tenant: "Pierre-Louis Edriss", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2024-09-01", leaseTo: "2026-08-31", monthlyRent: 656.25, monthlyElectric: 0, securityDeposit: 575, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires Aug 31, 2026." },

  // ── BUILDING D ──────────────────────────────────────────────────────────────

  // D-154 / D-160 — Wortham Madison Property LLC (combined, 4,525 SF)
  { unit: "D-154", building: "D", tenant: "Wortham Madison Property, LLC", leaseType: "Office Net Lease", sqft: 4525, leaseFrom: "2024-08-01", leaseTo: "2028-12-31", monthlyRent: 3355.63, monthlyElectric: 200, securityDeposit: 2015, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Combined lease covers D-154 + D-160 (4,525 SF total). Long-term through Dec 2028.", amps: 400 },

  // ── VACANT UNITS ────────────────────────────────────────────────────────────

  { unit: "C-101", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
  { unit: "C-102", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
  { unit: "C-103", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant.", makeReady: true },
  { unit: "C-200", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 2500, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant. Splittable — lock door to create 2 units.", splittable: true, splitDetail: "2,500 SF or split into 1,250 + 1,250 SF", makeReady: true },
  { unit: "C-200A", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
  { unit: "C-201", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
  { unit: "C-204", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 3750, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant. Large unit — splittable.", splittable: true },
  { unit: "C-214", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
  { unit: "C-217", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
];

// Lease ledger for A-102 — Houston Luxury Lighting LLC
// Net lease: $412/mo base rent + ~$15/mo electric CAM charge
export const ledgerA102: LedgerEntry[] = [
  { date: "2024-12-01", description: "Security Deposit", unit: "A-102", charge: 400, payment: 0, balance: 400, type: "charge" },
  { date: "2024-12-01", description: "Base Rent (12/2024)", unit: "A-102", charge: 412, payment: 0, balance: 812, type: "charge" },
  { date: "2024-12-01", description: "CAM-Electric (12/2024)", unit: "A-102", charge: 15, payment: 0, balance: 827, type: "charge" },
  { date: "2024-12-01", description: "Payment — SD Transfer", unit: "A-102", charge: 0, payment: 400, balance: 427, type: "payment" },
  { date: "2024-12-15", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-01-01", description: "Base Rent (01/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-01-01", description: "CAM-Electric (01/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-01-05", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-02-01", description: "Base Rent (02/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-02-01", description: "CAM-Electric (02/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-02-03", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-03-01", description: "Base Rent (03/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-03-01", description: "CAM-Electric (03/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-03-04", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-04-01", description: "Base Rent (04/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-04-01", description: "CAM-Electric (04/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-04-03", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-05-01", description: "Base Rent (05/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-05-01", description: "CAM-Electric (05/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-05-02", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-06-01", description: "Base Rent (06/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-06-01", description: "CAM-Electric (06/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-06-03", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-07-01", description: "Base Rent (07/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-07-01", description: "CAM-Electric (07/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-07-07", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-08-01", description: "Base Rent (08/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-08-01", description: "CAM-Electric (08/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-08-04", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-09-01", description: "Base Rent (09/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-09-01", description: "CAM-Electric (09/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-09-03", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-10-01", description: "Base Rent (10/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-10-01", description: "CAM-Electric (10/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-10-06", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-11-01", description: "Base Rent (11/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-11-01", description: "CAM-Electric (11/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-11-04", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2025-12-01", description: "Base Rent (12/2025)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2025-12-01", description: "CAM-Electric (12/2025)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2025-12-03", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2026-01-01", description: "Base Rent (01/2026)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2026-01-01", description: "CAM-Electric (01/2026)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2026-01-05", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2026-02-01", description: "Base Rent (02/2026)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2026-02-01", description: "CAM-Electric (02/2026)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2026-02-03", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
  { date: "2026-03-01", description: "Base Rent (03/2026)", unit: "A-102", charge: 412, payment: 0, balance: 412, type: "charge" },
  { date: "2026-03-01", description: "CAM-Electric (03/2026)", unit: "A-102", charge: 15, payment: 0, balance: 427, type: "charge" },
  { date: "2026-03-03", description: "ACH Payment", unit: "A-102", charge: 0, payment: 427, balance: 0, type: "payment" },
];

// Monthly revenue trend — Hollister BP1 LLC
// Source: Yardi Income Statement 03/23/2026
// Mar 2026 actual: $160,582 total income (cash basis)
// YTD Jan–Mar 2026: $497,040 → Jan+Feb avg ~$168,229/mo
// Prior months estimated based on Trophy Windows $123,714/mo anchor + small tenant run rate
export const monthlyRevenue: MonthlyRevenue[] = [
  { month: "2025-07", rent: 138200, cam: 9800, electric: 725, lateFees: 300, total: 149025, occupancy: 90 },
  { month: "2025-08", rent: 140100, cam: 9800, electric: 725, lateFees: 0,   total: 150625, occupancy: 91 },
  { month: "2025-09", rent: 143500, cam: 10200, electric: 725, lateFees: 450, total: 154875, occupancy: 91 },
  { month: "2025-10", rent: 145800, cam: 10200, electric: 725, lateFees: 0,   total: 156725, occupancy: 92 },
  { month: "2025-11", rent: 147200, cam: 10400, electric: 725, lateFees: 600, total: 158925, occupancy: 92 },
  { month: "2025-12", rent: 148100, cam: 10400, electric: 725, lateFees: 0,   total: 159225, occupancy: 93 },
  { month: "2026-01", rent: 155400, cam: 11200, electric: 725, lateFees: 0,   total: 167325, occupancy: 93 },
  { month: "2026-02", rent: 155800, cam: 11400, electric: 725, lateFees: 575, total: 168500, occupancy: 93 },
  { month: "2026-03", rent: 148801, cam: 11371, electric: 725, lateFees: 411, total: 160582, occupancy: 92.9 },
];

// Helper functions
export function getBuilding(unit: string): "A" | "C" | "D" {
  if (unit.startsWith("A") || unit === "ABD") return "A";
  if (unit.startsWith("D")) return "D";
  return "C";
}

export function getStatusColor(status: TenantStatus): string {
  switch (status) {
    case "current": return "bg-emerald-500";
    case "past_due": return "bg-red-500";
    case "locked_out": return "bg-yellow-500";
    case "vacant": return "bg-gray-500";
    case "expiring_soon": return "bg-blue-500";
  }
}

export function getStatusLabel(status: TenantStatus): string {
  switch (status) {
    case "current": return "Current";
    case "past_due": return "Past Due";
    case "locked_out": return "Locked Out";
    case "vacant": return "Vacant";
    case "expiring_soon": return "Expiring Soon";
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

export function getAlerts() {
  const alerts: { type: "critical" | "warning" | "info"; message: string; unit: string; date: string }[] = [];

  for (const t of tenants) {
    if (t.status === "vacant") continue;

    // Electric not posted
    if (t.leaseType === "Office Net Lease" && !t.electricPosted && t.tenant !== "") {
      alerts.push({ type: "critical", message: `Electric not posted`, unit: t.unit, date: "2026-03-01" });
    }

    // Past due
    if (t.pastDueAmount > 0) {
      alerts.push({ type: "critical", message: `Past due: ${formatCurrency(t.pastDueAmount)}`, unit: t.unit, date: "2026-03-01" });
    }

    // Expiring soon
    if (t.status === "expiring_soon") {
      const isUrgent = t.leaseTo <= "2026-03-31";
      alerts.push({
        type: isUrgent ? "critical" : "warning",
        message: `Lease expires ${t.leaseTo}${isUrgent ? " — URGENT" : " — no renewal on file"}`,
        unit: t.unit,
        date: t.leaseTo,
      });
    }
  }

  return alerts.sort((a, b) => (a.type === "critical" ? -1 : 1) - (b.type === "critical" ? -1 : 1));
}
