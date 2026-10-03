// Compatibility only. Independent XNG owns all search implementation.
import {loadCore} from './SharedCore.js';
const {isGameQuery,isGameGuideQuery,gamePlan,gameEvidence}=await loadCore('GameSearch.js');
export {isGameQuery,isGameGuideQuery,gamePlan,gameEvidence};
