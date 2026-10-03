// Compatibility only. Independent XNG owns all search implementation.
import {loadCore} from './SharedCore.js';
const {gateQualityWithFacts,crossCheckFacts}=await loadCore('SearchFacts.js');
export {gateQualityWithFacts,crossCheckFacts};
