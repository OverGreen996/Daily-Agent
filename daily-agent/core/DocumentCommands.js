export function parseDocumentCommand(text){
  const s=text.trim().replace(/^請\s*/,'');let m;
  if((m=s.match(/^(?:查看|顯示|看看)(?:我的)?文件庫(?:第\s*(\d+)\s*頁)?[。！!]?$/)))return {action:'list',page:Math.min(100000,Math.max(1,Number(m[1]||1)))};
  if((m=s.match(/^(?:搜尋|查找)文件[：:]\s*(.{1,300})$/s)))return {action:'search',query:m[1].trim()};
  if((m=s.match(/^語意搜尋文件[：:]\s*(.{1,300})$/s)))return {action:'semantic',query:m[1].trim()};
  if((m=s.match(/^比較文件\s+(.+?)[：:]\s*(.{1,3000})$/s)))return {action:'compare',references:m[1].split(/[、,，]/).map(x=>x.trim()),question:m[2]};
  if((m=s.match(/^(?:使用|切換|讀取)文件(?:\s*[：:]\s*|\s+)(.{1,200})$/)))return {action:'select',reference:m[1]};
  if((m=s.match(/^詢問文件\s+(.{1,200}?)[：:]\s*(.{1,5000})$/s)))return {action:'ask',reference:m[1],question:m[2]};
  if(/^(?:查看)?目前文件[。！!]?$/i.test(s))return {action:'current'};
  if(/^(?:結束文件閱讀|收起文件)[。！!]?$/i.test(s))return {action:'clear'};
  return null;
}
export function isDocumentFollowup(text){
  return /這份(?:文件|PDF|報告|資料|合約)|這個文件|目前(?:的)?文件|上傳的(?:文件|PDF)|第\s*\d+\s*頁|^文件(?:中|裡|內|的|第)/i.test(text)
    || /^(?:請|幫我)?(?:完整|重新)?(?:摘要|總結)(?:這份文件|文件|PDF|一下)?[。！!]?\s*$/i.test(text);
}
const label=r=>`[${r.id.slice(0,12)}] ${r.name}`;
export async function documentCommand(agent,text,command,request={}){
  agent.states.touch();agent.companion.boredom.respond();
  return agent.exclusive(async()=>{
    const store=agent.documents,library=store.library;let content;
    try{
      if(command.action==='list'){
        const result=await library.list(command.page);
        content=`文件庫，第 ${result.page} 頁（共 ${result.total} 份）\n`+(result.items.map(r=>`${label(r)} · ${r.pages} 頁`).join('\n')||'這一頁沒有文件。')+'\n\n說「使用文件 編號」後即可提問；或說「搜尋文件：關鍵字」。';
        if(result.warnings.length)content+='\n部分文件索引無法讀取：'+result.warnings.join('、');
      }
      if(command.action==='search' || command.action==='semantic'){
        const result=command.action==='semantic'?await library.semanticSearch(command.query,{onProgress:data=>agent.bus.publish('document_progress',data,{transient:true})}):await library.search(command.query);
        content=result.items.map(r=>`${label(r)} · ${r.format==='pdf'?'第 '+r.page+' 頁':'字元 '+(r.start+1)+'–'+r.end}\n${r.text.replace(/\s+/g,' ').slice(0,180)}`).join('\n\n')||'沒有找到符合的文件文字。可換較短的關鍵字或檔名。';
        if(result.warnings.length)content+='\n部分文件索引無法讀取：'+result.warnings.join('、');
        if(result.indexIncomplete)content+='\n本次新增 200 段語意索引，尚有文件未索引。再次搜尋會接著建立。';
      }
      if(command.action==='select'){
        const row=await library.resolve(command.reference);await library.select(row.id);
        content=`已選用 ${label(row)}。可以直接說「這份文件的重點是什麼？」或「幫我完整摘要」。`;
      }
      if(command.action==='current'){
        const id=await library.current(),doc=id?await store.get(id):null;
        content=doc?`目前文件：${label(doc)}。`:'目前沒有選用文件。可以說「查看文件庫」。';
      }
      if(command.action==='clear'){await library.select(null);content='已結束這份文件的閱讀，原始文件與摘要仍保留在文件庫。';}
    }catch(e){content=e.message;}
    agent.memory.working.add('user',text,'文件庫');
    agent.memory.working.add('assistant',content,'文件庫');
    agent.bus.publish('pet_bubble',{text:content,target_device:request.deviceId,emotion:'gentle',activity:'rest',idle:agent.states.state==='IDLE'});
    return {content};
  });
}
