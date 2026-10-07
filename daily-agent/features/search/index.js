import {BrowserAgent} from "../../browser/BrowserAgent.js";
import path from 'node:path';
import {SearchRouter} from '../../search/SearchRouter.js';
import {EvidenceReader} from '../../search/EvidenceReader.js';
import * as conversation from "./Conversation.js";
export function create({config,memory,bus}) {
  const unavailable={
    status(){return {provider:"disabled",configured:false,paid:false,state:"not_configured"};},
    async search(){throw Object.assign(Error("搜尋尚未設定，請設定搜尋 API；聊天、記憶與其他功能仍可使用。"),{code:"SEARCH_NOT_CONFIGURED"});},
    close(){}
  };
  const searchService=new SearchRouter({dir:config.searchDataDir||path.join(config.dataDir||path.join(process.cwd(),'data'),'search'),bus,reader:new EvidenceReader(),
    legacyKeys:{exa:config.searchKeys?.exa||'',tavily:config.searchKeys?.tavily||config.searchApiKey||'',firecrawl:config.searchKeys?.firecrawl||''}});
  const browser=new BrowserAgent({idleMs:config.browserIdleMs,searchService});
  // Background activity never creates a search engine or spends API quota.
  const idleBrowser=new BrowserAgent({idleMs:1000,searchService:unavailable});
  return {browser,idleBrowser,conversation,
    routes:[{method:"GET",path:"/",handle:()=>searchService.status()},
      {method:'GET',path:'/settings',handle:()=>searchService.status()},
      {method:'POST',path:'/settings',handle:data=>searchService.configure(data)},
      {method:'POST',path:'/usage',handle:data=>searchService.refreshUsage(data.provider)},
      {method:'POST',path:'/query',handle:data=>searchService.search(data.query,{limit:data.limit??3})},
      {method:'POST',path:'/resume',handle:data=>searchService.resumeExa(data.confirmed)}],
    async dispose(){await Promise.allSettled([browser.close(),idleBrowser.close()]);await searchService.close();}
  };
}
