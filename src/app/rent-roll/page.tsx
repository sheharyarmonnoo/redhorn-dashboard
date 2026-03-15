"use client";
import { useState, useMemo } from "react";
import { tenants, formatCurrency, getStatusColor, getStatusLabel, Tenant } from "@/data/tenants";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import { Search, Filter } from "lucide-react";

export default function RentRollPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<keyof Tenant>("unit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Tenant | null>(null);

  const filtered = useMemo(() => {
    let result = [...tenants];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => t.unit.toLowerCase().includes(q) || t.tenant.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") result = result.filter(t => t.status === statusFilter);
    if (buildingFilter !== "all") result = result.filter(t => t.building === buildingFilter);

    result.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });

    return result;
  }, [search, statusFilter, buildingFilter, sortKey, sortDir]);

  function toggleSort(key: keyof Tenant) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const totalRent = filtered.reduce((s, t) => s + t.monthlyRent, 0);
  const totalSqft = filtered.reduce((s, t) => s + t.sqft, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Rent Roll</h1>
        <p className="text-gray-500 text-sm mt-1">All units as of March 2026 — Click any row for details</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search unit or tenant..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-[#141414] border border-[#262626] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#141414] border border-[#262626] rounded-lg text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="current">Current</option>
          <option value="past_due">Past Due</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="vacant">Vacant</option>
        </select>
        <select
          value={buildingFilter}
          onChange={e => setBuildingFilter(e.target.value)}
          className="px-3 py-2 bg-[#141414] border border-[#262626] rounded-lg text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">All Buildings</option>
          <option value="A">Building A</option>
          <option value="C">Building C</option>
          <option value="D">Building D</option>
        </select>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {filtered.length} units · {totalSqft.toLocaleString()} sf · {formatCurrency(totalRent)}/mo
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#262626] text-gray-500">
                {[
                  { key: "unit" as keyof Tenant, label: "Unit" },
                  { key: "tenant" as keyof Tenant, label: "Tenant" },
                  { key: "leaseType" as keyof Tenant, label: "Type" },
                  { key: "building" as keyof Tenant, label: "Bldg" },
                  { key: "sqft" as keyof Tenant, label: "Sq Ft" },
                  { key: "leaseFrom" as keyof Tenant, label: "Lease Start" },
                  { key: "leaseTo" as keyof Tenant, label: "Lease End" },
                  { key: "monthlyRent" as keyof Tenant, label: "Monthly Rent" },
                  { key: "status" as keyof Tenant, label: "Status" },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:text-white transition-colors"
                  >
                    {col.label} {sortKey === col.key && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr
                  key={t.unit}
                  onClick={() => setSelected(t)}
                  className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white">{t.unit}</td>
                  <td className="px-4 py-3 text-gray-300">{t.tenant || <span className="text-gray-600 italic">Vacant</span>}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{t.leaseType.replace("Office ", "")}</td>
                  <td className="px-4 py-3 text-gray-400">{t.building}</td>
                  <td className="px-4 py-3 text-gray-300">{t.sqft.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400">{t.leaseFrom || "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{t.leaseTo || "—"}</td>
                  <td className="px-4 py-3 text-white font-medium">{t.monthlyRent > 0 ? formatCurrency(t.monthlyRent) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${getStatusColor(t.status)} bg-opacity-20`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(t.status)}`} />
                      {getStatusLabel(t.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UnitDetailPanel tenant={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
