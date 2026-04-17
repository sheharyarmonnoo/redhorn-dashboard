import * as XLSX from "xlsx";
import { tenants, ledgerA102, monthlyRevenue, getAlerts, formatCurrency } from "./tenants";

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function exportRentRoll() {
  const data = tenants.map(t => ({
    Unit: t.unit,
    Building: t.building,
    Tenant: t.tenant || "(Vacant)",
    "Lease Type": t.leaseType,
    "Sq Ft": t.sqft,
    "Lease Start": t.leaseFrom || "",
    "Lease End": t.leaseTo || "",
    "Monthly Rent": t.monthlyRent,
    "Monthly Electric": t.monthlyElectric,
    "Security Deposit": t.securityDeposit,
    Status: t.status.replace("_", " ").toUpperCase(),
    "Past Due": t.pastDueAmount,
    "Electric Posted": t.electricPosted ? "Yes" : "No",
    "Last Payment": t.lastPaymentDate || "",
    Notes: t.notes,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 8 }, { wch: 8 }, { wch: 28 }, { wch: 16 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Rent Roll");
  downloadWorkbook(wb, `RentRoll_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportLeaseLedger() {
  const data = ledgerA102.map(e => ({
    Date: e.date,
    Description: e.description,
    Unit: e.unit,
    Charge: e.charge || "",
    Payment: e.payment || "",
    Balance: e.balance,
    Type: e.type,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 36 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Lease Ledger A-102");
  downloadWorkbook(wb, `LeaseLedger_A102_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportIncomeStatement() {
  const data = monthlyRevenue.map(m => ({
    Month: m.month,
    "Base Rent": m.rent,
    "CAM Recovery": m.cam,
    "Electric Recovery": m.electric,
    "Late Fees": m.lateFees,
    "Total Revenue": m.total,
    "Occupancy %": m.occupancy,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
  downloadWorkbook(wb, `IncomeStatement_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportAlerts() {
  const alerts = getAlerts();
  const data = alerts.map(a => ({
    Type: a.type.toUpperCase(),
    Unit: a.unit,
    Message: a.message,
    Date: a.date,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 8 }, { wch: 50 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Active Alerts");
  downloadWorkbook(wb, `Alerts_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportFullPackage() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Rent Roll
  const rentData = tenants.map(t => ({
    Unit: t.unit, Building: t.building, Tenant: t.tenant || "(Vacant)",
    "Lease Type": t.leaseType, "Sq Ft": t.sqft,
    "Lease Start": t.leaseFrom, "Lease End": t.leaseTo,
    "Monthly Rent": t.monthlyRent, "Monthly Electric": t.monthlyElectric,
    Status: t.status.replace("_", " ").toUpperCase(),
    "Past Due": t.pastDueAmount, "Electric Posted": t.electricPosted ? "Yes" : "No",
    Notes: t.notes,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rentData), "Rent Roll");

  // Sheet 2: Lease Ledger
  const ledgerData = ledgerA102.map(e => ({
    Date: e.date, Description: e.description, Unit: e.unit,
    Charge: e.charge || "", Payment: e.payment || "", Balance: e.balance,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledgerData), "Lease Ledger A-102");

  // Sheet 3: Income
  const incData = monthlyRevenue.map(m => ({
    Month: m.month, "Base Rent": m.rent, "CAM": m.cam,
    "Electric": m.electric, "Late Fees": m.lateFees, "Total": m.total,
    "Occupancy %": m.occupancy,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incData), "Income Statement");

  // Sheet 4: Alerts
  const alertData = getAlerts().map(a => ({
    Type: a.type.toUpperCase(), Unit: a.unit, Message: a.message, Date: a.date,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alertData), "Active Alerts");

  downloadWorkbook(wb, `Redhorn_FullExport_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
