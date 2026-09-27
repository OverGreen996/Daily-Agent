// Decode the supplied WebP losslessly for the Windows GDI renderer. No artwork changes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'lumi');
const source = fs.readFileSync(path.join(dir, 'spritesheet.webp'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-gpu'] });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/webp;base64,' + data; await image.decode();
    if (image.width !== 1536 || image.height !== 2288) throw Error('Unexpected v2 atlas size');
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
    if (ctx.getImageData(0, 0, 1, 1).data[3] !== 0) throw Error('Expected transparent corner');
    return c.toDataURL('image/png').split(',')[1];
  }, source.toString('base64'));
  fs.writeFileSync(path.join(dir, 'spritesheet.png'), Buffer.from(result, 'base64'));
  console.log('Lumi atlas decoded: 1536x2288, alpha preserved.');
} finally { await browser.close(); }
