// Compatibility only. Independent XNG owns all search implementation.
import {loadCore} from './SharedCore.js';
const {gameIdentityMatches,checkGameVersions}=await loadCore('GameVersionCheck.js');
export {gameIdentityMatches,checkGameVersions};
