// Compatibility only. Independent XNG owns all search implementation.
import {loadCore} from './SharedCore.js';
const {isPublicIP,safeUrl,assertReadablePage,PageExtractor,BrowserAgent}=await loadCore('BrowserAgent.js');
export {isPublicIP,safeUrl,assertReadablePage,PageExtractor,BrowserAgent};
