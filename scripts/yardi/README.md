# Yardi Scraper

Playwright script that logs into Redhorn's Yardi instance, pulls the **Income Statement** report for every property, and drops an `.xlsx` per property into `downloads/YYYY-MM/`.

## Setup (one time)

```bash
cd scripts/yardi
npm install
npm run install-browser        # downloads Chromium (~400 MB)
```

Credentials live in `redhorn-dashboard/.env.local` (one level up). The scraper reads from there automatically — no separate `.env` needed.

## Run

```bash
npm run income
```

First run opens a headed browser so you can watch — it'll need a Gmail app-password–enabled inbox to auto-fetch the 2FA code. After the first successful login, `storageState.json` is saved and subsequent runs skip the 2FA until Yardi expires the session.

## Output

```
downloads/
  2026-03/
    hollister-income-statement.xlsx
    belgold-income-statement.xlsx
    rv-ohio-income-statement.xlsx
```

## Adding more reports later

Each report lives in `src/reports/`. Add a new file (e.g. `rent-roll.ts`) that exports a `runForProperty(page, property, monthIso)` function, then have `run.ts` call it alongside income-statement. Login + Gmail 2FA are already factored out and reusable.
