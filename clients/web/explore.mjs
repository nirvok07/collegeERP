import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-suryapandey-Dev-college-erp/7b903aee-b2ed-4f19-aed1-9e08003a8f84/scratchpad/sonam-flow';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:5174/');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/01-initial.png`, fullPage: true });

await page.getByLabel('College code').fill('iit-delhi');
await page.getByLabel('Email or mobile').fill('sonam@gmail.com');
await page.getByRole('button', { name: 'Send code' }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/02-after-send-code.png`, fullPage: true });
console.log('body after send code:', (await page.locator('body').innerText()).slice(0, 800));

await browser.close();
