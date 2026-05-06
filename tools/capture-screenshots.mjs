// Capture and optimize screenshots of every site shown in the work grid.
// Re-run after updating the `sites` list or when a live site changes:
//   npm run screenshots
//
// Output: screenshots/<slug>.webp at 1200x800 (3:2, retina-friendly).

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'screenshots');

// `prepare(page)` runs after navigation and before the screenshot. Use it to
// dismiss modals, accept cookies, etc. Keep selectors site-specific so a
// generic match doesn't accidentally click through CTAs we want in shot.
const sites = [
  { slug: 'ty-logistics',     url: 'https://ty-logistics.co.uk/' },
  { slug: 'dragon-upvc',      url: 'https://dragonwindowsupvc.co.uk/' },
  { slug: 'isca-electrical',  url: 'https://isca-electrical.vercel.app/' },
  { slug: 'appian-cheat',     url: 'https://appian-cheat.vercel.app/' },
  { slug: 'western-recovery', url: 'https://western-recovery-group.vercel.app/' },
  {
    slug: 'hearth-and-leaf',
    url: 'https://www.hearthandleaf.co.uk/',
    async prepare(page) {
      // Age verification gate — click "I'm 18+". The element may not be a
      // semantic <button>, so match on visible text.
      const btn = page.locator('text=/^\\s*I.?m\\s*18\\+?\\s*$/i').first();
      try {
        await btn.waitFor({ state: 'visible', timeout: 4000 });
        await btn.click({ timeout: 3000 });
      } catch {}
    },
  },
  { slug: 'skin-and-soul',    url: 'https://skin-and-soul-studio.vercel.app/' },
  { slug: 'little-readers',   url: 'https://littlereaders.vercel.app/' },
];

const VIEWPORT = { width: 1280, height: 853 };
const OUTPUT   = { width: 1200, height: 800 };
const SETTLE_MS = 2500;

await mkdir(outDir, { recursive: true });

// Vercel's edge firewall fingerprints headless Chromium and starts returning
// 403s when it sees too many requests in a short window. Using the real Chrome
// channel + a real-looking context + pacing between sites keeps it happy.
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
  locale: 'en-GB',
  timezoneId: 'Europe/London',
});

const PACE_MS = 4000; // gap between sites to avoid edge rate-limits

const failed = [];

async function captureOnce(site) {
  const tmpPath = join(outDir, `${site.slug}.tmp.png`);
  const finalPath = join(outDir, `${site.slug}.webp`);
  const page = await context.newPage();

  try {
    const resp = await page.goto(site.url, { waitUntil: 'load', timeout: 45000 });
    const status = resp?.status() ?? 0;
    if (status >= 400) throw new Error(`HTTP ${status}`);

    if (site.prepare) {
      try { await site.prepare(page); } catch {}
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: tmpPath, type: 'png', fullPage: false });

    const buf = await readFile(tmpPath);
    await sharp(buf)
      .resize(OUTPUT.width, OUTPUT.height, { fit: 'cover', position: 'top' })
      .webp({ quality: 78 })
      .toFile(finalPath);

    await unlink(tmpPath).catch(() => {});
  } finally {
    await page.close();
  }
}

for (let i = 0; i < sites.length; i++) {
  const site = sites[i];
  process.stdout.write(`→ ${site.slug.padEnd(18)} `);
  try {
    await captureOnce(site);
    console.log('ok');
  } catch (e) {
    // One retry after a longer pause to ride out transient edge blocks.
    console.log(`retry (${e.message})`);
    await new Promise(r => setTimeout(r, 15000));
    try {
      await captureOnce(site);
      console.log(`  retry → ok`);
    } catch (e2) {
      console.log(`  retry FAILED — ${e2.message}`);
      failed.push({ slug: site.slug, error: e2.message });
    }
  }
  if (i < sites.length - 1) await new Promise(r => setTimeout(r, PACE_MS));
}

await browser.close();

if (failed.length) {
  console.error('\nFailures:');
  for (const f of failed) console.error(`  ${f.slug}: ${f.error}`);
  process.exit(1);
}

console.log('\nAll screenshots captured.');
