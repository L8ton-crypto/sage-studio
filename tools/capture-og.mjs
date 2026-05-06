// Generate a 1200x630 Open Graph preview image of silures.studio's hero.
// Run after deploying layout changes:
//   node tools/capture-og.mjs
//
// Output: og-image.png (committed and served from the site root).

import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const URL = process.argv[2] ?? 'https://silures.studio/';

// OG spec: 1200x630, 1.91:1. Capture at the same aspect ratio for sharpness.
const VIEWPORT = { width: 1280, height: 670 };
const OUTPUT   = { width: 1200, height: 630 };

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
  locale: 'en-GB',
});
const page = await context.newPage();

console.log(`→ Capturing OG image from ${URL}`);
await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'cb=' + Date.now(), {
  waitUntil: 'load',
  timeout: 45000,
});
await page.waitForTimeout(2500);

// Hide the floating WhatsApp pill so it doesn't sit on every share preview.
await page.addStyleTag({ content: '.wa-float { display: none !important; }' });
await page.waitForTimeout(200);

const tmpPath = join(root, 'og-image.tmp.png');
const finalPath = join(root, 'og-image.png');

await page.screenshot({ path: tmpPath, type: 'png', fullPage: false });
const buf = await readFile(tmpPath);
await sharp(buf)
  .resize(OUTPUT.width, OUTPUT.height, { fit: 'cover', position: 'top' })
  .png({ quality: 90, compressionLevel: 9 })
  .toFile(finalPath);
await unlink(tmpPath).catch(() => {});

await browser.close();
console.log(`OG image written → og-image.png`);
