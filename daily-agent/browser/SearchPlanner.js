// Compatibility only. Independent XNG owns all search implementation.
import {loadCore} from './SharedCore.js';
const {inferIntent,planQueries,freshnessRange,preferredLanguage}=await loadCore('SearchPlanner.js');
export {inferIntent,planQueries,freshnessRange,preferredLanguage};
