import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://localhost:5173/';
const outputDir = process.env.VISUAL_OUTPUT_DIR ?? 'artifacts/visual-check';
const requireSignedIn = process.env.REQUIRE_SIGNED_IN === '1';
const authMode = process.env.VISUAL_AUTH_MODE ?? 'college';
const visualState = process.env.VISUAL_STATE ?? 'happy';
const emptyCollectionPaths = [
  '/v1/people', '/v1/campuses', '/v1/departments', '/v1/programs',
  '/v1/curriculum-versions', '/v1/academic-years', '/v1/terms', '/v1/sections',
  '/v1/offerings', '/v1/rooms', '/v1/sessions', '/v1/attendance', '/v1/assessments',
  '/v1/students', '/v1/courses', '/v1/slots', '/v1/calendar', '/v1/non-teaching-days',
  '/v1/me/teaching', '/v1/me/sessions', '/v1/me/staff-attendance',
];
const credentials = {
  college: process.env.COLLEGE_CODE,
  identifier: process.env.COLLEGE_IDENTIFIER,
  code: process.env.OTP_CODE ?? '123456',
  email: process.env.PLATFORM_EMAIL,
  password: process.env.PLATFORM_PASSWORD,
  secondFactor: process.env.PLATFORM_OTP_CODE,
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  // A signed-out browser always probes refresh before the OTP flow. Chromium
  // reports that expected 401 as a resource error; it is not a visual failure.
  const expectedAuthProbe = message.text().includes('status of 401 (Unauthorized)');
  const expectedForcedState = visualState === 'error'
    && message.text().includes('status of 503 (Service Unavailable)');
  if (message.type() === 'error' && !expectedAuthProbe && !expectedForcedState) {
    failures.push(`console: ${message.text()}`);
  }
});

const stateRoute = async (route) => {
  const url = route.request().url();
  // Authentication and permission bootstrap must remain real so the probe can
  // reach the shell before forcing module loading/error responses.
  if (url.includes('/auth/') || url.includes('/me/permissions')) {
    await route.continue();
    return;
  }
  if (visualState === 'loading') {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
    return;
  }
  if (visualState === 'empty' && route.request().method() === 'GET'
      && emptyCollectionPaths.some((path) => new URL(url).pathname === path)) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
    return;
  }
  if (visualState === 'error') {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'VISUAL_CHECK_FAILURE', message: 'Forced visual-check failure.' } }),
    });
    return;
  }
  await route.continue();
};

try {
  if (!['happy', 'loading', 'empty', 'error'].includes(visualState)) {
    throw new Error(`VISUAL_STATE must be happy, loading, empty or error (received ${visualState})`);
  }
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(authMode === 'platform' ? 'Email' : 'College code').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outputDir}/signed-out.png`, fullPage: true });
  if (visualState !== 'happy') await page.route('**/v1/**', stateRoute);

  const supplied = authMode === 'platform'
    ? credentials.email && credentials.password && credentials.secondFactor
    : credentials.college && credentials.identifier;
  if (!supplied) {
    if (requireSignedIn) {
      throw new Error(authMode === 'platform'
        ? 'PLATFORM_EMAIL, PLATFORM_PASSWORD and PLATFORM_OTP_CODE are required when REQUIRE_SIGNED_IN=1'
        : 'COLLEGE_CODE and COLLEGE_IDENTIFIER are required when REQUIRE_SIGNED_IN=1');
    }
    console.log('Captured signed-out state; signed-in credentials were not supplied.');
  } else {
    if (authMode === 'platform') {
      await page.goto(`${baseUrl}?platform=1`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Email').waitFor({ state: 'visible' });
      await page.getByLabel('Email').fill(credentials.email);
      await page.getByLabel('Password').fill(credentials.password);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Code').fill(credentials.secondFactor);
    } else {
      await page.getByLabel('College code').fill(credentials.college);
      await page.getByLabel('Email or mobile').fill(credentials.identifier);
      await page.getByRole('button', { name: 'Send code' }).click();
      // The field has one real input under six visual boxes. `fill` is more
      // deterministic than key-by-key input in headless Chromium and still
      // exercises the component's normal change/onComplete path.
      await page.getByLabel('Code').fill(credentials.code);
    }
    // OtpField submits automatically when the sixth digit is entered. Do not
    // race the transition, but retain a fallback for browser autofill paths
    // that update the input without firing the component's completion callback.
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await signIn.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
    if (await signIn.isVisible().catch(() => false) && await signIn.isEnabled().catch(() => false)) {
      await signIn.click();
    }
    try {
      await page.waitForSelector('.shell__nav', { state: 'visible', timeout: 15000 });
    } catch (error) {
      await page.screenshot({ path: `${outputDir}/signed-in-timeout.png`, fullPage: true });
      const shellCount = await page.locator('.shell__nav').count();
      const tabCount = await page.locator('.shell__tab').count();
      const signInCount = await page.getByRole('button', { name: 'Sign in' }).count();
      throw new Error(
        `Signed-in shell did not render (nav=${shellCount}, tabs=${tabCount}, signIn=${signInCount}): ${error.message}`,
      );
    }
    // Permissions load immediately after the shell mounts. Wait until the
    // permission-filtered navigation has stopped changing, otherwise a fast
    // browser captures only the initial Dashboard/Profile pair.
    await page.waitForFunction(() => {
      const labels = [...document.querySelectorAll('.shell__tab')].map((tab) => tab.textContent?.trim() ?? '');
      const key = labels.join('\u001f');
      const now = performance.now();
      const state = window;
      if (state.__visualNavKey !== key) {
        state.__visualNavKey = key;
        state.__visualNavStableSince = now;
      }
      return labels.length >= 2 && now - (state.__visualNavStableSince ?? now) >= 500;
    }, { timeout: 15000 });

    await page.screenshot({ path: `${outputDir}/dashboard.png`, fullPage: true });

    const tabs = page.locator('.shell__tab');
    const count = await tabs.count();
    for (let index = 0; index < count; index++) {
      const tab = tabs.nth(index);
      const label = (await tab.innerText()).trim();
      const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index + 1}`;
      await tab.click();
      await page.waitForTimeout(visualState === 'happy' ? 500 : 350);
      const prefix = visualState === 'happy' ? '' : `state-${visualState}-`;
      await page.screenshot({ path: `${outputDir}/${prefix}${String(index + 1).padStart(2, '0')}-${safe}.png`, fullPage: true });
    }
    if (visualState !== 'happy') await page.unroute('**/v1/**', stateRoute);
    console.log(`Captured signed-in ${visualState} dashboard and ${count} navigation sections.`);
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
