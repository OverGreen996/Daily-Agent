import fs from 'node:fs';
import path from 'node:path';
import {parseMemoryCommand,memoryCommand} from './MemoryCommands.js';
export function parseConversationControl(text) {
  const share=text.trim().match(/^(?:請)?分享資料夾\s+(.+)$/s);
  if(share)return {action:'remote_share',folder:share[1].replace(/^"(.*)"$/,'$1')};
  const memory=parseMemoryCommand(text);if(memory)return memory;
  if(/^(?:請)?(?:看看我在做什麼|看一下畫面|看看目前畫面)[。？?！!]*$/.test(text.trim()))return {action:'screen_observe'};
  const s = text.trim().replace(/[，,。！!？?\s]/g, '').replace(/^請/, '');
  if(/^(查看|顯示)行事曆$/.test(s))return {action:'calendar_list'};
  if(/^(開啟|關閉)行事曆提醒$/.test(s))return {action:'calendar_toggle',value:s.startsWith('開啟')};
  if(s==='清除行事曆')return {action:'calendar_clear'};
  if(s==='開啟手機配對')return {action:'phone_pair'};
  if(s==='開啟手機位置配對')return {action:'phone_location_pair'};
  if(s==='開啟Cloudflare連線')return {action:'remote_connect'};
  if(s==='關閉手機連線')return {action:'remote_close'};
  if(s==='查看共享資料夾')return {action:'remote_folders'};
  if(s==='停止分享資料夾')return {action:'remote_unshare'};
  if(/^(關閉手機配對|解除手機配對)$/.test(s))return {action:'phone_revoke'};
  if(s==='查看手機連線')return {action:'phone_status'};
  if(/^(使用手機位置|使用電腦位置)$/.test(s))return {action:'phone_device',device:s.includes('手機')?'android':'pc'};
  if (/^(?:進入待機|讓(?:小日|露米)休息|休息一下)$/.test(s)) return { action: 'idle' };
  if (/^(?:查看|顯示|看看)(?:目前)?狀態$/.test(s)) return { action: 'status' };
  if (/^(?:查看|顯示|看看)搜尋狀態$/.test(s)) return { action:'search_status' };
  if (/^(?:查看|打開|看看)記憶宮殿$/.test(s)) return { action: 'memory' };
  const toggle = s.match(/^(開啟|恢復|關閉|停止)(天氣提醒|天氣通知|環境觀察|陌生軟體查詢|畫面觀察|定時畫面觀察|高階畫面觀察|記憶閒聊)$/);
  if (toggle) return { action: 'setting', key: ({ 天氣提醒:'weatherEnabled', 天氣通知:'weatherEnabled', 環境觀察:'perception', 陌生軟體查詢:'lightLookup',畫面觀察:'lightPerception',定時畫面觀察:'lightPerception',高階畫面觀察:'screenVision',記憶閒聊:'memoryCompanion' })[toggle[2]],
    value: /開啟|恢復/.test(toggle[1]), label: toggle[2] };
  if (/^(?:不要|別)主動(?:提醒天氣|通知天氣)$/.test(s)) return { action:'setting', key:'weatherEnabled', value:false, label:'天氣提醒' };
  const interval = s.match(/^(?:把)?天氣(?:更新|提醒)間隔(?:改成|設成|設定為)(10|15|20|十|十五|二十)分鐘$/);
  if (interval) return { action:'setting', key:'weatherRefreshMs', value:(Number(interval[1]) || ({十:10,十五:15,二十:20})[interval[1]])*60000, label:'天氣更新間隔' };
  return null;
}
export async function conversationControl(agent, text, command,request={}) {
  agent.states.touch(); agent.companion.boredom.respond();
  return agent.exclusive(async () => {
    let content;
    const calendar=agent.companion.calendar;
    if(command.action==='phone_location_pair'){const p=await agent.companion.phone.start();content=`舊版位置分享頁（僅同一網路）：\n${p.urls.join('\n')}\n配對碼：${p.code}（五分鐘有效）。這個頁面只分享位置，沒有 App 聊天功能。`;agent.bus.publish('pet_bubble',{text:content,activity:'rest'},{transient:true});return {content};}
    if(command.action==='phone_pair'){
      await agent.remote.gateway.start();const p=agent.remote.devices.begin();
      const url=agent.remote.tunnel.status().url;
      content=`App 配對碼：${p.code}（五分鐘、一次有效）。\n${url?'連線網址：'+url:'手機入口已在電腦啟動。說「開啟 Cloudflare 連線」取得測試網址。'}\n此配對入口供原生手機 App 使用，並非網頁聊天介面。`;
      agent.bus.publish('pet_bubble',{text:content,activity:'rest'},{transient:true});return {content};
    }
    if(command.action==='remote_connect'){const url=await agent.remote.tunnel.start();content=`Cloudflare 測試連線：${url}\nAndroid App 下載：${url}/download/android.apk\n說「開啟手機配對」取得一次性配對碼。App 第一次開啟會顯示配對畫面。測試網址會在重新連線後變更。`;}
    if(command.action==='remote_close'){agent.remote.tunnel.stop();await agent.remote.gateway.stop();content='手機連線已關閉；已配對裝置仍保留，之後可以重新連線。';}
    if(command.action==='remote_share')content='手機可讀資料夾已加入：'+await agent.remote.files.add(command.folder);
    if(command.action==='remote_unshare'){agent.remote.files.clear();content='已停止所有資料夾共享。';}
    if(command.action==='remote_folders')content='手機可讀資料夾：\n'+(agent.remote.files.roots.join('\n')||'尚未分享任何資料夾。');
    if(command.action==='phone_revoke'){
      agent.remote.tunnel.stop();await agent.remote.gateway.stop();for(const d of agent.remote.devices.list())agent.remote.notifications.disconnect(d.id);agent.remote.devices.revokeAll();agent.mobileImageSessions?.clear();
      await agent.companion.phone.close();content='手機 App 與舊版位置配對已全部解除，連線已關閉。';
    }
    if(command.action==='phone_status'){const s=agent.remote.tunnel.status();content=`手機入口：${agent.remote.gateway.server?'已啟動':'已關閉'}\nCloudflare：${s.url||s.error||'未連線'}\n已配對：${agent.remote.devices.list().map(d=>d.name).join('、')||'無'}`;}
    if(command.action==='phone_device'){agent.companion.location.setActiveDevice(command.device);content=`改用${command.device==='pc'?'電腦':'手機'}位置；手機位置未更新時會直接告知，不會改用家中電腦。`;}
    if(command.action.startsWith('phone_')){agent.companion.weather.nextRefresh=0;agent.companion.weather.state=null;agent.companion.weather.engine.reset();}
    if(command.action==='calendar_import'){const count=await calendar.import(command.name,command.text);content=`已匯入 ${command.name}，未來 90 天共有 ${count} 筆行程。提醒${calendar.state.enabled?'開啟':'關閉'}；說「開啟行事曆提醒」可在行程前 15 分鐘提醒。`;}
    if(command.action==='calendar_list')content='未來七天的行程：\n'+(calendar.upcoming().map(e=>`${new Date(e.start).toLocaleString('zh-TW')} ${e.title}${e.allDay?'（全天；僅列示）':''}`).join('\n')||'沒有行程。拖入 .ics 可匯入。');
    if(command.action==='calendar_toggle'){calendar.enable(command.value);content=`行事曆提醒已${command.value?'開啟':'關閉'}。`;}
    if(command.action==='calendar_clear'){calendar.clear();agent.companion.pending.delete('CALENDAR_EVENT');content='已清除匯入的行事曆並關閉提醒。';}
    if(command.action==='screen_observe'){
      try{const result=await agent.companion.lightPerception.observe(agent.perception.snapshot(),{force:true});content=result.skipped?result.reason:`前景程式：${result.process}\n低解析度 OCR 看到的文字（可能誤讀）：\n${result.text||'未辨識到文字。'}`;}catch(e){content='這次無法觀察畫面：'+e.message;}
    }
    if(command.action.startsWith('pins_'))content=memoryCommand(agent.memory.pins,command);
    if (command.action === 'idle') { await agent.enterIdle(); content='好，我會安靜陪著你。有問題直接跟我說。'; }
    if (command.action === 'status') {
      const s = await agent.status();
      content = `目前是 ${s.state}。模型 VRAM 約 ${(s.models?.reduce((n,m)=>n+m.size_vram,0)/1048576||0).toFixed(0)} MiB，記憶書籍 ${s.books} 本。天氣提醒${s.settings.weatherEnabled?'開啟':'關閉'}，每 ${s.settings.weatherRefreshMs/60000} 分鐘更新。`;
    }
    if (command.action === 'memory') {
      const pins=agent.memory.pins.all().slice(0,12).map(p=>'・['+p.id.slice(0,8)+'] '+p.text).join('\n');
      const books=agent.memory.books.all().slice(0,6).map(b=>'・'+b.summary).join('\n');
      content=`記憶宮殿\n${pins || '還沒有永久記憶。'}\n\n最近的書\n${books || '還沒有整理成書的舊對話。'}`;
    }
    if (command.action === 'search_status') {
      const s=await agent.status();
      content=`一般搜尋：${s.search.provider}。\n陌生軟體查詢：${s.idleSearch.provider}，${s.settings.lightLookup && s.settings.perception ? '已啟用' : '目前關閉'}。\n${s.search.paid===false ? '目前一般搜尋不使用付費 API。' : '一般搜尋依目前供應者設定執行。'}\n查過的軟體會保存在記憶；網站要求驗證時會略過，不把驗證頁當答案。`;
    }
    if (command.action === 'setting') {
      agent.config[command.key]=command.value;
      if(command.key==='screenVision'&&command.value)agent.config.lightPerception=true;
      if(['screenVision','lightPerception','perception'].includes(command.key)&&!command.value){agent.companion.lightPerception?.vision?.cancel();agent.companion.pending.delete('SCREEN_ACTIVITY');}
      if (command.key==='perception') command.value ? agent.perception.start() : agent.perception.close();
      if (command.key==='weatherEnabled' || command.key==='weatherRefreshMs') {
        agent.companion.weather.nextRefresh=0;
        if(command.value===false) for (const [key,e] of agent.companion.pending) if(e.data.forecast) agent.companion.pending.delete(key);
      }
      const settings=Object.fromEntries(['perception','lightLookup','weatherEnabled','weatherRefreshMs','lightPerception','memoryCompanion','screenVision'].map(k=>[k,agent.config[k]]));
      const file=path.join(agent.config.dataDir,'environment-settings.json');
      fs.writeFileSync(file+'.tmp',JSON.stringify(settings)); fs.renameSync(file+'.tmp',file);
      content=command.key==='weatherRefreshMs' ? `好，天氣改成每 ${command.value/60000} 分鐘更新；有值得提醒的變化才說。` : `好，${command.label}已${command.value?'開啟':'關閉'}。`;
    }
    agent.memory.working.add('user',text,'對話操作');
    agent.memory.working.add('assistant',content,'對話操作',{idle:agent.states.state==='IDLE'});
    agent.bus.publish('pet_bubble',{text:content,target_device:request.deviceId,emotion:'gentle',activity:'rest',idle:agent.states.state==='IDLE'});
    return {content};
  });
}
