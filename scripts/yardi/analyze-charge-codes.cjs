const XLSX = require('xlsx');

const files = [
  { name: 'Hollister', file: 'C:/Users/SheharyarMonnoo/OneDrive/Code/redhorn-dashboard/scripts/yardi/downloads/2026-04/hol-receivable-detail.xlsx' },
  { name: 'Belgold', file: 'C:/Users/SheharyarMonnoo/OneDrive/Code/redhorn-dashboard/scripts/yardi/downloads/2026-04/bel-receivable-detail.xlsx' },
];

const allRows = []; // {property, tenant, leaseId, desc}

for (const { name, file } of files) {
  const wb = XLSX.readFile(file);
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    let currentTenant = '';
    let currentLeaseId = '';
    let inTransactionTable = false;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const cells = r.map((c) => String(c).trim());

      // Detect Lease Id row: cell with "Lease Id" label followed by id value
      const leaseIdIdx = cells.findIndex((c) => c === 'Lease Id');
      if (leaseIdIdx >= 0) {
        // Value is in a later cell - find first non-empty after the label
        for (let j = leaseIdIdx + 1; j < cells.length; j++) {
          if (cells[j] && cells[j] !== '') {
            currentLeaseId = cells[j];
            break;
          }
        }
        inTransactionTable = false;
      }

      // Detect Customer row - tenant name appears in row 12-style multi-line cell
      // Look for "Customer" label
      const custIdx = cells.findIndex((c) => c === 'Customer' || c.startsWith('Customer'));
      if (custIdx >= 0 && cells[custIdx].toLowerCase().includes('customer')) {
        // Tenant info usually in column 1 of a nearby row (the multiline cell)
        // Actually in the sample, row 12 col 1 has the multiline customer data
        // Let's grab that from this row first non-label cell
      }

      // Multiline customer cell (contains \n and address pattern)
      for (const c of cells) {
        if (c.includes('\n') && /TX|Tx|Texas/.test(c) && c.split('\n').length >= 2) {
          const firstLine = c.split('\n')[0].trim();
          if (firstLine && firstLine.length < 80) currentTenant = firstLine;
        }
      }

      // Detect transaction table header
      if (cells.includes('Description') || cells.includes('Description ')) {
        inTransactionTable = true;
        continue;
      }

      // Detect end of transaction table
      if (cells.some((c) => c.includes('0-30 Days') || c === 'Amount Due')) {
        inTransactionTable = false;
      }

      if (inTransactionTable) {
        // Date col 1, Description col 2
        const date = cells[1];
        const desc = cells[2];
        if (date && desc && /\d{2}\/\d{2}\/\d{2}/.test(date)) {
          allRows.push({ property: name, tenant: currentTenant, leaseId: currentLeaseId, desc });
        }
      }
    }
  }
}

console.log(`Total transaction rows: ${allRows.length}`);
console.log(`Distinct tenants: ${new Set(allRows.map((r) => r.tenant)).size}`);
console.log('\nSample first 5:');
for (const r of allRows.slice(0, 5)) console.log(' ', r);

// Filter to charges only (exclude payments which often start with ":" or contain "Payment")
const chargeRows = allRows.filter((r) => !r.desc.startsWith(':') && !/payment/i.test(r.desc.split('(')[0]));

// Group by description prefix - take everything before " (" (the date paren) and before any digit run
const prefixMap = {};
for (const r of chargeRows) {
  // strip trailing "(MM/YYYY)"
  const cleaned = r.desc.replace(/\s*\(\d{2}\/\d{4}\).*$/, '').trim();
  // prefix: take portion before first "-" or full string
  const prefix = cleaned.split('-')[0].trim().toUpperCase();
  if (!prefixMap[prefix]) prefixMap[prefix] = { count: 0, examples: new Set(), tenants: new Set(), properties: new Set() };
  prefixMap[prefix].count++;
  prefixMap[prefix].examples.add(cleaned);
  if (r.tenant) prefixMap[prefix].tenants.add(r.tenant);
  prefixMap[prefix].properties.add(r.property);
}

console.log('\n=== Charge Category Prefixes (split on "-") ===');
const sorted = Object.entries(prefixMap).sort((a, b) => b[1].count - a[1].count);
for (const [pref, data] of sorted) {
  const examples = [...data.examples].slice(0, 5);
  console.log(`${pref.padEnd(25)} count=${String(data.count).padStart(4)} tenants=${String(data.tenants.size).padStart(3)} props=${[...data.properties].join('+').padEnd(20)} ex: ${examples.join(' | ')}`);
}

// Also distinct full descriptions (post date stripping)
const descMap = {};
for (const r of chargeRows) {
  const cleaned = r.desc.replace(/\s*\(\d{2}\/\d{4}\).*$/, '').trim().toUpperCase();
  if (!descMap[cleaned]) descMap[cleaned] = { count: 0, tenants: new Set(), properties: new Set() };
  descMap[cleaned].count++;
  if (r.tenant) descMap[cleaned].tenants.add(r.tenant);
  descMap[cleaned].properties.add(r.property);
}
console.log('\n=== Distinct charge descriptions (date stripped) ===');
const sortedDesc = Object.entries(descMap).sort((a, b) => b[1].count - a[1].count);
for (const [d, data] of sortedDesc) {
  console.log(`${d.padEnd(50)} count=${String(data.count).padStart(4)} tenants=${String(data.tenants.size).padStart(3)} props=${[...data.properties].join('+')}`);
}

// Show payment-type rows separately
const paymentRows = allRows.filter((r) => r.desc.startsWith(':') || /payment/i.test(r.desc.split('(')[0]));
const payMap = {};
for (const r of paymentRows) {
  const cleaned = r.desc.replace(/\s*\(\d{2}\/\d{4}\).*$/, '').trim();
  // take first token cluster
  const key = cleaned.split(' - ')[0].toUpperCase();
  if (!payMap[key]) payMap[key] = { count: 0, examples: new Set() };
  payMap[key].count++;
  payMap[key].examples.add(cleaned);
}
console.log('\n=== Payment-type entries (excluded above) ===');
for (const [k, d] of Object.entries(payMap).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`${k.padEnd(40)} count=${d.count} ex: ${[...d.examples].slice(0, 2).join(' | ')}`);
}
