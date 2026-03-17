"use client";

import { useState, useMemo, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";
import { tenants, Tenant, formatCurrency } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import Drawer from "@/components/Drawer";

ModuleRegistry.registerModules([AllCommunityModule]);

interface PostingRow {
  unit: string;
  tenant: string;
  building: string;
  monthlyElectric: number;
  monthlyCAM: number;
  posted: boolean;
  lastPostedDate: string;
  tenantData: Tenant;
}

export default function PostingPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<PostingRow | null>(null);
  const [buildingFilter, setBuildingFilter] = useState<string>("All");
  const [localPosted, setLocalPosted] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("posting-status");
      if (saved) return JSON.parse(saved);
    }
    return {};
  });

  const netLeaseTenants = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.leaseType === "Office Net Lease" &&
          t.status !== "vacant" &&
          !t.tenant.includes("Owner") &&
          t.monthlyElectric > 0
      ),
    []
  );

  const rows: PostingRow[] = useMemo(
    () =>
      netLeaseTenants
        .filter((t) => buildingFilter === "All" || t.building === buildingFilter)
        .map((t) => ({
          unit: t.unit,
          tenant: t.tenant,
          building: t.building,
          monthlyElectric: t.monthlyElectric,
          monthlyCAM: t.monthlyElectric, // CAM estimate = electric for this property
          posted: localPosted[t.unit] !== undefined ? localPosted[t.unit] : t.electricPosted,
          lastPostedDate: t.electricPosted ? "2026-03-01" : "—",
          tenantData: t,
        })),
    [netLeaseTenants, buildingFilter, localPosted]
  );

  const postedCount = rows.filter((r) => r.posted).length;
  const totalCount = rows.length;
  const missingAmount = rows.filter((r) => !r.posted).reduce((sum, r) => sum + r.monthlyElectric, 0);

  const columnDefs = useMemo<ColDef<PostingRow>[]>(
    () => [
      { headerName: "Unit", field: "unit", width: 90 },
      { headerName: "Tenant", field: "tenant", flex: 1, minWidth: 160 },
      { headerName: "Building", field: "building", width: 90 },
      {
        headerName: "Monthly Electric",
        field: "monthlyElectric",
        width: 140,
        valueFormatter: (params: { value: number }) => formatCurrency(params.value),
      },
      {
        headerName: "Monthly CAM",
        field: "monthlyCAM",
        width: 120,
        valueFormatter: (params: { value: number }) => formatCurrency(params.value),
      },
      {
        headerName: "Posted",
        field: "posted",
        width: 90,
        cellRenderer: (params: { value: boolean }) =>
          params.value
            ? '<span style="color:#16a34a;font-weight:600">Yes</span>'
            : '<span style="color:#dc2626;font-weight:600">No</span>',
      },
      { headerName: "Last Posted", field: "lastPostedDate", width: 120 },
    ],
    []
  );

  const onRowClicked = useCallback((event: { data: PostingRow | undefined }) => {
    if (event.data) {
      setSelected(event.data);
      setDrawerOpen(true);
    }
  }, []);

  const togglePosted = useCallback(
    (unit: string) => {
      const current = localPosted[unit] !== undefined ? localPosted[unit] : (tenants.find((t) => t.unit === unit)?.electricPosted ?? false);
      const updated = { ...localPosted, [unit]: !current };
      setLocalPosted(updated);
      localStorage.setItem("posting-status", JSON.stringify(updated));
      if (selected && selected.unit === unit) {
        setSelected({ ...selected, posted: !current });
      }
    },
    [localPosted, selected]
  );

  return (
    <>
      <PageHeader title="Posting Tracker" subtitle="Net lease electric and CAM charge posting status">
        <select
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
          className="text-sm border border-[#e4e4e7] rounded px-3 py-1.5 bg-white text-[#18181b]"
        >
          <option value="All">All Buildings</option>
          <option value="A">Building A</option>
          <option value="C">Building C</option>
          <option value="D">Building D</option>
        </select>
      </PageHeader>

      {/* Summary */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Posted</div>
          <div className="text-lg font-semibold text-[#18181b] mt-0.5">
            {postedCount} of {totalCount}
          </div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Missing Amount</div>
          <div className="text-lg font-semibold text-red-600 mt-0.5">{formatCurrency(missingAmount)}</div>
        </div>
      </div>

      {/* AG Grid */}
      <div className="border border-[#e4e4e7] bg-white rounded overflow-auto">
        <div className="ag-theme-alpine" style={{ width: "100%", minWidth: 600 }}>
          <AgGridReact<PostingRow>
            rowData={rows}
            columnDefs={columnDefs}
            domLayout="autoHeight"
            onRowClicked={onRowClicked}
            suppressCellFocus
            getRowId={(params) => params.data.unit}
          />
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `${selected.unit} — Posting Detail` : ""}
        subtitle={selected ? `${selected.tenant} · Building ${selected.building}` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Electric</span>
                <span className="font-semibold">{formatCurrency(selected.monthlyElectric)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly CAM</span>
                <span className="font-semibold">{formatCurrency(selected.monthlyCAM)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Posted Status</span>
                <span className={`font-semibold ${selected.posted ? "text-green-600" : "text-red-600"}`}>
                  {selected.posted ? "Posted" : "Not Posted"}
                </span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Last Posted</span>
                <span className="font-semibold">{selected.lastPostedDate}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Rent</span>
                <span className="font-medium">{formatCurrency(selected.tenantData.monthlyRent)}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease End</span>
                <span className="font-medium">{selected.tenantData.leaseTo}</span>
              </div>
            </div>

            {/* Posting history (mock) */}
            <div>
              <span className="text-[#71717a] text-xs block mb-2">Recent Posting History</span>
              <div className="space-y-1 text-sm">
                {["2026-02", "2026-01", "2025-12", "2025-11", "2025-10"].map((month) => (
                  <div key={month} className="flex items-center justify-between px-3 py-1.5 bg-[#f4f4f5] rounded">
                    <span className="text-[#71717a]">{month}</span>
                    <span className="text-green-600 text-xs font-medium">Posted</span>
                  </div>
                ))}
                {!selected.posted && (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-red-50 rounded">
                    <span className="text-[#71717a]">2026-03</span>
                    <span className="text-red-600 text-xs font-medium">Not Posted</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => togglePosted(selected.unit)}
              className="w-full py-2 bg-[#18181b] text-white text-sm font-medium rounded hover:bg-zinc-800 transition-colors"
            >
              {selected.posted ? "Mark as Not Posted" : "Mark as Posted"}
            </button>
          </div>
        )}
      </Drawer>
    </>
  );
}
