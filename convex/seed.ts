import { mutation } from "./_generated/server";

// Seed all tables with the existing hardcoded data.
// Run once via Convex dashboard or `npx convex run seed:seedAll`

export const seedAll = mutation({
  handler: async (ctx) => {
    // Check if already seeded
    const existing = await ctx.db.query("properties").first();
    if (existing) {
      return { status: "already_seeded" };
    }

    // ===== PROPERTIES =====
    const hollister = await ctx.db.insert("properties", {
      code: "hollister",
      name: "Hollister Business Park",
      location: "Houston, TX",
      sqft: "249K SF",
      propertyType: "industrial",
      hasData: true,
      isActive: true,
    });

    const belgold = await ctx.db.insert("properties", {
      code: "belgold",
      name: "Belgold Business Park",
      location: "Houston, TX",
      sqft: "15.7K SF",
      propertyType: "industrial",
      hasData: false,
      isActive: true,
    });

    await ctx.db.insert("properties", {
      code: "rv-ohio",
      name: "RV Park — Ohio",
      location: "Ohio",
      sqft: "~40 lots",
      propertyType: "rv_park",
      hasData: false,
      isActive: true,
    });

    // ===== TENANTS (Hollister) =====
    const tenantData = [
      { unit: "ABD", building: "A", tenant: "Trophy Windows, LLC", leaseType: "Office Gross Lease", sqft: 195812, leaseFrom: "2023-08-01", leaseTo: "2029-12-31", monthlyRent: 123714.02, monthlyElectric: 0, securityDeposit: 138302.19, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Anchor tenant. Spans ABD + C-218 + D-150 + D-155." },
      { unit: "A-85A", building: "A", tenant: "Royal A Logistics Corporation", leaseType: "Office Gross Lease", sqft: 80, leaseFrom: "2022-05-01", leaseTo: "2026-03-31", monthlyRent: 315, monthlyElectric: 0, securityDeposit: 200, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "LEASE EXPIRES MARCH 31, 2026." },
      { unit: "A-90", building: "A", tenant: "TRTP Services", leaseType: "Office Net Lease", sqft: 110, leaseFrom: "2024-10-01", leaseTo: "2027-01-31", monthlyRent: 290.20, monthlyElectric: 30, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "A-102", building: "A", tenant: "Houston Luxury Lighting LLC", leaseType: "Office Net Lease", sqft: 180, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 412, monthlyElectric: 15, securityDeposit: 400, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "A-103", building: "A", tenant: "Alliance Cargo, Inc", leaseType: "Office Gross Lease", sqft: 728, leaseFrom: "2023-08-01", leaseTo: "2026-07-14", monthlyRent: 1646.40, monthlyElectric: 0, securityDeposit: 1450, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires Jul 14, 2026." },
      { unit: "A-106", building: "A", tenant: "CNJ Holdings", leaseType: "Office Gross Lease", sqft: 208, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 548.87, monthlyElectric: 0, securityDeposit: 450, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "A-106A", building: "A", tenant: "Texas State Builders", leaseType: "Office Gross Lease", sqft: 208, leaseFrom: "2024-09-01", leaseTo: "2026-08-31", monthlyRent: 546, monthlyElectric: 0, securityDeposit: 1600, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "A-107", building: "A", tenant: "Gracious Advance Auto, LLC", leaseType: "Office Gross Lease", sqft: 208, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 450.67, monthlyElectric: 0, securityDeposit: 450.67, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "A-108", building: "A", tenant: "Clean Spec, LLC", leaseType: "Office Net Lease", sqft: 466, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 915, monthlyElectric: 30, securityDeposit: 550, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "A-111", building: "A", tenant: "Beacon Restoration and Cleaning of Houston, LLC", leaseType: "Office Net Lease", sqft: 2008, leaseFrom: "2024-06-01", leaseTo: "2026-06-30", monthlyRent: 1747, monthlyElectric: 60, securityDeposit: 1696, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires Jun 30, 2026." },
      { unit: "A-120", building: "A", tenant: "Car Care Cosmetics of Houston, Inc.", leaseType: "Office Gross Lease", sqft: 250, leaseFrom: "2023-05-01", leaseTo: "2026-04-30", monthlyRent: 277.15, monthlyElectric: 0, securityDeposit: 800, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026." },
      { unit: "C-100", building: "C", tenant: "Flavorly, LLC", leaseType: "Office Gross Lease", sqft: 5000, leaseFrom: "2023-12-01", leaseTo: "2028-12-31", monthlyRent: 3997.50, monthlyElectric: 0, securityDeposit: 3250, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-192", building: "C", tenant: "Sergio Cuellar", leaseType: "Office Net Lease", sqft: 1250, leaseFrom: "2023-05-01", leaseTo: "2026-05-31", monthlyRent: 1025, monthlyElectric: 0, securityDeposit: 1000, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires May 31, 2026." },
      { unit: "C-194", building: "C", tenant: "Mark Rendon / Design HVAC Inc.", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2026-03-01", leaseTo: "2027-02-28", monthlyRent: 1070, monthlyElectric: 0, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "New tenant as of Mar 2026." },
      { unit: "C-202", building: "C", tenant: "Elite Pool Plastering", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2023-05-01", leaseTo: "2026-04-30", monthlyRent: 1060.50, monthlyElectric: 0, securityDeposit: 950, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026." },
      { unit: "C-203", building: "C", tenant: "Fervent Designs, LLC", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2024-04-01", leaseTo: "2026-04-30", monthlyRent: 1034.25, monthlyElectric: 0, securityDeposit: 985, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026." },
      { unit: "C-205", building: "C", tenant: "Miguel Angel Bueno, Jr.", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-07-01", leaseTo: "2026-07-31", monthlyRent: 556.29, monthlyElectric: 0, securityDeposit: 530, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-206", building: "C", tenant: "Mohammad S. Imam", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 584.46, monthlyElectric: 0, securityDeposit: 530, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-207", building: "C", tenant: "Gracious Advance Auto, LLC", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 595.83, monthlyElectric: 0, securityDeposit: 595.83, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-208", building: "C", tenant: "Visual Design Blinds, LLC", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2025-04-01", leaseTo: "2026-03-31", monthlyRent: 550, monthlyElectric: 0, securityDeposit: 550, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "LEASE EXPIRES MARCH 31, 2026." },
      { unit: "C-209", building: "C", tenant: "Royal A Logistics Corporation", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2022-05-01", leaseTo: "2026-04-30", monthlyRent: 1155, monthlyElectric: 0, securityDeposit: 1100, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026." },
      { unit: "C-210", building: "C", tenant: "Chert Capital Management", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2025-05-01", leaseTo: "2026-04-30", monthlyRent: 568.75, monthlyElectric: 0, securityDeposit: 568.75, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-211", building: "C", tenant: "Emily W. Ogutu", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-06-01", leaseTo: "2026-05-31", monthlyRent: 598.50, monthlyElectric: 0, securityDeposit: 530, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-212", building: "C", tenant: "Ecofibre", leaseType: "Office Net Lease", sqft: 1800, leaseFrom: "2024-10-01", leaseTo: "2026-05-31", monthlyRent: 1650, monthlyElectric: 75, securityDeposit: 1350, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-212A", building: "C", tenant: "Hugo Ayala", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2025-09-01", leaseTo: "2026-08-31", monthlyRent: 552.08, monthlyElectric: 0, securityDeposit: 0, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-213", building: "C", tenant: "Mauricio Cruz", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "2024-03-01", leaseTo: "2027-02-28", monthlyRent: 1311, monthlyElectric: 0, securityDeposit: 1000, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-215", building: "C", tenant: "Clean Spec, LLC", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "2024-12-01", leaseTo: "2026-11-30", monthlyRent: 1590, monthlyElectric: 0, securityDeposit: 1750, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-301", building: "C", tenant: "Alexis M. Munoz & Myles Q. Jones", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "2023-03-01", leaseTo: "2026-03-31", monthlyRent: 1013.54, monthlyElectric: 0, securityDeposit: 1000, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "LEASE EXPIRES MARCH 31, 2026." },
      { unit: "C-302", building: "C", tenant: "APRR Solutions, LLC", leaseType: "Office Gross Lease", sqft: 650, leaseFrom: "2024-11-01", leaseTo: "2026-11-30", monthlyRent: 535, monthlyElectric: 0, securityDeposit: 520, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-303", building: "C", tenant: "APRR Solutions, LLC", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2024-05-01", leaseTo: "2026-04-30", monthlyRent: 520, monthlyElectric: 0, securityDeposit: 450, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Expires April 30, 2026." },
      { unit: "C-304", building: "C", tenant: "Ace Custom Fab, LLC", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2025-06-01", leaseTo: "2026-05-31", monthlyRent: 560, monthlyElectric: 0, securityDeposit: 1120, status: "expiring_soon", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-305", building: "C", tenant: "Cody R. Risner", leaseType: "Office Net Lease", sqft: 662, leaseFrom: "2025-02-01", leaseTo: "2027-01-31", monthlyRent: 551, monthlyElectric: 0, securityDeposit: 535, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-306", building: "C", tenant: "Angel Fabian Andueza", leaseType: "Office Gross Lease", sqft: 466, leaseFrom: "2025-08-01", leaseTo: "2027-07-31", monthlyRent: 500, monthlyElectric: 0, securityDeposit: 550, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-307", building: "C", tenant: "G&M Grocery Express", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2023-08-01", leaseTo: "2026-08-31", monthlyRent: 540.75, monthlyElectric: 0, securityDeposit: 500, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "C-308", building: "C", tenant: "Pierre-Louis Edriss", leaseType: "Office Gross Lease", sqft: 625, leaseFrom: "2024-09-01", leaseTo: "2026-08-31", monthlyRent: 656.25, monthlyElectric: 0, securityDeposit: 575, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "" },
      { unit: "D-154", building: "D", tenant: "Wortham Madison Property, LLC", leaseType: "Office Net Lease", sqft: 4525, leaseFrom: "2024-08-01", leaseTo: "2028-12-31", monthlyRent: 3355.63, monthlyElectric: 200, securityDeposit: 2015, status: "current", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "2026-03-01", notes: "Combined D-154 + D-160." },
      // Vacant units
      { unit: "C-101", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
      { unit: "C-102", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
      { unit: "C-103", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
      { unit: "C-200", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 2500, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Splittable — 2,500 + 1,250 SF." },
      { unit: "C-200A", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
      { unit: "C-201", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1250, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
      { unit: "C-204", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 3750, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant. Large unit — splittable." },
      { unit: "C-214", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
      { unit: "C-217", building: "C", tenant: "", leaseType: "Office Gross Lease", sqft: 1800, leaseFrom: "", leaseTo: "", monthlyRent: 0, monthlyElectric: 0, securityDeposit: 0, status: "vacant", pastDueAmount: 0, electricPosted: true, lastPaymentDate: "", notes: "Vacant." },
    ];

    for (const t of tenantData) {
      await ctx.db.insert("tenants", {
        propertyId: hollister,
        ...t,
        isLatest: true,
        snapshotDate: "2026-03-23",
      });
    }

    // ===== MONTHLY REVENUE (Hollister) =====
    const revenueData = [
      { month: "2025-07", rent: 138200, cam: 9800, electric: 725, lateFees: 300, total: 149025, occupancy: 90 },
      { month: "2025-08", rent: 140100, cam: 9800, electric: 725, lateFees: 0, total: 150625, occupancy: 91 },
      { month: "2025-09", rent: 143500, cam: 10200, electric: 725, lateFees: 450, total: 154875, occupancy: 91 },
      { month: "2025-10", rent: 145800, cam: 10200, electric: 725, lateFees: 0, total: 156725, occupancy: 92 },
      { month: "2025-11", rent: 147200, cam: 10400, electric: 725, lateFees: 600, total: 158925, occupancy: 92 },
      { month: "2025-12", rent: 148100, cam: 10400, electric: 725, lateFees: 0, total: 159225, occupancy: 93 },
      { month: "2026-01", rent: 155400, cam: 11200, electric: 725, lateFees: 0, total: 167325, occupancy: 93 },
      { month: "2026-02", rent: 155800, cam: 11400, electric: 725, lateFees: 575, total: 168500, occupancy: 93 },
      { month: "2026-03", rent: 148801, cam: 11371, electric: 725, lateFees: 411, total: 160582, occupancy: 92.9 },
    ];

    for (const r of revenueData) {
      await ctx.db.insert("monthly_revenue", { propertyId: hollister, ...r });
    }

    // ===== ACTION ITEMS =====
    const actionItems = [
      { text: "Follow up with PM — late fees not auto-posted for $40K past due", column: "todo", priority: "high", assignedTo: "Max", createdAt: "2026-03-12" },
      { text: "C-212 & C-305 — electric charges not posted for March", column: "todo", priority: "high", unit: "C-212", assignedTo: "Max", createdAt: "2026-03-12" },
      { text: "A-90 holdover — lease expired Feb 28. Escalate to legal", column: "todo", priority: "high", unit: "A-90", assignedTo: "Ori", createdAt: "2026-03-10" },
      { text: "C-207 default letter sent 03/10 — verify tenant response", column: "in_progress", priority: "medium", unit: "C-207", assignedTo: "Max", createdAt: "2026-03-10" },
      { text: "A-106A lease expires Jun 30 — initiate renewal with QuickShip", column: "todo", priority: "medium", unit: "A-106A", assignedTo: "Ori", createdAt: "2026-03-08" },
      { text: "Request Yardi API access from PM company", column: "done", priority: "low", assignedTo: "Max", createdAt: "2026-03-01" },
      { text: "Verify Feb electric billing for all Net Lease tenants", column: "done", priority: "medium", assignedTo: "Max", createdAt: "2026-02-15" },
    ];

    for (const item of actionItems) {
      await ctx.db.insert("action_items", item);
    }

    // ===== DEALS =====
    const now = new Date().toISOString();
    const deals = [
      { name: "Westheimer Office Complex", address: "4500 Westheimer Rd", city: "Houston", state: "TX", propertyType: "Office/Warehouse", sqft: 48000, units: 12, askingPrice: 3200000, pricePerSF: 67, capRate: 7.8, stage: "underwriting", source: "Broker — CBRE Houston", assignedTo: "Max", contacts: [{ name: "James Rodriguez", role: "Listing Broker", email: "jrodriguez@cbre.com", phone: "713-555-0142" }], notes: [{ id: "n1", text: "Drove by — good condition, ~75% occupancy.", author: "Ori", createdAt: "2026-03-15T10:30:00Z" }], emails: [], createdAt: "2026-03-10T08:00:00Z", updatedAt: "2026-03-15T10:30:00Z" },
      { name: "Beltway Industrial Park", address: "12200 Beltway 8 S", city: "Houston", state: "TX", propertyType: "Industrial", sqft: 85000, units: 8, askingPrice: 5800000, pricePerSF: 68, capRate: 7.2, stage: "outreach", source: "MailChimp Campaign", assignedTo: "Max", contacts: [{ name: "David Chen", role: "Owner", email: "dchen@beltway-industrial.com" }], notes: [{ id: "n3", text: "Owner responded — interested in selling in 6 months.", author: "Max", createdAt: "2026-03-18T11:00:00Z" }], emails: [], createdAt: "2026-03-17T08:00:00Z", updatedAt: "2026-03-18T11:00:00Z" },
      { name: "Cypress Creek Flex Space", address: "9800 Cypress Creek Pkwy", city: "Houston", state: "TX", propertyType: "Flex/Office", sqft: 32000, units: 16, askingPrice: 2100000, pricePerSF: 66, capRate: 8.1, stage: "loi", source: "Cold Call", assignedTo: "Ori", contacts: [{ name: "Patricia Nguyen", role: "Owner", email: "pnguyen@cypressproperties.com" }], notes: [{ id: "n4", text: "LOI submitted at $1.95M.", author: "Ori", createdAt: "2026-03-17T15:00:00Z" }], emails: [], createdAt: "2026-03-08T08:00:00Z", updatedAt: "2026-03-17T15:00:00Z" },
      { name: "FM 1960 Retail Strip", address: "15400 FM 1960 Rd W", city: "Houston", state: "TX", propertyType: "Retail", sqft: 18000, units: 6, askingPrice: 1400000, pricePerSF: 78, capRate: 6.5, stage: "dead", source: "Broker — Marcus & Millichap", assignedTo: "Max", contacts: [{ name: "Tom Bradley", role: "Listing Broker", email: "tbradley@marcusmillichap.com" }], notes: [{ id: "n7", text: "Passed — cap rate too low.", author: "Max", createdAt: "2026-03-05T10:00:00Z" }], emails: [], createdAt: "2026-02-20T08:00:00Z", updatedAt: "2026-03-05T10:00:00Z" },
      { name: "Tomball Warehouse", address: "28100 Tomball Pkwy", city: "Tomball", state: "TX", propertyType: "Warehouse", sqft: 22000, units: 4, askingPrice: 1650000, pricePerSF: 75, capRate: 7.5, stage: "lead", source: "Phone Call", assignedTo: "Ori", contacts: [{ name: "Rick Hernandez", role: "Owner", email: "rhernandez@tomballprops.com" }], notes: [{ id: "n8", text: "Rick thinking about selling. Not listed.", author: "Ori", createdAt: "2026-03-19T08:30:00Z" }], emails: [], createdAt: "2026-03-19T08:30:00Z", updatedAt: "2026-03-19T08:30:00Z" },
    ];

    for (const d of deals) {
      await ctx.db.insert("deals", d);
    }

    // ===== ACTIVITY LOG =====
    const activities = [
      { type: "task_added", description: "Added task: Follow up with PM — late fees not auto-posted", user: "System", createdAt: "2026-03-12T08:00:00Z" },
      { type: "alert_created", description: "Alert: C-212 electric not posted for March", user: "System", unit: "C-212", createdAt: "2026-03-12T08:05:00Z" },
      { type: "status_change", description: "A-90 delinquency escalated: Past Due → Default Notice", user: "Ori", unit: "A-90", createdAt: "2026-03-10T14:30:00Z" },
      { type: "deal_update", description: "Cypress Creek Flex Space moved to LOI stage", user: "Ori", dealId: "deal-3", createdAt: "2026-03-17T15:00:00Z" },
      { type: "sync", description: "Yardi sync completed — Rent Roll updated (52 units)", user: "System", createdAt: "2026-03-12T08:00:00Z" },
      { type: "deal_update", description: "New deal: Tomball Warehouse — $1.65M, 22K SF", user: "Ori", dealId: "deal-5", createdAt: "2026-03-19T08:30:00Z" },
      { type: "deal_update", description: "Deal killed: FM 1960 Retail Strip — cap rate too low", user: "Max", dealId: "deal-4", createdAt: "2026-03-05T10:00:00Z" },
    ];

    for (const a of activities) {
      await ctx.db.insert("activity_log", a);
    }

    return {
      status: "seeded",
      properties: 3,
      tenants: tenantData.length,
      revenue_months: revenueData.length,
      action_items: actionItems.length,
      deals: deals.length,
      activities: activities.length,
    };
  },
});
