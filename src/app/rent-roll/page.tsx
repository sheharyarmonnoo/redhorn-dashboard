"use client";

import { useState, useMemo, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, ColDef } from "ag-grid-community";
import { tenants, Tenant, formatCurrency, getStatusLabel } from "@/data/tenants";
import PageHeader from "@/components/PageHeader";
import Drawer from "@/components/Drawer";

ModuleRegistry.registerModules([AllCommunityModule]);

export default function RentRollPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [search, setSearch] = useState("");

  const totalUnits = tenants.length;
  const totalSF = useMemo(() => tenants.reduce((s, t) => s + t.sqft, 0), []);
  const totalMonthlyRent = useMemo(() => tenants.reduce((s, t) => s + t.monthlyRent, 0), []);
  const occupiedCount = useMemo(() => tenants.filter((t) => t.status !== "vacant").length, []);

  const columnDefs = useMemo<ColDef<Tenant>[]>(
    () => [
      { headerName: "Unit", field: "unit", width: 90, sort: "asc" as const },
      { headerName: "Building", field: "building", width: 85 },
      {
        headerName: "Tenant",
        field: "tenant",
        flex: 1,
        minWidth: 160,
        valueFormatter: (params: { value: string }) => params.value || "VACANT",
      },
      {
        headerName: "SF",
        field: "sqft",
        width: 85,
        valueFormatter: (params: { value: number }) => params.value.toLocaleString(),
      },
      {
        headerName: "Lease Type",
        field: "leaseType",
        width: 140,
        valueFormatter: (params: { value: string }) => params.value.replace("Office ", ""),
      },
      {
        headerName: "Monthly Rent",
        field: "monthlyRent",
        width: 120,
        valueFormatter: (params: { value: number }) => (params.value > 0 ? formatCurrency(params.value) : "—"),
      },
      {
        headerName: "Electric",
        field: "monthlyElectric",
        width: 100,
        valueFormatter: (params: { value: number }) => (params.value > 0 ? formatCurrency(params.value) : "—"),
      },
      {
        headerName: "Status",
        field: "status",
        width: 110,
        cellRenderer: (params: { value: Tenant["status"] }) => {
          const colors: Record<string, string> = {
            current: "#16a34a",
            past_due: "#dc2626",
            locked_out: "#d97706",
            vacant: "#71717a",
            expiring_soon: "#2563eb",
          };
          const color = colors[params.value] || "#71717a";
          const label = getStatusLabel(params.value);
          return `<span style="display:inline-flex;align-items:center;gap:5px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color}"></span><span style="font-size:12px">${label}</span></span>`;
        },
      },
      {
        headerName: "Lease End",
        field: "leaseTo",
        width: 110,
        valueFormatter: (params: { value: string }) => params.value || "—",
      },
    ],
    []
  );

  const filteredData = useMemo(() => {
    if (!search) return tenants;
    const q = search.toLowerCase();
    return tenants.filter(
      (t) =>
        t.unit.toLowerCase().includes(q) ||
        t.tenant.toLowerCase().includes(q) ||
        t.building.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
    );
  }, [search]);

  const onRowClicked = useCallback((event: { data: Tenant | undefined }) => {
    if (event.data) {
      setSelected(event.data);
      setDrawerOpen(true);
    }
  }, []);

  const exportCSV = useCallback(() => {
    const headers = ["Unit", "Building", "Tenant", "SF", "Lease Type", "Monthly Rent", "Electric", "Status", "Lease Start", "Lease End"];
    const csvRows = [headers.join(",")];
    for (const t of tenants) {
      csvRows.push(
        [
          t.unit,
          t.building,
          `"${t.tenant || "VACANT"}"`,
          t.sqft,
          t.leaseType,
          t.monthlyRent,
          t.monthlyElectric,
          t.status,
          t.leaseFrom,
          t.leaseTo,
        ].join(",")
      );
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rent-roll-hollister.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <>
      <PageHeader title="Rent Roll" subtitle={`${totalUnits} units · ${totalSF.toLocaleString()} SF · ${formatCurrency(totalMonthlyRent)}/mo`}>
        <input
          type="text"
          placeholder="Search units..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-[#e4e4e7] rounded px-3 py-1.5 bg-white text-[#18181b] w-48"
        />
        <button
          onClick={exportCSV}
          className="text-sm border border-[#e4e4e7] rounded px-3 py-1.5 bg-white text-[#18181b] hover:bg-[#f4f4f5] transition-colors"
        >
          Export CSV
        </button>
      </PageHeader>

      {/* Summary row */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Total Units</div>
          <div className="text-lg font-semibold mt-0.5">{totalUnits}</div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Occupied</div>
          <div className="text-lg font-semibold mt-0.5">{occupiedCount}</div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Total SF</div>
          <div className="text-lg font-semibold mt-0.5">{totalSF.toLocaleString()}</div>
        </div>
        <div className="border border-[#e4e4e7] bg-white px-4 py-3 rounded">
          <div className="text-xs text-[#71717a] uppercase tracking-wide font-medium">Monthly Rent</div>
          <div className="text-lg font-semibold mt-0.5">{formatCurrency(totalMonthlyRent)}</div>
        </div>
      </div>

      {/* AG Grid */}
      <div className="border border-[#e4e4e7] bg-white rounded overflow-auto">
        <div className="ag-theme-alpine" style={{ width: "100%", minWidth: 600 }}>
          <AgGridReact<Tenant>
            rowData={filteredData}
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
        title={selected ? `${selected.unit}${selected.tenant ? ` — ${selected.tenant}` : " — VACANT"}` : ""}
        subtitle={selected ? `Building ${selected.building} · ${selected.sqft.toLocaleString()} SF` : ""}
      >
        {selected && (
          <div className="space-y-5">
            {/* Status badge */}
            <div>
              <span
                className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded ${
                  selected.status === "current"
                    ? "bg-green-100 text-green-700"
                    : selected.status === "past_due"
                    ? "bg-red-100 text-red-700"
                    : selected.status === "vacant"
                    ? "bg-zinc-100 text-zinc-600"
                    : selected.status === "expiring_soon"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {getStatusLabel(selected.status)}
              </span>
            </div>

            {/* Tenant Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[#71717a] text-xs block">Lease Type</span>
                <span className="font-medium">{selected.leaseType}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Square Feet</span>
                <span className="font-medium">{selected.sqft.toLocaleString()} SF</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Rent</span>
                <span className="font-medium">{selected.monthlyRent > 0 ? formatCurrency(selected.monthlyRent) : "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Monthly Electric</span>
                <span className="font-medium">{selected.monthlyElectric > 0 ? formatCurrency(selected.monthlyElectric) : "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease Start</span>
                <span className="font-medium">{selected.leaseFrom || "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Lease End</span>
                <span className="font-medium">{selected.leaseTo || "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Security Deposit</span>
                <span className="font-medium">{selected.securityDeposit > 0 ? formatCurrency(selected.securityDeposit) : "—"}</span>
              </div>
              <div>
                <span className="text-[#71717a] text-xs block">Last Payment</span>
                <span className="font-medium">{selected.lastPaymentDate || "—"}</span>
              </div>
              {selected.pastDueAmount > 0 && (
                <>
                  <div>
                    <span className="text-[#71717a] text-xs block">Past Due</span>
                    <span className="font-semibold text-red-600">{formatCurrency(selected.pastDueAmount)}</span>
                  </div>
                  <div>
                    <span className="text-[#71717a] text-xs block">Delinquency Stage</span>
                    <span className="font-medium">
                      {(selected.delinquencyStage || "past_due").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                </>
              )}
              {selected.amps && (
                <div>
                  <span className="text-[#71717a] text-xs block">Electrical</span>
                  <span className="font-medium">{selected.amps}A</span>
                </div>
              )}
              {selected.splittable && (
                <div>
                  <span className="text-[#71717a] text-xs block">Splittable</span>
                  <span className="font-medium">{selected.splitDetail || "Yes"}</span>
                </div>
              )}
            </div>

            {selected.notes && (
              <div>
                <span className="text-[#71717a] text-xs block mb-1">Notes</span>
                <p className="text-sm bg-[#f4f4f5] px-3 py-2 rounded">{selected.notes}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
