import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://localhost:5173/';
const outputDir = process.env.VISUAL_OUTPUT_DIR ?? 'artifacts/visual-check';
const requireSignedIn = process.env.REQUIRE_SIGNED_IN === '1';
const credentials = {
  college: process.env.COLLEGE_CODE,
  identifier: process.env.COLLEGE_IDENTIFIER,
  code: process.env.OTP_CODE ?? '123456',
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console: ${message.text()}`);
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${outputDir}/signed-out.png`, fullPage: true });

  const supplied = credentials.college && credentials.identifier;
  if (!supplied) {
    if (requireSignedIn) throw new Error('COLLEGE_CODE and COLLEGE_IDENTIFIER are required when REQUIRE_SIGNED_IN=1');
    console.log('Captured signed-out state; signed-in credentials were not supplied.');
  } else {
    await page.getByLabel('College code').fill(credentials.college);
    await page.getByLabel('Email or mobile').fill(credentials.identifier);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Code').fill(credentials.code);
    await page.waitForSelector('.shell__nav', { state: 'visible', timeout: 15000 });
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
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${outputDir}/${String(index + 1).padStart(2, '0')}-${safe}.png`, fullPage: true });
    }
    console.log(`Captured signed-in dashboard and ${count} navigation sections.`);
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
