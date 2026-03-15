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
  // Unit metadata (from meeting: Ori wanted amps, make-ready, splittable)
  amps?: number;             // electrical capacity (200, 400)
  makeReady?: boolean;       // unit needs make-ready work
  splittable?: boolean;      // can be split into smaller units
  splitDetail?: string;      // e.g. "2,500 + 1,250 SF"
  // Delinquency workflow stage
  delinquencyStage?: DelinquencyStage;
  delinquencyDate?: string;  // date stage was set
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

// Seed data derived from Yardi RentRoll export dated 03/12/2026
// Property: Hollister Business Park, Houston TX
// Buildings A, C, D — ~325,000 sq ft industrial/retail

export const tenants: Tenant[] = [
  // Building A — occupied
  { unit: "A-85", building: "A", tenant: "Gulf Coast Logistics LLC", leaseType: "Office Gross Lease", sqft: 4200, leaseFrom: "2024-06-01", leaseTo: "2027-05-31", monthlyRent: 4620, monthlyElectric: 380, securityDeposit: 4620, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "A-85A", building: "A", tenant: "Bayou City Printing", leaseType: "Office Gross Lease", sqft: 2100, leaseFrom: "2025-01-01", leaseTo: "2026-12-31", monthlyRent: 2310, monthlyElectric: 190, securityDeposit: 2310, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "A-90", building: "A", tenant: "Houston Hydraulics Inc", leaseType: "Office Net Lease", sqft: 6800, leaseFrom: "2023-03-01", leaseTo: "2026-02-28", monthlyRent: 6120, monthlyElectric: 520, securityDeposit: 6120, status: "past_due", pastDueAmount: 12760, electricPosted: false, lastPaymentDate: "2026-01-05", notes: "Lease expired — holdover tenant. 2 months past due. No renewal signed.", amps: 400, delinquencyStage: "default_notice", delinquencyDate: "2026-03-10" },
  { unit: "A-95", building: "A", tenant: "Precision CNC Services", leaseType: "Office Net Lease", sqft: 3800, leaseFrom: "2024-09-01", leaseTo: "2027-08-31", monthlyRent: 3420, monthlyElectric: 310, securityDeposit: 3420, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "A-102", building: "A", tenant: "Lone Star Electric Co", leaseType: "Office Net Lease", sqft: 5200, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 4680, monthlyElectric: 420, securityDeposit: 4680, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "ACH auto-pay. Good tenant.", amps: 200 },
  { unit: "A-103", building: "A", tenant: "Gulf Coast Logistics LLC", leaseType: "Office Gross Lease", sqft: 3100, leaseFrom: "2024-06-01", leaseTo: "2027-05-31", monthlyRent: 3410, monthlyElectric: 0, securityDeposit: 3410, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant as A-85" },
  { unit: "A-106", building: "A", tenant: "Fiesta Party Supplies", leaseType: "Office Gross Lease", sqft: 2800, leaseFrom: "2025-04-01", leaseTo: "2028-03-31", monthlyRent: 3080, monthlyElectric: 0, securityDeposit: 3080, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "A-106A", building: "A", tenant: "QuickShip Packaging", leaseType: "Office Gross Lease", sqft: 1400, leaseFrom: "2025-07-01", leaseTo: "2026-06-30", monthlyRent: 1540, monthlyElectric: 0, securityDeposit: 1540, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Lease expires in ~3.5 months. No renewal discussion." },
  { unit: "A-107", building: "A", tenant: "H-Town Auto Parts", leaseType: "Office Gross Lease", sqft: 3600, leaseFrom: "2024-01-01", leaseTo: "2026-12-31", monthlyRent: 3960, monthlyElectric: 0, securityDeposit: 3960, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-02", notes: "" },
  { unit: "A-108", building: "A", tenant: "Precision CNC Services", leaseType: "Office Net Lease", sqft: 4100, leaseFrom: "2024-09-01", leaseTo: "2027-08-31", monthlyRent: 3690, monthlyElectric: 340, securityDeposit: 3690, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant as A-95" },
  { unit: "A-110", building: "A", tenant: "Precision CNC Services", leaseType: "Office Net Lease", sqft: 2900, leaseFrom: "2024-09-01", leaseTo: "2027-08-31", monthlyRent: 2610, monthlyElectric: 240, securityDeposit: 2610, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant as A-95, A-108" },
  { unit: "A-111", building: "A", tenant: "SouthWest Coatings", leaseType: "Office Net Lease", sqft: 5500, leaseFrom: "2023-08-01", leaseTo: "2026-07-31", monthlyRent: 4950, monthlyElectric: 450, securityDeposit: 4950, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Lease expires in ~4.5 months. Tenant expressed interest in renewal." },
  { unit: "A-112", building: "A", tenant: "Gulf Coast Logistics LLC", leaseType: "Office Gross Lease", sqft: 2400, leaseFrom: "2024-06-01", leaseTo: "2027-05-31", monthlyRent: 2640, monthlyElectric: 0, securityDeposit: 2640, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant as A-85, A-103" },
  { unit: "A-120", building: "A", tenant: "Clear Lake IT Solutions", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "2025-10-01", leaseTo: "2027-09-30", monthlyRent: 1980, monthlyElectric: 0, securityDeposit: 1980, status: "past_due", pastDueAmount: 1980, electricPosted: true, lastPaymentDate: "2026-02-01", notes: "March rent not received. First-time late." },

  // Building C — 2nd floor
  { unit: "C-100", building: "C", tenant: "Texas Star Insurance", leaseType: "Office Gross Lease", sqft: 3200, leaseFrom: "2024-03-01", leaseTo: "2027-02-28", monthlyRent: 3840, monthlyElectric: 0, securityDeposit: 3840, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-192", building: "C", tenant: "Cypress Creek Welding", leaseType: "Office Net Lease", sqft: 7200, leaseFrom: "2022-06-01", leaseTo: "2027-05-31", monthlyRent: 6480, monthlyElectric: 580, securityDeposit: 6480, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-194", building: "C", tenant: "Alamo Staffing Group", leaseType: "Office Gross Lease", sqft: 2600, leaseFrom: "2025-02-01", leaseTo: "2028-01-31", monthlyRent: 3120, monthlyElectric: 0, securityDeposit: 3120, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-202", building: "C", tenant: "Memorial Dental Lab", leaseType: "Office Gross Lease", sqft: 1500, leaseFrom: "2025-06-01", leaseTo: "2026-05-31", monthlyRent: 1800, monthlyElectric: 0, securityDeposit: 1800, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Lease expires in ~2.5 months." },
  { unit: "C-203", building: "C", tenant: "Westchase Accounting", leaseType: "Office Gross Lease", sqft: 1200, leaseFrom: "2024-11-01", leaseTo: "2026-10-31", monthlyRent: 1440, monthlyElectric: 0, securityDeposit: 1440, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-205", building: "C", tenant: "ProTech Security Systems", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "2025-03-01", leaseTo: "2027-02-28", monthlyRent: 2160, monthlyElectric: 0, securityDeposit: 2160, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-206", building: "C", tenant: "Katy Freight Brokers", leaseType: "Office Gross Lease", sqft: 1600, leaseFrom: "2024-08-01", leaseTo: "2026-07-31", monthlyRent: 1920, monthlyElectric: 0, securityDeposit: 1920, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Lease expires in ~4.5 months." },
  { unit: "C-207", building: "C", tenant: "Brazos Valley Imports", leaseType: "Office Gross Lease", sqft: 1400, leaseFrom: "2025-01-01", leaseTo: "2026-12-31", monthlyRent: 1680, monthlyElectric: 0, securityDeposit: 1680, status: "past_due", pastDueAmount: 3360, electricPosted: true, lastPaymentDate: "2026-01-03", notes: "Feb + March past due. PM sent default letter 03/10.", delinquencyStage: "lockout_pending", delinquencyDate: "2026-03-12" },
  { unit: "C-208", building: "C", tenant: "Galleria Copy Center", leaseType: "Office Gross Lease", sqft: 1100, leaseFrom: "2025-05-01", leaseTo: "2027-04-30", monthlyRent: 1320, monthlyElectric: 0, securityDeposit: 1320, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-209", building: "C", tenant: "Pearland Tax Services", leaseType: "Office Gross Lease", sqft: 1000, leaseFrom: "2024-04-01", leaseTo: "2027-03-31", monthlyRent: 1200, monthlyElectric: 0, securityDeposit: 1200, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-210", building: "C", tenant: "Greenway Chiropractic", leaseType: "Office Gross Lease", sqft: 1300, leaseFrom: "2025-09-01", leaseTo: "2027-08-31", monthlyRent: 1560, monthlyElectric: 0, securityDeposit: 1560, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-211", building: "C", tenant: "Spring Branch Tutoring", leaseType: "Office Gross Lease", sqft: 900, leaseFrom: "2025-08-01", leaseTo: "2026-07-31", monthlyRent: 1080, monthlyElectric: 0, securityDeposit: 1080, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Lease expires in ~4.5 months." },
  { unit: "C-212", building: "C", tenant: "Westheimer Medical Supply", leaseType: "Office Net Lease", sqft: 4800, leaseFrom: "2023-01-01", leaseTo: "2027-12-31", monthlyRent: 4320, monthlyElectric: 390, securityDeposit: 4320, status: "current", pastDueAmount: 0, electricPosted: false, lastPaymentDate: "2026-03-01", notes: "March electric NOT posted by PM." },
  { unit: "C-212A", building: "C", tenant: "ABC Notary Public", leaseType: "Office Gross Lease", sqft: 600, leaseFrom: "2025-11-01", leaseTo: "2026-10-31", monthlyRent: 720, monthlyElectric: 0, securityDeposit: 720, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-213", building: "C", tenant: "Montrose Design Studio", leaseType: "Office Gross Lease", sqft: 1100, leaseFrom: "2024-07-01", leaseTo: "2026-06-30", monthlyRent: 1320, monthlyElectric: 0, securityDeposit: 1320, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Lease expires in ~3.5 months." },
  { unit: "C-215", building: "C", tenant: "Cypress Bookkeeping", leaseType: "Office Gross Lease", sqft: 800, leaseFrom: "2025-03-01", leaseTo: "2027-02-28", monthlyRent: 960, monthlyElectric: 0, securityDeposit: 960, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-216", building: "C", tenant: "SouthWest Coatings", leaseType: "Office Net Lease", sqft: 3800, leaseFrom: "2023-08-01", leaseTo: "2026-07-31", monthlyRent: 3420, monthlyElectric: 310, securityDeposit: 3420, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant as A-111. Combined expiry." },
  { unit: "C-218", building: "C", tenant: "Redhorn Capital (Owner)", leaseType: "Office Gross Lease", sqft: 2000, leaseFrom: "2022-01-01", leaseTo: "2030-12-31", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Owner-occupied. No rent." },

  // Building C — 3rd floor
  { unit: "C-301", building: "C", tenant: "Houston Web Developers", leaseType: "Office Gross Lease", sqft: 2200, leaseFrom: "2024-10-01", leaseTo: "2027-09-30", monthlyRent: 2640, monthlyElectric: 0, securityDeposit: 2640, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-302", building: "C", tenant: "Champion Recruiting", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "2025-01-01", leaseTo: "2027-12-31", monthlyRent: 2160, monthlyElectric: 0, securityDeposit: 2160, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-303", building: "C", tenant: "Lone Star Legal Aid", leaseType: "Office Gross Lease", sqft: 1500, leaseFrom: "2024-06-01", leaseTo: "2027-05-31", monthlyRent: 1800, monthlyElectric: 0, securityDeposit: 1800, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-304", building: "C", tenant: "Tanglewood Financial", leaseType: "Office Gross Lease", sqft: 1600, leaseFrom: "2025-04-01", leaseTo: "2028-03-31", monthlyRent: 1920, monthlyElectric: 0, securityDeposit: 1920, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-305", building: "C", tenant: "Energy Corridor Consulting", leaseType: "Office Net Lease", sqft: 3500, leaseFrom: "2024-01-01", leaseTo: "2026-12-31", monthlyRent: 3150, monthlyElectric: 290, securityDeposit: 3150, status: "current", pastDueAmount: 0, electricPosted: false, lastPaymentDate: "2026-03-01", notes: "March electric NOT posted by PM." },
  { unit: "C-306", building: "C", tenant: "Heights Realty Group", leaseType: "Office Gross Lease", sqft: 1200, leaseFrom: "2025-06-01", leaseTo: "2027-05-31", monthlyRent: 1440, monthlyElectric: 0, securityDeposit: 1440, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-307", building: "C", tenant: "Sugarland Travel Agency", leaseType: "Office Gross Lease", sqft: 1000, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 1200, monthlyElectric: 0, securityDeposit: 1200, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
  { unit: "C-308", building: "C", tenant: "Med Center Billing Co", leaseType: "Office Gross Lease", sqft: 1400, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 1680, monthlyElectric: 0, securityDeposit: 1680, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },

  // Building D
  { unit: "D-150", building: "D", tenant: "Redhorn Capital (Owner)", leaseType: "Office Gross Lease", sqft: 8000, leaseFrom: "2022-01-01", leaseTo: "2030-12-31", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Owner-occupied warehouse." },
  { unit: "D-154", building: "D", tenant: "Westpark Industrial", leaseType: "Office Net Lease", sqft: 12000, leaseFrom: "2023-06-01", leaseTo: "2028-05-31", monthlyRent: 9600, monthlyElectric: 850, securityDeposit: 9600, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "", amps: 400 },
  { unit: "D-155", building: "D", tenant: "Redhorn Capital (Owner)", leaseType: "Office Gross Lease", sqft: 6000, leaseFrom: "2022-01-01", leaseTo: "2030-12-31", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Owner-occupied." },
  { unit: "D-160", building: "D", tenant: "Westpark Industrial", leaseType: "Office Net Lease", sqft: 8500, leaseFrom: "2023-06-01", leaseTo: "2028-05-31", monthlyRent: 6800, monthlyElectric: 610, securityDeposit: 6800, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Same tenant as D-154", amps: 400 },

  // Vacant units (from rent roll rows 44-52, no lease type = vacant)
  { unit: "C-101", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 2800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant since 2025-09." },
  { unit: "C-102", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 2400, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant since 2025-11." },
  { unit: "C-103", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 2200, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant since 2025-07.", makeReady: true },
  { unit: "C-200", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 3700, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant since 2026-01. Splittable — lock door to create 2 units.", splittable: true, splitDetail: "2,500 + 1,250 SF", makeReady: true },
  { unit: "C-201", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1500, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "" },
  { unit: "C-204", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1200, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "" },
  { unit: "C-214", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 900, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "" },
  { unit: "C-217", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1400, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "" },
];

// Lease ledger for A-102 (from Yardi export — Lone Star Electric Co)
export const ledgerA102: LedgerEntry[] = [
  { date: "2025-01-01", description: "Security Deposit", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-01-01", description: "Base Rent (01/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 9360, type: "charge" },
  { date: "2025-01-01", description: "CAM-Electric (01/2025)", unit: "A-102", charge: 420, payment: 0, balance: 9780, type: "charge" },
  { date: "2025-01-01", description: "Chk# Hol SD Transfer", unit: "A-102", charge: 0, payment: 4680, balance: 5100, type: "payment" },
  { date: "2025-01-20", description: "Chk# ACH3.20.25", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-02-01", description: "Base Rent (02/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-02-01", description: "CAM-Electric (02/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-02-01", description: "ACH-11077 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-03-01", description: "Base Rent (03/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-03-01", description: "CAM-Electric (03/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-03-01", description: "ACH-11332 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-04-01", description: "Base Rent (04/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-04-01", description: "CAM-Electric (04/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-04-01", description: "ACH-11636 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-05-01", description: "Base Rent (05/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-05-01", description: "CAM-Electric (05/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-05-01", description: "ACH-11981 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-06-01", description: "Base Rent (06/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-06-01", description: "CAM-Electric (06/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-06-01", description: "ACH-12331 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-07-01", description: "Base Rent (07/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-07-01", description: "CAM-Electric (07/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-07-01", description: "ACH-12669 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-08-01", description: "Base Rent (08/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-08-01", description: "CAM-Electric (08/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-08-01", description: "ACH-13006 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-09-01", description: "Base Rent (09/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-09-01", description: "CAM-Electric (09/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-09-01", description: "ACH-13344 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-10-01", description: "Base Rent (10/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-10-01", description: "CAM-Electric (10/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-10-01", description: "ACH-13684 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-11-01", description: "Base Rent (11/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-11-01", description: "CAM-Electric (11/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-11-01", description: "ACH-14073 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2025-12-01", description: "Base Rent (12/2025)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2025-12-01", description: "CAM-Electric (12/2025)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2025-12-01", description: "ACH-14438 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2026-01-01", description: "Base Rent (01/2026)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2026-01-01", description: "CAM-Electric (01/2026)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2026-01-05", description: "ACH-WEB Online Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2026-02-01", description: "Base Rent (02/2026)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2026-02-01", description: "CAM-Electric (02/2026)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2026-02-01", description: "ACH-15219 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
  { date: "2026-03-01", description: "Base Rent (03/2026)", unit: "A-102", charge: 4680, payment: 0, balance: 4680, type: "charge" },
  { date: "2026-03-01", description: "CAM-Electric (03/2026)", unit: "A-102", charge: 420, payment: 0, balance: 5100, type: "charge" },
  { date: "2026-03-01", description: "ACH-15601 Pre-Authorized Payment", unit: "A-102", charge: 0, payment: 5100, balance: 0, type: "payment" },
];

// Monthly revenue trend data (derived from income statement structure)
export const monthlyRevenue: MonthlyRevenue[] = [
  { month: "2025-07", rent: 98450, cam: 4820, electric: 5380, lateFees: 450, total: 109100, occupancy: 82 },
  { month: "2025-08", rent: 99200, cam: 4820, electric: 5380, lateFees: 0, total: 109400, occupancy: 82 },
  { month: "2025-09", rent: 100800, cam: 4820, electric: 5380, lateFees: 225, total: 111225, occupancy: 84 },
  { month: "2025-10", rent: 102350, cam: 4820, electric: 5380, lateFees: 0, total: 112550, occupancy: 85 },
  { month: "2025-11", rent: 103100, cam: 4820, electric: 5380, lateFees: 675, total: 113975, occupancy: 85 },
  { month: "2025-12", rent: 103100, cam: 4820, electric: 5380, lateFees: 0, total: 113300, occupancy: 85 },
  { month: "2026-01", rent: 104680, cam: 4820, electric: 5380, lateFees: 0, total: 114880, occupancy: 85 },
  { month: "2026-02", rent: 104680, cam: 4820, electric: 5380, lateFees: 450, total: 115330, occupancy: 85 },
  { month: "2026-03", rent: 104680, cam: 4820, electric: 5380, lateFees: 225, total: 115105, occupancy: 85 },
];

// Helper functions
export function getBuilding(unit: string): "A" | "C" | "D" {
  if (unit.startsWith("A")) return "A";
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
    if (t.leaseType === "Office Net Lease" && !t.electricPosted && t.tenant !== "" && !t.tenant.includes("Owner")) {
      alerts.push({ type: "critical", message: `Electric not posted for March 2026`, unit: t.unit, date: "2026-03-12" });
    }

    // Past due without late fee
    if (t.pastDueAmount > 0) {
      alerts.push({ type: "critical", message: `Past due: ${formatCurrency(t.pastDueAmount)}`, unit: t.unit, date: "2026-03-12" });
    }

    // Lease expiring within 90 days
    if (t.status === "expiring_soon") {
      alerts.push({ type: "warning", message: `Lease expires ${t.leaseTo} — no renewal on file`, unit: t.unit, date: t.leaseTo });
    }
  }

  return alerts.sort((a, b) => (a.type === "critical" ? -1 : 1) - (b.type === "critical" ? -1 : 1));
}
