// Unit records — physical attributes that persist independent of tenant.
// Ori requested splitting tenant (financial/lease) from unit (physical/maintenance).

export interface UnitRecord {
  unit: string;
  building: "A" | "C" | "D";
  sqft: number;
  // Physical attributes
  amps: number;              // electrical capacity (200 or 400)
  hasBathroom: boolean;
  hasOffice: boolean;
  hasLoadingDock: boolean;
  ceilingHeight: number;     // feet
  hvacType: string;
  // Condition & readiness
  makeReady: boolean;
  splittable: boolean;
  splitDetail?: string;
  lastRenovation?: string;   // date
  // Maintenance history (persists after tenant moves out)
  maintenanceLog: MaintenanceEntry[];
}

export interface MaintenanceEntry {
  id: string;
  date: string;
  type: "repair" | "replacement" | "inspection" | "renovation" | "hvac" | "plumbing" | "electrical" | "roof" | "other";
  description: string;
  cost?: number;
  vendor?: string;
  status: "completed" | "pending" | "scheduled";
}

// Seed unit records for Hollister Business Park
export const unitRecords: UnitRecord[] = [
  // Building A
  { unit: "A-85", building: "A", sqft: 4200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 14, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [
    { id: "m1", date: "2025-11-15", type: "hvac", description: "HVAC filter replacement", cost: 280, vendor: "Cool Air Houston", status: "completed" },
  ]},
  { unit: "A-85A", building: "A", sqft: 2100, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 14, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-90", building: "A", sqft: 6800, amps: 400, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 18, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [
    { id: "m2", date: "2025-06-20", type: "roof", description: "Roof leak patched — section above bay door", cost: 1200, vendor: "Texas Roof Pros", status: "completed" },
    { id: "m3", date: "2025-09-10", type: "electrical", description: "400A panel inspection", cost: 450, vendor: "Lone Star Electric Co", status: "completed" },
  ]},
  { unit: "A-95", building: "A", sqft: 3800, amps: 200, hasBathroom: true, hasOffice: false, hasLoadingDock: false, ceilingHeight: 16, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-102", building: "A", sqft: 5200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 16, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [
    { id: "m4", date: "2025-12-01", type: "plumbing", description: "Water heater replaced", cost: 1800, vendor: "ABC Plumbing", status: "completed" },
  ]},
  { unit: "A-103", building: "A", sqft: 3100, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 14, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-106", building: "A", sqft: 2800, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-106A", building: "A", sqft: 1400, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-107", building: "A", sqft: 3600, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 14, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-108", building: "A", sqft: 4100, amps: 200, hasBathroom: true, hasOffice: false, hasLoadingDock: true, ceilingHeight: 16, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-110", building: "A", sqft: 2900, amps: 200, hasBathroom: true, hasOffice: false, hasLoadingDock: false, ceilingHeight: 16, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-111", building: "A", sqft: 5500, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 18, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [
    { id: "m5", date: "2026-01-20", type: "inspection", description: "Fire extinguisher & sprinkler inspection", cost: 350, vendor: "FireSafe TX", status: "completed" },
  ]},
  { unit: "A-112", building: "A", sqft: 2400, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 14, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "A-120", building: "A", sqft: 1800, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },

  // Building C — 2nd floor
  { unit: "C-100", building: "C", sqft: 3200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-192", building: "C", sqft: 7200, amps: 400, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 20, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [
    { id: "m6", date: "2025-08-15", type: "electrical", description: "400A service upgrade completed", cost: 3200, vendor: "Lone Star Electric Co", status: "completed" },
  ]},
  { unit: "C-194", building: "C", sqft: 2600, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-202", building: "C", sqft: 1500, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-203", building: "C", sqft: 1200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-205", building: "C", sqft: 1800, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-206", building: "C", sqft: 1600, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-207", building: "C", sqft: 1400, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-208", building: "C", sqft: 1100, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-209", building: "C", sqft: 1000, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-210", building: "C", sqft: 1300, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-211", building: "C", sqft: 900, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-212", building: "C", sqft: 4800, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-212A", building: "C", sqft: 600, amps: 200, hasBathroom: false, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-213", building: "C", sqft: 1100, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-215", building: "C", sqft: 800, amps: 200, hasBathroom: false, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-216", building: "C", sqft: 3800, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-218", building: "C", sqft: 2000, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },

  // Building C — 3rd floor
  { unit: "C-301", building: "C", sqft: 2200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-302", building: "C", sqft: 1800, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-303", building: "C", sqft: 1500, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-304", building: "C", sqft: 1600, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-305", building: "C", sqft: 3500, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-306", building: "C", sqft: 1200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-307", building: "C", sqft: 1000, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-308", building: "C", sqft: 1400, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },

  // Vacant C units
  { unit: "C-101", building: "C", sqft: 2800, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [
    { id: "m7", date: "2025-09-30", type: "renovation", description: "Tenant move-out — walls patched, flooring cleaned", cost: 2400, vendor: "In-house", status: "completed" },
  ]},
  { unit: "C-102", building: "C", sqft: 2400, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Central", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-103", building: "C", sqft: 2200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Central", makeReady: true, splittable: false, maintenanceLog: [
    { id: "m8", date: "2025-07-15", type: "renovation", description: "Make-ready in progress — new paint, carpet, HVAC service", cost: 4500, vendor: "In-house", status: "pending" },
  ]},
  { unit: "C-200", building: "C", sqft: 3700, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 12, hvacType: "Central", makeReady: true, splittable: true, splitDetail: "2,500 + 1,250 SF", maintenanceLog: [] },
  { unit: "C-201", building: "C", sqft: 1500, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-204", building: "C", sqft: 1200, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-214", building: "C", sqft: 900, amps: 200, hasBathroom: false, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "C-217", building: "C", sqft: 1400, amps: 200, hasBathroom: true, hasOffice: true, hasLoadingDock: false, ceilingHeight: 10, hvacType: "Split System", makeReady: false, splittable: false, maintenanceLog: [] },

  // Building D
  { unit: "D-150", building: "D", sqft: 8000, amps: 400, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 22, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "D-154", building: "D", sqft: 12000, amps: 400, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 24, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [
    { id: "m9", date: "2026-02-10", type: "hvac", description: "Industrial HVAC compressor serviced", cost: 1600, vendor: "Cool Air Houston", status: "completed" },
  ]},
  { unit: "D-155", building: "D", sqft: 6000, amps: 400, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 22, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [] },
  { unit: "D-160", building: "D", sqft: 8500, amps: 400, hasBathroom: true, hasOffice: true, hasLoadingDock: true, ceilingHeight: 24, hvacType: "Industrial", makeReady: false, splittable: false, maintenanceLog: [] },
];

export function getUnitRecord(unit: string): UnitRecord | undefined {
  return unitRecords.find(u => u.unit === unit);
}
