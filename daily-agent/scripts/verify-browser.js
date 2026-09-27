import {chromium} from 'playwright';
const browser=await chromium.launch({channel:process.env.DAILY_BROWSER_CHANNEL || 'msedge',headless:true});
await browser.close();
console.log('Browser launch verified');
