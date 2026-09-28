const token=document.querySelector('meta[name="daily-token"]').content,books=document.querySelector('#books'),pins=document.querySelector('#pins'),detail=document.querySelector('#detail'),status=document.querySelector('#status');
let page=1,query='',book=null,offset=0,next=null;
const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
async function api(route){const r=await fetch('/api/palace'+route,{headers:{'x-daily-token':token}});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
async function show(){try{
  books.replaceChildren();pins.replaceChildren();detail.replaceChildren();
  if(book){const b=await api('/book?id='+encodeURIComponent(book)+'&offset='+offset);if(!b)throw Error('找不到書籍。');next=b.next;status.textContent=`原始對話 ${offset+1}–${Math.min(offset+6000,b.total)} / ${b.total} 字元。輸入「下一頁」繼續，或「回宮殿」。`;detail.append(node('h2',b.summary),node('pre',b.raw));for(const c of b.cards)detail.append(node('p','記憶卡：'+c.summary));return;}
  const data=await api('?q='+encodeURIComponent(query)+'&page='+page);status.textContent=`共 ${data.total} 本書 · 第 ${page} 頁。${data.conflicts.length?'有 '+data.conflicts.length+' 項待確認的記憶衝突，請對桌寵說「查看記憶衝突」。':''}`;
  for(const p of data.pins)pins.append(node('span',p.text,'pin'));
  const names={name:'姓名',nickname:'稱呼',occupation:'工作',interest:'興趣',reply:'回覆偏好'};
  pins.append(node('h2','關於你'));
  for(const p of data.profile||[])pins.append(node('p',p.key.startsWith('likes:')?(p.value==='yes'?'喜歡：':'不喜歡：')+p.key.slice(6):(names[p.key]||p.key)+'：'+p.value));
  if(!data.profile?.length)pins.append(node('p','尚無個人資料。對桌寵說「我叫…」「我的工作是…」「我喜歡…」即可記錄。'));
  pins.append(node('h2','行程記憶'+(data.timeZone?' · '+data.timeZone:'')));
  for(const e of data.schedule||[])pins.append(node('p',`[${e.id.slice(0,8)}] ${e.day} ${e.time||e.period||'時間未定'}　${e.title}`));
  if(!data.schedule?.length)pins.append(node('p','尚無行程。可說「明天下午三點要開會」，再問「明天要幹嘛」。'));
  pins.append(node('h2','助理記事'));
  for(const r of data.organizer||[])pins.append(node('p',({task:'待辦',project:'專案',meeting:'會議',habit:'習慣'}[r.kind]||r.kind)+' ['+r.id.slice(0,8)+'] '+(r.day||'')+' '+(r.time||'')+' '+r.title+(r.body?'：'+r.body:'')));
  for(const b of data.books){const a=node('a','','book');a.href='#'+b.book_id;a.append(node('small',new Date(b.created_at).toLocaleDateString('zh-TW')),node('div',b.summary));a.addEventListener('click',e=>{e.preventDefault();book=b.book_id;offset=0;show();});books.append(a);}
  if(!data.books.length)books.append(node('p','尚無符合的書籍。舊話題在整理後會出現在這裡。'));
}catch(e){status.textContent=e.message;}}
document.querySelector('#query').addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#input'),text=input.value.trim();input.value='';if(text==='回宮殿'){book=null;page=1;}else if(text==='下一頁'){if(book){if(next===null)return;offset=next;}else page++;}else if(text==='上一頁'){if(book)offset=Math.max(0,offset-6000);else page=Math.max(1,page-1);}else{book=null;query=text;page=1;}show();});show();
