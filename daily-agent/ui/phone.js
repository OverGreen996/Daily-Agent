let token=sessionStorage.getItem('daily-phone-token'),watch=null,lastSent=0;
const status=document.querySelector('#status'),input=document.querySelector('#input');
const api=async(route,data)=>{const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error);return result;};
function stop(){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;}
document.querySelector('#form').addEventListener('submit',async e=>{
  e.preventDefault();const text=input.value.trim();input.value='';
  try{
    if(/^\d{6}$/.test(text)){token=(await api('/pair',{code:text})).token;sessionStorage.setItem('daily-phone-token',token);status.textContent='配對完成。說「開始分享位置」後，允許瀏覽器的位置權限。';return;}
    if(text==='開始分享位置'){
      if(!token)throw Error('請先輸入配對碼。');if(!isSecureContext)throw Error('瀏覽器未信任此 HTTPS 連線，無法讀取位置。');stop();
      watch=navigator.geolocation.watchPosition(async p=>{if(Date.now()-lastSent<15000)return;lastSent=Date.now();try{await api('/location',{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy});status.textContent='已更新位置：'+new Date().toLocaleTimeString()+'。請保持此頁在前景，鎖屏後無法保證更新。';}catch(error){status.textContent=error.message;}},error=>status.textContent='無法取得位置：'+error.message,{enableHighAccuracy:false,maximumAge:60000,timeout:15000});return;
    }
    if(text==='停止分享位置'){stop();status.textContent='已停止更新，電腦端位置將在五分鐘後失效；說「解除配對」可立即清除。';return;}
    if(text==='解除配對'){stop();await api('/revoke',{});token=null;sessionStorage.removeItem('daily-phone-token');status.textContent='已解除配對並清除電腦端的位置。';return;}
    status.textContent='可輸入六位配對碼、開始分享位置、停止分享位置、解除配對。';
  }catch(error){status.textContent=error.message;}
});
window.addEventListener('pagehide',stop);
