const token=document.querySelector('meta[name="daily-token"]').content,books=document.querySelector('#books'),pins=document.querySelector('#pins'),detail=document.querySelector('#detail'),status=document.querySelector('#status');
let page=1,query='',book=null,offset=0,next=null;
const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
async function api(route){const r=await fetch('/api/palace'+route,{headers:{'x-daily-token':token}});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
async function show(){try{
  books.replaceChildren();pins.replaceChildren();detail.replaceChildren();
  if(book){const b=await api('/book?id='+encodeURIComponent(book)+'&offset='+offset);if(!b)throw Error('找不到書籍。');next=b.next;status.textContent=`原始對話 ${offset+1}–${Math.min(offset+6000,b.total)} / ${b.total} 字元。輸入「下一頁」繼續，或「回宮殿」。`;detail.append(node('h2',b.summary),node('pre',b.raw));for(const c of b.cards)detail.append(node('p','記憶卡：'+c.summary));return;}
  const data=await api('?q='+encodeURIComponent(query)+'&page='+page);status.textContent=`共 ${data.total} 本書 · 第 ${page} 頁。${data.conflicts.length?'有 '+data.conflicts.length+' 項待確認的記憶衝突，請對桌寵說「查看記憶衝突」。':''}`;
  for(const p of data.pins)pins.append(node('span',p.text,'pin'));
  for(const b of data.books){const a=node('a','','book');a.href='#'+b.book_id;a.append(node('small',new Date(b.created_at).toLocaleDateString('zh-TW')),node('div',b.summary));a.addEventListener('click',e=>{e.preventDefault();book=b.book_id;offset=0;show();});books.append(a);}
  if(!data.books.length)books.append(node('p','尚無符合的書籍。舊話題在整理後會出現在這裡。'));
}catch(e){status.textContent=e.message;}}
document.querySelector('#query').addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#input'),text=input.value.trim();input.value='';if(text==='回宮殿'){book=null;page=1;}else if(text==='下一頁'){if(book){if(next===null)return;offset=next;}else page++;}else if(text==='上一頁'){if(book)offset=Math.max(0,offset-6000);else page=Math.max(1,page-1);}else{book=null;query=text;page=1;}show();});show();
