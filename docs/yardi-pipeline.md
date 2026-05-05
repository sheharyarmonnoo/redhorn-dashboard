# Yardi Pipeline

End-to-end Yardi sync for Redhorn Capital. One command pulls all four reports, ingests them into Convex, runs Claude insights, and lights up the dashboard UI.

> Mirror of the `/yardi-run` Claude Code skill at `~/.claude/skills/yardi-run/SKILL.md`. Kept in the repo for documentation purposes — not loaded by anything at build time.

## What it does

1. **Scrape (Playwright)** — logs into Yardi Voyager (MFA via Gmail label `REDHORN/YARDI` or `--code`), pulls four reports per property:
   - **Income Statement** (Custom Financials → `IS_CFTem`)
   - **Rent Roll** (dashboard Current Leases panel)
   - **Total Units** (dashboard Space/Facilities panel)
   - **Receivable Detail / Lease Ledger** (SSRS — viewer popup + `exportReport('EXCELOPENXML')` + context-level download listener)
2. **Upload + Parse + Ingest** — each `.xlsx` → Convex file storage → matching parser → bulk-insert into the right table:
   - `income_lines` (with `period` from "Period = Apr 2026" header so April data is filed under `2026-04`, not today's date)
   - `tenants` (bulk replace via `tenants.bulkReplaceByCode`)
   - `units` (bulk replace via `units.bulkReplaceByCode`)
   - `receivable_details` (per-tenant transactions + aging)
3. **Rollup** — `monthlyRevenue.recomputeFromLatest` aggregates `income_lines` for the actual report period and writes to `monthly_revenue` (drives KPI cards + revenue chart).
4. **Insights (Claude)** — `convex/insights.ts:extractForProperty` for each ingested property:
   - Pulls latest + prior `income_lines`, `receivable_details`, `tenants`, last 20 prior insights, and any false-flag reasons.
   - Builds month-over-month prompt with named drivers and "April CP / March CP" labeling.
   - Calls Claude Sonnet → writes findings to `alerts` (`alertType: "income_insight"`) with markdown body + run summary in `aiAnalysis`.
5. **Wrap-up** — `sync_jobs.complete`, optional email digest (`YARDI_DIGEST_TO`), `activity_log` entry.

Everything runs under one `sync_jobs` row for traceability.

## How to run

The sync runs on the **VPS** (`root@2.24.74.123`). Local Claude Code (or any shell) SSHes in and fires the wrapper:

```bash
ssh -i ~/.ssh/redhorn_vps_temp -o ConnectTimeout=10 root@2.24.74.123 \
  '/usr/local/bin/yardi-sync.sh >> /var/log/yardi/sync.log 2>&1; tail -120 /var/log/yardi/sync.log'
```

The wrapper at `/usr/local/bin/yardi-sync.sh` is just `cd /opt/redhorn-dashboard/scripts/yardi && npm run income -- --headless`. The trailing `tail -120` brings the run summary back so the caller can verify success.

For ad-hoc local runs (dev, testing parser changes):

```bash
cd scripts/yardi
NEXT_PUBLIC_CONVEX_URL=https://industrious-blackbird-448.convex.cloud npm run income
```

The script is named `income` for legacy reasons but it runs all four reports via `src/run.ts`. Headed by default locally — add `--headless` for unattended runs (always headless on VPS).

Optional flags (pass through `npm run income --` after the wrapper or directly):
- `--month=YYYY-MM` — override the report period (default: latest closed month)
- `--template=IS_CFTem` — override the income statement template
- `--code=NNNNNN` — paste an MFA code if Gmail IMAP can't fetch it
- `--no-upload` — scrape only, skip Convex upload + insights
- `--historical` — backfill mode: only runs Income Statement, anchors snapshot to end-of-month, skips insights + digest

## Auth state

`storageState.json` in `scripts/yardi/` is reused for ~14 days after a successful MFA. After that the script auto-fetches the new code from Gmail (`underwriting.dealmanagerai@gmail.com`, label `REDHORN/YARDI`).

If Yardi locks the account after several failed logins, wait 15 min before retrying. The script bails early on lockout text.

## Where output lands

| Where | What |
|---|---|
| `scripts/yardi/downloads/YYYY-MM/{code}-{report}.xlsx` | Raw Excel exports |
| Convex `_storage` | Same files, accessible via `files.getUrl(storageId)` |
| Convex `income_lines` | Parsed IS rows with `snapshotDate` + `period` + `isLatest` |
| Convex `tenants` | Bulk-replaced from rent roll, snapshot-keyed |
| Convex `units` | Bulk-replaced from total units |
| Convex `receivable_details` | Per-tenant tx history (Lease Ledger sectioned parser) |
| Convex `monthly_revenue` | Rollup recomputed for the report's actual period |
| Convex `sync_jobs` | One row per run — links files + records ingested + status |
| Convex `alerts` (`income_insight`) | Each Claude finding with run summary in `aiAnalysis` |
| Convex `activity_log` | "Yardi sync · N files · M rows · K insights" |

## UI surfaces

- **Dashboard** (`/`) — `LatestInsights` card with markdown summary (collapsible, persisted in localStorage per property) + per-finding rows. Each row has **Mark as Completed** (`status=resolved`) and **Mark as False Flag** (writes a reason that suppresses the same pattern in the next sync's prompt). KPI cards + revenue chart pull from `monthly_revenue`.
- **Alerts page** (`/alerts`) — same `income_insight` rows in the AG Grid (autoHeight, page size 20). Click a row to open the drawer with full markdown rendering.
- **Data Pipeline page** (`/data-pipeline`) — `sync_jobs` history with file names, row counts, per-file storage download links, and a side drawer for run details.

All UI is real-time via Convex subscriptions — no refresh needed.

## When something breaks

- **"Account is locked"** — wait 15 min. The script bails early.
- **Lookup iframe missing** — Yardi changed the picker URL. Search logs for `Lookup2.aspx` and update the regex in `reports/income-statement.ts:waitForLookupFrame`.
- **Property report shows `.redhorn` rollup instead of single property** — the lookup field-set didn't take. Run headed and watch; usually needs a longer wait between iframe navigation and field-set.
- **MFA email never arrives** — emails go to `Dealmanager@redhorncapital.com` (Outlook), forwarded to `underwriting.dealmanagerai+redhorn@gmail.com`. If forwarding is broken, paste with `--code=NNNNNN`.
- **Receivable Detail returns 0 rows** — Lease Ledger format changed. The parser expects sectioned format with "Lease Information" markers and stops at "0-30 Days" aging line. Check `parse-receivable-detail.ts`.
- **Income statement labeled wrong month** — verify `period` is being read from the report header. Look for "Period = …" text in the Excel and the `periodHeaderToYYYYMM()` helper in `convex-upload.ts`.

## Continuity loop (don't break it)

Each run's insights are stored as `alerts` with `alertType="income_insight"` and `dataContext.syncJobId`. The next run's Claude prompt includes:
- The 20 most recent prior insights → so it confirms resolution / worsening, doesn't repeat findings, and builds a coherent narrative.
- All `false_flag` reasons → so suppressed patterns stay suppressed unless something materially changed.

Don't manually delete `income_insight` alerts unless you're resetting the loop intentionally. Use **Mark as Completed** (resolved) or **Mark as False Flag** in the UI for the normal lifecycle.
