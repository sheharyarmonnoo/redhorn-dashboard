"use client";
import { useState, useMemo } from "react";
import { tenants, formatCurrency, getStatusColor, getStatusLabel, Tenant } from "@/data/tenants";
import UnitDetailPanel from "@/components/UnitDetailPanel";
import { Search } from "lucide-react";

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
      if (typeof aVal === "string" && typeof bVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
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
        <h1 className="text-2xl font-bold text-gray-900">Rent Roll</h1>
        <p className="text-gray-500 text-sm mt-1">All units as of March 2026 — Click any row for details</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search unit or tenant..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7] w-64" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-[#4f6ef7]">
          <option value="all">All Statuses</option>
          <option value="current">Current</option>
          <option value="past_due">Past Due</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="vacant">Vacant</option>
        </select>
        <select value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-[#4f6ef7]">
          <option value="all">All Buildings</option>
          <option value="A">Building A</option>
          <option value="C">Building C</option>
          <option value="D">Building D</option>
        </select>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {filtered.length} units · {totalSqft.toLocaleString()} sf · {formatCurrency(totalRent)}/mo
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-500">
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
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors text-xs uppercase tracking-wider">
                    {col.label} {sortKey === col.key && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.unit} onClick={() => setSelected(t)}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.unit}</td>
                  <td className="px-4 py-3 text-gray-700">{t.tenant || <span className="text-gray-400 italic">Vacant</span>}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{t.leaseType.replace("Office ", "")}</td>
                  <td className="px-4 py-3 text-gray-500">{t.building}</td>
                  <td className="px-4 py-3 text-gray-700">{t.sqft.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{t.leaseFrom || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{t.leaseTo || "—"}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{t.monthlyRent > 0 ? formatCurrency(t.monthlyRent) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === "current" ? "bg-emerald-50 text-emerald-700" :
                      t.status === "past_due" ? "bg-red-50 text-red-700" :
                      t.status === "expiring_soon" ? "bg-blue-50 text-blue-700" :
                      t.status === "vacant" ? "bg-gray-100 text-gray-500" :
                      "bg-amber-50 text-amber-700"
                    }`}>
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
