This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

## Stack
- **Frontend:** Next.js 14 (App Router), AG Grid, ApexCharts, Tailwind CSS
- **Backend:** Convex (real-time database, file storage, actions)
- **AI:** Claude API (Sonnet) for anomaly detection on Yardi exports
- **Automation:** n8n for Yardi scraping and scheduled syncs
- **Hosting:** Vercel

## Architecture
- `src/data/*.ts` contains seed/fallback data (being migrated to Convex)
- `convex/` contains all backend functions (queries, mutations, actions)
- Dashboard reads from Convex in real-time via `useQuery`
- File uploads go to Convex file storage, then processed by Claude
- n8n calls Convex HTTP endpoints for automated syncs
