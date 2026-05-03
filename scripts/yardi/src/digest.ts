import nodemailer from "nodemailer";
import { config } from "./config.js";

export interface DigestProperty {
  name: string;
  code: string;
  summary: string;
  insights: Array<{ severity: string; title: string }>;
  alertsCreated: number;
}

export interface DigestPayload {
  syncJobId: string;
  month: string;
  rowsIngested: number;
  filesUploaded: number;
  properties: DigestProperty[];
}

const DASHBOARD_URL = "https://redhorn.dealmanagerai.com";

/**
 * Send an HTML email digest summarizing the latest Yardi sync.
 *
 * Uses Gmail SMTP with the existing app password (same one we use for IMAP MFA
 * fetching). No new account required.
 *
 * Recipients are taken from `YARDI_DIGEST_TO` env var as a comma-separated list.
 * If that var is not set, the digest is skipped silently.
 */
export async function sendSyncDigest(payload: DigestPayload): Promise<void> {
  const recipients = (process.env.YARDI_DIGEST_TO || "").trim();
  if (!recipients) {
    console.log("   YARDI_DIGEST_TO not set — skipping email digest.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: config.GMAIL_USER, pass: config.GMAIL_PASSWORD },
  });

  const subject = buildSubject(payload);
  const html = buildHtml(payload);
  const text = buildText(payload);

  await transporter.sendMail({
    from: `"Redhorn Yardi Sync" <${config.GMAIL_USER}>`,
    to: recipients,
    subject,
    html,
    text,
  });
  console.log(`   email digest sent to ${recipients}`);
}

function buildSubject(p: DigestPayload): string {
  const totalCriticals = p.properties.reduce(
    (s, prop) => s + prop.insights.filter(i => i.severity === "critical").length,
    0
  );
  const totalInsights = p.properties.reduce((s, prop) => s + prop.insights.length, 0);
  if (totalCriticals > 0) {
    return `Redhorn Yardi sync · ${p.month} · ${totalCriticals} critical / ${totalInsights} total findings`;
  }
  if (totalInsights > 0) {
    return `Redhorn Yardi sync · ${p.month} · ${totalInsights} findings`;
  }
  return `Redhorn Yardi sync · ${p.month} · all clear`;
}

function buildHtml(p: DigestPayload): string {
  const sevColor = (s: string) =>
    s === "critical" ? "#dc2626" : s === "warning" ? "#d97706" : "#2563eb";

  const propertySections = p.properties
    .map(
      (prop) => `
        <tr>
          <td style="padding:18px 0 4px;border-top:1px solid #e4e4e7;">
            <div style="font-size:14px;font-weight:600;color:#18181b;">${escape(prop.name)}</div>
            <div style="font-size:11px;color:#71717a;margin-top:2px;">${prop.alertsCreated} new alert${prop.alertsCreated === 1 ? "" : "s"}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0 12px;font-size:12px;color:#52525b;line-height:1.55;">
            ${escape(prop.summary)}
          </td>
        </tr>
        ${
          prop.insights.length === 0
            ? ""
            : `<tr><td style="padding-bottom:14px;">
                ${prop.insights
                  .slice(0, 8)
                  .map(
                    (i) => `
                      <div style="display:flex;align-items:center;padding:5px 0;font-size:12px;">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sevColor(i.severity)};margin-right:8px;"></span>
                        <span style="color:#18181b;">${escape(i.title)}</span>
                      </div>`
                  )
                  .join("")}
              </td></tr>`
        }
      `
    )
    .join("");

  return `
<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,system-ui,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:6px;">
    <tr>
      <td style="padding:18px 22px 10px;">
        <div style="font-size:16px;font-weight:600;color:#18181b;">Redhorn Yardi Sync — ${p.month}</div>
        <div style="font-size:11px;color:#71717a;margin-top:3px;">${p.filesUploaded} files · ${p.rowsIngested} rows ingested · sync ${p.syncJobId.slice(0, 8)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 22px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          ${propertySections}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 22px 20px;border-top:1px solid #e4e4e7;">
        <a href="${DASHBOARD_URL}" style="display:inline-block;background:#18181b;color:#fff;padding:8px 14px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:500;">Open dashboard →</a>
        <div style="font-size:10px;color:#a1a1aa;margin-top:8px;">Click any insight in the Latest AI Insights panel to expand. Mark items as false flags so future syncs don't re-flag them.</div>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function buildText(p: DigestPayload): string {
  const lines: string[] = [];
  lines.push(`Redhorn Yardi Sync — ${p.month}`);
  lines.push(`${p.filesUploaded} files · ${p.rowsIngested} rows · sync ${p.syncJobId}`);
  lines.push("");
  for (const prop of p.properties) {
    lines.push(`── ${prop.name} (${prop.alertsCreated} new alerts)`);
    lines.push(prop.summary);
    lines.push("");
    for (const i of prop.insights) {
      lines.push(`  • [${i.severity}] ${i.title}`);
    }
    lines.push("");
  }
  lines.push(`Dashboard: ${DASHBOARD_URL}`);
  return lines.join("\n");
}

function escape(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
