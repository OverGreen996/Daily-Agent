// README graphic exports only. Does not launch the Agent or modify runtime data.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

(async () => {
  const channel=process.env.DAILY_DOCS_BROWSER || (fs.existsSync(chromium.executablePath())?'chromium':'msedge');
  const browser = await chromium.launch({headless: true,channel});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:1500},deviceScaleFactor:2});
    await page.goto(pathToFileURL(path.join(__dirname,'readme-artboards.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete));
    // Explicitly wait for CSS background assets before exporting.
    await page.evaluate(async () => {
      await Promise.all([...new Set([...document.querySelectorAll('.sprite')].map(el => getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1]))].map(url => new Promise((resolve,reject) => {
        const image=new Image(); image.onload=resolve; image.onerror=reject; image.src=url;
      })));
    });
    for (const [id,file] of [['hero','readme-hero.jpg'],['hero-mobile','readme-hero-mobile.jpg'],['skins','readme-skins.jpg'],['skins-mobile','readme-skins-mobile.jpg']]) {
      const target=path.join(__dirname,'..','images',file);
      await page.locator('#'+id).screenshot({path:target,type:'jpeg',quality:88,animations:'disabled'});
      console.log(`${file}: ${fs.statSync(target).size} bytes`);
    }
    let card=0;
    const moduleMap=fs.readFileSync(path.join(__dirname,'..','images','readme-modules.svg'),'utf8')
      .replaceAll('width="1200" height="470"','width="640" height="1164"')
      .replace('viewBox="0 0 1200 470"','viewBox="0 0 640 1164"')
      .replaceAll('width="368"','width="576"')
      .replace(/transform="translate\((?:32|416|800) (?:103|276)\)"/g,()=>`transform="translate(32 ${103+173*card++})"`);
    if(card!==6)throw new Error('Expected six module cards');
    fs.writeFileSync(path.join(__dirname,'..','images','readme-modules-mobile.svg'),moduleMap);
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
