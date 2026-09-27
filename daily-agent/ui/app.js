const token=document.querySelector('meta[name=daily-token]').content;
const input=document.querySelector('#input'), bubble=document.querySelector('#bubble');
let fullText=bubble.textContent, busy=false, activity='rest', frame=0;
let replyId='',replyText='';
function say(text) {fullText=text;bubble.textContent=text;bubble.scrollTop=0}
async function send(text) {
  const command=text.replace(/[，,。！!？?\s]/g,'');
  if(/^(詳細|看詳細|查看詳細|展開對話|展開聊天)$/.test(command)){document.body.classList.add('expanded');say(fullText);return}
  if(/^(縮小對話|縮小聊天|回到泡泡)$/.test(command)){document.body.classList.remove('expanded');say(fullText);return}
  busy=true;input.disabled=true;activity='reading';bubble.textContent='讓我想想…';
  try {const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','x-daily-token':token},body:JSON.stringify({text})});const d=await r.json();if(!r.ok)throw Error(d.error);say(d.content)}
  catch(e){say('這次沒有完成：'+e.message)}finally{busy=false;input.disabled=false;activity='rest';input.focus()}
}
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!busy&&input.value.trim()){const text=input.value.trim();input.value='';send(text)}}});
const events=new EventSource('/api/events?token='+token);
events.onmessage=e=>{
  const d=JSON.parse(e.data);
  if(d.target_device)return;
  if(d.type==='reply_start'){replyId=d.stream_id;replyText='';bubble.textContent='讓我想想…'}
  if(d.type==='reply_delta'&&d.stream_id===replyId){
    const follow=bubble.scrollTop+bubble.clientHeight>=bubble.scrollHeight-4;
    replyText+=d.delta;bubble.textContent=replyText;if(follow)bubble.scrollTop=bubble.scrollHeight;
  }
  if(d.type==='reply_tool'&&d.stream_id===replyId)bubble.textContent='正在查找資料…';
  if(d.type==='reply_error'&&d.stream_id===replyId){replyId='';say('這次回覆中斷了，可以再問一次。')}
  if(d.type==='message'||d.type==='pet_bubble'){replyId='';say(d.content||d.text)}
  if(d.type==='pet_state')activity=d.activity;
};
const image=new Image();image.src='/lumi.webp';await image.decode();
const canvas=document.querySelector('#pet'),ctx=canvas.getContext('2d');
function render(){const row=activity==='reading'?7:activity==='weather_alert'?6:0;ctx.clearRect(0,0,192,208);ctx.drawImage(image,(frame%(row===0?7:6))*192,row*208,192,208,0,0,192,208);frame++}
render();setInterval(()=>{if(!document.hidden)render()},250);
