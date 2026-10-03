// Compatibility only. Independent XNG owns all search implementation.
import {loadCore} from './SharedCore.js';
const {compactQuery,newsTopics,newsRelevant}=await loadCore('QueryText.js');
export {compactQuery,newsTopics,newsRelevant};
