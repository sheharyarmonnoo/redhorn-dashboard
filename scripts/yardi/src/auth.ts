import { BrowserContext, Page, chromium } from "playwright";
import { existsSync } from "node:fs";
import { config, yardiBaseUrl } from "./config.js";
import { storageStateFile } from "./paths.js";
import { fetchYardi2FACode } from "./gmail.js";

export interface Session {
  context: BrowserContext;
  yardiOne: Page;      // YardiOne tile launcher
  voyager: Page;       // Yardi Voyager (where reports live)
  close: () => Promise<void>;
}

/**
 * Full Redhorn Yardi auth flow:
 *   1. Open YardiOne (77771landp.yardione.com)
 *   2. If a login form is visible, sign in with user/pass
 *   3. If a 2FA prompt appears, fetch the code from Gmail/REDHORN and enter it
 *   4. Click the "Voyager" tile — this opens a new tab to yardiasptx11.com
 *   5. Handle the Voyager "Server/Live" intermediate page → click PROCEED
 *   6. Return both pages; the Voyager page is where reports are driven
 *
 * Saves storageState.json on success so subsequent runs skip steps 2-3.
 */
export async function openAuthenticatedSession(opts: { headed?: boolean; manualCode?: string } = {}): Promise<Session> {
  const browser = await chromium.launch({ headless: !(opts.headed ?? false) });
  const storageState = existsSync(storageStateFile) ? storageStateFile : undefined;
  const context = await browser.newContext({
    storageState,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
  });

  const yardiOne = await context.newPage();
  const close = async () => {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  };

  try {
    await yardiOne.goto(yardiBaseUrl, { waitUntil: "domcontentloaded" });

    if (await isYardiOneLoginVisible(yardiOne)) {
      await performYardiOneLogin(yardiOne, opts.manualCode);
      await context.storageState({ path: storageStateFile });
      console.log(`Saved authenticated storage state to ${storageStateFile}`);
    } else {
      console.log("Re-using existing storage state — skipped YardiOne login.");
    }

    const voyager = await launchVoyagerFromYardiOne(context, yardiOne);
    return { context, yardiOne, voyager, close };
  } catch (err) {
    await close();
    throw err;
  }
}

async function isYardiOneLoginVisible(page: Page): Promise<boolean> {
  const userField = page.locator('input[type="email"], input[name*="user" i], input[name*="email" i]').first();
  return await userField.isVisible({ timeout: 5_000 }).catch(() => false);
}

async function performYardiOneLogin(page: Page, manualCode?: string) {
  console.log("Logging in to YardiOne…");
  const loginStartedAt = new Date();

  // Bail early if Yardi already says the account is locked — don't waste attempts.
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  if (/account is locked/i.test(bodyText)) {
    throw new Error(
      "Yardi says this account is locked. Wait ~15 minutes for the lockout to clear (or ask your admin to unlock) before rerunning."
    );
  }

  // Dump the form so we can see the real field names/ids on first failure
  const formDump = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input")).map(i => ({
      id: i.id, name: i.name, type: i.type, placeholder: i.placeholder, autocomplete: i.autocomplete,
    }));
    return inputs;
  }).catch(() => []);
  console.log("Login form inputs detected:", JSON.stringify(formDump, null, 2));

  const userField = page.locator(
    'input[name="Username"], input[id*="username" i], input[name*="user" i], input[type="email"], input[autocomplete="username"]'
  ).first();
  const passField = page.locator(
    'input[type="password"], input[autocomplete="current-password"]'
  ).first();

  // Use pressSequentially (real keystrokes) instead of fill() — some YardiOne skins
  // re-render the password field via JS, which can wipe values set by .fill().
  await userField.click();
  await userField.press("Control+A");
  await userField.press("Delete");
  await userField.pressSequentially(config.YARDI_USER, { delay: 20 });
  console.log(`Typed username, field now has length: ${(await userField.inputValue()).length}`);

  await passField.click();
  await passField.press("Control+A");
  await passField.press("Delete");
  await passField.pressSequentially(config.YARDI_PASS, { delay: 40 });
  // Pause so a human watching can visually confirm the password appears as dots in the field
  await page.waitForTimeout(1500);
  const passLen = (await passField.inputValue()).length;
  console.log(`Typed password, field now has length: ${passLen}`);
  if (passLen === 0) {
    throw new Error("Password field did not accept input — selector probably wrong.");
  }
  if (passLen !== config.YARDI_PASS.length) {
    throw new Error(`Password field has ${passLen} chars but expected ${config.YARDI_PASS.length}. Typing was partially swallowed.`);
  }

  // YardiOne's submit button varies by skin. Try each locator; fall back to pressing Enter.
  // YardiOne uses an ALL-CAPS "LOGIN" button. Most selectors below are case-insensitive via :has-text.
  const submitLocators = [
    'button:has-text("LOGIN")',
    'button:has-text("Login")',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'input[type="submit"][value*="login" i]',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Continue")',
    'button:has-text("Next")',
  ];
  let clicked = false;
  for (const sel of submitLocators) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    console.log("No submit button matched — pressing Enter on the password field as a fallback.");
    await passField.press("Enter");
  }

  // Wait for the post-login landing — either MFA page or the tile dashboard.
  await page.waitForURL(
    (u) => /MfaAuthentication|Dashboard|Welcome|Home/i.test(u.toString()) || !/login/i.test(u.toString()),
    { timeout: 30_000 }
  ).catch(() => {});

  if (/MfaAuthentication/i.test(page.url())) {
    console.log("MFA email verification required. Fetching code from Gmail REDHORN label…");

    const mfaForm = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("input")).map(i => ({
        id: i.id, name: i.name, type: i.type, placeholder: i.placeholder,
      }));
    }).catch(() => []);
    console.log("MFA form inputs:", JSON.stringify(mfaForm, null, 2));

    const codeInput = page.locator(
      '#VerificationCode, input[name="VerificationCode" i], input[name*="code" i], input[name*="otp" i], input[type="text"]:not([type="hidden"])'
    ).first();
    await codeInput.waitFor({ timeout: 10_000 });

    let code: string;
    if (manualCode) {
      console.log("Using --code override (skipping Gmail fetch).");
      code = manualCode;
    } else {
      code = await fetchYardi2FACode({ afterDate: loginStartedAt });
    }
    console.log(`Got 2FA code (masked): ${code.replace(/./g, "•")}`);
    await codeInput.click();
    await codeInput.pressSequentially(code, { delay: 30 });

    // Opt-in to 14-day remember so subsequent runs skip MFA entirely
    const rememberBox = page.locator('input[type="checkbox"]').first();
    if (await rememberBox.isVisible({ timeout: 1_000 }).catch(() => false)) {
      if (!(await rememberBox.isChecked().catch(() => false))) {
        await rememberBox.check().catch(() => {});
      }
    }

    const submitBtn = page.locator(
      'button:has-text("SUBMIT"), button:has-text("Submit"), button[type="submit"], input[type="submit"]'
    ).first();
    await submitBtn.click();

    await page.waitForURL((u) => !/MfaAuthentication/i.test(u.toString()), { timeout: 30_000 });
    console.log("MFA accepted.");
  } else {
    console.log("No 2FA required this session.");
  }

  // Wait for the tile launcher to render. Yardi's post-login landing is slow sometimes.
  // Try multiple signals: network idle, exact "Voyager" tile, or URL change off /login.
  const landed = await Promise.race([
    page.waitForLoadState("networkidle", { timeout: 30_000 }).then(() => "networkidle").catch(() => null),
    page.getByText("Voyager", { exact: true }).first().waitFor({ timeout: 30_000 }).then(() => "tile-visible").catch(() => null),
    page.waitForURL((url) => !/login|signin|auth/i.test(url.toString()), { timeout: 30_000 }).then(() => "url-changed").catch(() => null),
  ]);

  if (!landed) {
    const shotPath = `yardione-login-failed-${Date.now()}.png`;
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
    throw new Error(`YardiOne did not reach the dashboard after login. Screenshot saved to ${shotPath}`);
  }
  console.log(`YardiOne dashboard loaded (signal: ${landed}).`);
}

/**
 * Click the "Voyager" tile. It opens Voyager in a new tab, lands on a
 * Server/Live SSO handoff page, then a PROCEED button takes us to menu.aspx.
 */
async function launchVoyagerFromYardiOne(context: BrowserContext, yardiOne: Page): Promise<Page> {
  console.log("Launching Voyager from YardiOne…");

  // YardiOne tiles: <div class="dashboard-tile"><a><div class="tile-title">Voyager</div></a></div>
  // Match the tile-title exactly to avoid "Voyager 8" / "Aspire for Voyager 8" false positives.
  const voyagerTile = yardiOne.locator('.dashboard-tile:has(.tile-title:text-is("Voyager"))').first();
  try {
    await voyagerTile.waitFor({ timeout: 20_000 });
  } catch (err) {
    const shot = `yardione-no-tiles-${Date.now()}.png`;
    await yardiOne.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const url = yardiOne.url();
    const title = await yardiOne.title().catch(() => "");
    const bodyText = await yardiOne.locator("body").innerText({ timeout: 2_000 }).catch(() => "<no body>");
    throw new Error(
      `Voyager tile never appeared on YardiOne.\n  url: ${url}\n  title: ${title}\n  body (first 500 chars): ${bodyText.slice(0, 500)}\n  screenshot: ${shot}`
    );
  }

  const [voyagerPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 30_000 }),
    voyagerTile.click(),
  ]);
  await voyagerPage.waitForLoadState("domcontentloaded");

  // Handle the SSO intermediate page ("Server: 974 / Live / PROCEED").
  // The PROCEED button is rendered as an image-button in Yardi's older theme.
  const proceed = voyagerPage.locator(
    [
      'button:has-text("Proceed")',
      'button:has-text("PROCEED")',
      'input[type="submit"][value*="Proceed" i]',
      'input[type="submit"][value*="PROCEED" i]',
      'input[type="image"][alt*="Proceed" i]',
      'input[name*="Proceed" i]',
      'input[id*="Proceed" i]',
      'a:has-text("Proceed")',
      'a:has-text("PROCEED")',
      'img[alt*="Proceed" i]',
    ].join(", ")
  ).first();

  const reachedProceed = await proceed.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  if (reachedProceed) {
    console.log("Voyager SSO handoff detected — clicking PROCEED.");
    await proceed.click();
  } else {
    // Maybe we landed straight in Voyager — that's fine, fall through
    console.log("No PROCEED page detected (might already be in Voyager).");
  }

  // Voyager's main page renders content in an iframe named "filter"; wait for it
  await voyagerPage.waitForSelector('iframe[name="filter"]', { timeout: 60_000 });
  console.log("Voyager loaded.");
  return voyagerPage;
}
