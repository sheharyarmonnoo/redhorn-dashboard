# Import Deals — Monday.com Deal Flow Tracker → Convex

One-shot importer that reads the Monday.com Deal Flow Tracker xlsx export and
populates the dashboard's `deals` table. Idempotent: re-running with the same
file updates existing deals (matched by Monday Item ID) instead of duplicating.

## Setup

```bash
cd scripts/import-deals
npm install
```

## Run

```bash
# default: targets whatever NEXT_PUBLIC_CONVEX_URL points at in ../../.env.local
npm run import -- --file "C:/Users/SheharyarMonnoo/Downloads/Deal_Flow_Tracker_1778171226.xlsx"

# explicitly target prod (override .env.local)
CONVEX_DEPLOYMENT=prod:industrious-blackbird-448 npm run import -- --file "<xlsx-path>"
```

## What it does

1. Reads the "deal flow tracker" sheet — finds each section (LOI Sent, Closed
   Deals, Under Review, Working / Active, etc.) and walks rows underneath.
2. Maps each row to a deal payload:
   - `Name` → `name`
   - `Address` → `address`
   - `SF` → `sqft`
   - `Deal Value` → `askingPrice`
   - `Deal Stage` column or section header → `stage`
   - `Lead Partner` → `assignedTo`
   - `Date Entered` (Excel serial) → `createdAt`
   - `Item ID` → `mondayItemId` (dedupe key)
   - `Source Type/Phone/Email/Name` + `TDLR Phone/Email/Name/Source` → `contacts[]`
   - 14 other Monday-only columns → `customFields{}` (priority, contact status,
     last contact date, next step, follow-up count, lead tier/score, last sale
     price/date, appraised value, HCAD #, owner entity, rates, broker notes)
3. Reads the "updates" sheet — buckets each row by Item ID and appends them as
   `notes[]` entries on the matching deal.
4. Seeds `deal_field_definitions` rows (idempotent) for each custom field so
   they show up in the DealDetail UI.
5. Calls `deals:bulkImport` in chunks of 50.

## Re-running

The importer is idempotent. Re-running the same file:
- Finds each deal by `mondayItemId`
- Patches the synced fields (preserves anything you've manually edited that
  isn't in the Excel — notably `customFields` is _merged_, not replaced)
- Appends only new updates (deduped by `createdAt + first 80 chars` of text)
