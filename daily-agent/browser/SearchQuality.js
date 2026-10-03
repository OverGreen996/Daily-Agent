// Compatibility only. Independent XNG owns all search implementation.
import {loadCore} from './SharedCore.js';
const {isNewsQuery,isTodayQuery,hostOf,isDirectRetailUrl,sourceReliability,merchantKey,titleSimilarity,engineRoute,focusTerms,topicCoverage,rankSearchResults,assessSearchQuality}=await loadCore('SearchQuality.js');
export {isNewsQuery,isTodayQuery,hostOf,isDirectRetailUrl,sourceReliability,merchantKey,titleSimilarity,engineRoute,focusTerms,topicCoverage,rankSearchResults,assessSearchQuality};
