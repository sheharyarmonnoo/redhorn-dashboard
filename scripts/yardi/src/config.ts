import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";

// Resolve scripts/yardi/src/config.ts → redhorn-dashboard/.env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootEnv = resolve(__dirname, "../../../.env.local");
const localEnv = resolve(__dirname, "../.env");

// Prefer the scraper-local .env if it exists (for overrides); otherwise fall back to the project-wide .env.local.
if (existsSync(localEnv)) loadDotenv({ path: localEnv });
else if (existsSync(rootEnv)) loadDotenv({ path: rootEnv });
else loadDotenv();

const Env = z.object({
  YARDI_URL: z.string().url(),
  YARDI_USER: z.string().min(1),
  YARDI_PASS: z.string().min(1),
  GMAIL_USER: z.string().email(),
  GMAIL_PASSWORD: z.string().min(1),
  GMAIL_LABEL: z.string().default("REDHORN"),
  // Optional — required only when uploading to Convex
  NEXT_PUBLIC_CONVEX_URL: z.string().url().optional(),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // Pretty error so the user knows exactly what's missing
  const missing = parsed.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Missing/invalid env vars in .env.local:\n${missing}`);
}

export const config = parsed.data;

// Single source of truth for the Yardi URL trimmed of any trailing slash
export const yardiBaseUrl = config.YARDI_URL.replace(/\/$/, "");
