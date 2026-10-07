const token=document.querySelector('meta[name="daily-token"]').content;
const $=id=>document.getElementById(id),labels={exa:'Exa Auto',tavily:'Tavily Basic',firecrawl:'Firecrawl Search'};
const links={exa:'https://dashboard.exa.ai/api-keys',tavily:'https://app.tavily.com',firecrawl:'https://www.firecrawl.dev/app/api-keys'};
const reasons={ready:'可使用',retry_ready:'冷卻或週期等待已結束；下次查詢先核對',missing_key:'尚未填入金鑰',disabled:'已停用',auth:'金鑰或權限錯誤',key_budget:'金鑰預算不足，需到後台確認',quota:'已到用量上限，等待重設',rate_limit:'頻率限制，冷卻中',timeout:'上次查詢逾時',unavailable:'供應商暫時不可用',invalid:'供應商回應格式異常',paid_plan:'偵測到付費方案或加值，免費模式已停用'};
let state,busy=false;
async function api(path,body){const r=await fetch('/api/modules/search'+path,{method:body===undefined?'GET':'POST',headers:{'x-daily-token':token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw Error(data.error||'無法連線');return data;}
function feedback(text,error=false){$('feedback').textContent=text;$('feedback').classList.toggle('error',error);if(error){$('feedback').tabIndex=-1;$('feedback').focus();}}
function el(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
function field(type,id,label,value){const l=el('label',label),i=el('input');i.type=type;i.id=id;if(type==='checkbox'){i.checked=!!value;l.className='toggle';l.prepend(i);}else{if(value!==undefined)i.value=value;l.append(i);}return {label:l,input:i};}
function collect(){return {settings:{enabled:$('enabled').checked,order:[...$('providers').children].map(e=>e.dataset.provider),timeoutMs:Number($('timeout').value)*1000,cooldownMs:Number($('cooldown').value)*1000,
  providers:Object.fromEntries(Object.keys(labels).map(id=>[id,{enabled:$(id+'-enabled').checked,cap:Number($(id+'-cap').value)}]))},keys:Object.fromEntries(Object.keys(labels).map(id=>[id,$(id+'-key').value])),clearKeys:Object.keys(labels).filter(id=>$(id+'-clear').checked)};}
function render(){
  $('enabled').checked=state.settings.enabled;$('timeout').value=state.settings.timeoutMs/1000;$('cooldown').value=state.settings.cooldownMs/1000;$('providers').replaceChildren();
  for(const [index,id] of state.settings.order.entries()){
    const s=state.providers.find(p=>p.id===id),p=state.settings.providers[id],card=el('article');card.dataset.provider=id;
    const head=el('div');head.className='heading';const n=el('span',String(index+1));n.className='number';head.append(n,el('h2',labels[id]));
    const moves=el('div');moves.className='actions reorder';head.append(moves);
    for(const [text,delta] of [['往前',-1],['往後',1]]){const b=el('button',text);b.type='button';b.className='move';b.setAttribute('aria-label',labels[id]+'順位'+text);b.disabled=index+delta<0||index+delta>2;
      b.onclick=()=>{const data=collect(),order=data.settings.order;[order[index],order[index+delta]]=[order[index+delta],order[index]];state.settings=data.settings;render();for(const x of Object.keys(labels)){$(x+'-key').value=data.keys[x];$(x+'-clear').checked=data.clearKeys.includes(x);}feedback('順位已調整，按「儲存設定」套用。');};moves.append(b);}
    card.append(head,field('checkbox',id+'-enabled','使用這家供應商',p.enabled).label);
    const grid=el('div');grid.className='grid';const key=field('password',id+'-key','API 金鑰');key.input.autocomplete='off';key.input.maxLength=512;key.input.placeholder=s.hasKey?'已保存；留空維持原金鑰':'貼上自己的 API 金鑰';
    const cap=field('number',id+'-cap','本期本機上限（'+s.unit+'）',p.cap);Object.assign(cap.input,{min:'0',max:id==='exa'?'9':'900',step:id==='exa'?'0.001':'1',required:true});grid.append(key.label,cap.label);card.append(grid);
    const status=el('p',`${reasons[s.reason]||s.reason} · 本機保留用量 ${Number(s.reservedUsage.toFixed(3))} / ${s.cap} ${s.unit}\n${s.officialRemaining===null?'官方餘額：尚未核對或不提供':`官方查詢後餘額（已扣本機保留）：${s.officialRemaining} credits`}${s.disabledUntil?'\n下次可檢查時間：'+new Date(s.disabledUntil).toLocaleString():''}`);status.className='status';card.append(status);
    const actions=el('div');actions.className='actions';const usage=el('button','核對官方用量');usage.type='button';usage.onclick=()=>run(async()=>{const result=await api('/usage',{provider:id});state=result.status;render();return result.message||'官方用量已核對。';});
    const link=el('a','取得金鑰 / 後台');link.href=links[id];link.target='_blank';link.rel='noopener noreferrer';actions.append(usage,link);card.append(actions,field('checkbox',id+'-clear','儲存時移除已保存的金鑰',false).label);
    if(id==='exa'&&s.reason==='key_budget'){const resume=el('button','已確認 Exa 預算恢復');resume.type='button';resume.onclick=()=>{if(confirm('已在 Exa 後台確認金鑰預算足夠、並關閉自動付費？這只解除停用，不會清除本機用量。'))run(async()=>{state=await api('/resume',{confirmed:true});render();return '已解除停用；下次搜尋再確認 Exa 可用性。';});};card.append(resume);}
    $('providers').append(card);
  }
}
async function run(work){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);feedback('處理中…');try{feedback(await work());}catch(e){feedback(e.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);[...$('providers').children].forEach((card,i)=>{const moves=card.querySelectorAll('.move');moves[0].disabled=i===0;moves[1].disabled=i===2;});}}
async function load(){state=await api('/settings');render();return state.configured?'已載入。儲存後立即生效，不需重啟。':'填入至少一家的金鑰，再儲存即可開始。';}
$('settings').onsubmit=e=>{e.preventDefault();run(async()=>{state=await api('/settings',collect());render();return '已儲存，立即生效。';});};$('reload').onclick=()=>run(load);run(load);
