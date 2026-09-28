const token=document.querySelector('meta[name="daily-token"]').content,status=document.querySelector('#status'),button=document.querySelector('#pair');
let invite=null;
async function api(route,data){const r=await fetch('/api/pocketdrop'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const value=await r.json();if(!r.ok)throw Error(value.error);return value;}
document.querySelector('#image').onchange=async e=>{
  invite=null;button.disabled=true;document.querySelector('#preview').textContent='';
  try{
    const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('圖片請小於 8 MB。');
    const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>24000000){bitmap.close();throw Error('圖片尺寸過大，請只截取 QR 區域。');}
    const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),qr=jsQR(pixels.data,pixels.width,pixels.height);
    if(!qr)throw Error('找不到 QR Code，請截取完整且清晰的 QR。');
    const q=JSON.parse(qr.data);if(q.app!=='PocketDrop'||q.protocol_version!==1)throw Error('這不是 PocketDrop 邀請。');
    invite=q;document.querySelector('#preview').textContent='即將連接：'+q.endpoint+'；Room：'+q.room_id;button.disabled=false;status.textContent='邀請五分鐘內有效且只能使用一次。';
  }catch(e){status.textContent=e instanceof SyntaxError?'QR 內容不是有效的邀請。':e.message;}
};
button.onclick=async()=>{button.disabled=true;try{const v=await api('/pair',{invite});invite=null;document.querySelector('#image').value='';status.textContent='已配對：'+v.room+'。可以在桌寵讀取共享文字。';}catch(e){status.textContent=e.message;}finally{button.disabled=!invite;}};
document.querySelector('#check').onclick=async()=>{try{const v=await api('/check',{});status.textContent='已連線：'+v.room+'；共享檔案 '+v.files+' 筆。';}catch(e){status.textContent=e.message;}};
document.querySelector('#disconnect').onclick=async()=>{try{status.textContent=(await api('/disconnect',{})).message;}catch(e){status.textContent=e.message;}};
api('').then(v=>status.textContent=v.paired?'已配對：'+v.room+'。按「檢查連線」驗證。':'尚未配對。').catch(e=>status.textContent=e.message);
