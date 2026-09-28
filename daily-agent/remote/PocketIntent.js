const prefix='(?:(?:請你?|麻煩你?|幫我|替我|幫忙)\\s*){0,3}';
const verb='(?:傳送|分享|發送|傳|丟|送|發)(?:一下)?';
const destination='(?:到|至|給|去)\\s*(?:我的)?(?:手機(?:上)?|Pocket\\s*Drop)';
const front=new RegExp('^'+prefix+verb+'\\s*'+destination+'([\\s\\S]*)$','i');
const back=new RegExp('^'+prefix+'(?:把|將)\\s*([\\s\\S]+?)\\s*'+verb+'\\s*'+destination+'(?:一下|吧|喔|哦|謝謝)?[。！!]*$','i');
const reference=/^(?:這段(?:文字|內容|回答)?|這個回答|這則(?:回答)?|剛剛(?:那段|的回答|的內容)?|剛才(?:那段|的回答|的內容)?|上一則(?:回答)?|上面(?:那段|的內容)?|你的回答|內容)$/;
function payload(text){
  text=text.trim();
  if((text.startsWith('「')&&text.endsWith('」'))||(text.startsWith('『')&&text.endsWith('』'))||(text.startsWith('"')&&text.endsWith('"')))text=text.slice(1,-1);
  return {kind:'share',text};
}
function implicit(text){
  const body=text.trim().replace(/[。！!]+$/,'');
  if(reference.test(body))return {kind:'previous'};
  if(/^(?:這|那|剛剛的|上一|剛才的)?(?:張|個|份)?(?:圖片|圖|照片|檔案|文件|附件|剪貼簿)/.test(body))return {kind:'unsupported'};
  return payload(text);
}
export function parsePocketShare(text){
  let s=String(text).trim();
  // Polite requests are accepted only when the remaining sentence is a complete send command.
  if(/^(?:可以|能不能|可不可以)/.test(s)){
    s=s.replace(/^(?:可不可以|能不能|可以)\s*/,'');
    if(!/[：:\n]/.test(s))s=s.replace(/(?:嗎|么)?[？?]?$/,'');
  }
  let m=s.match(back);
  if(m)return implicit(m[1]);
  m=s.match(front);if(!m)return null;
  const tail=m[1];
  if(/^[：:\n]/.test(tail.trimStart()))return payload(tail.trimStart().replace(/^[：:\n]+/,''));
  if(/^\s*$/.test(tail)||/^(?:\s*(?:一下|吧|喔|哦|謝謝))?[。！!]*$/.test(tail))return {kind:'previous'};
  if(/^\s+\S/.test(tail)){
    const body=tail.trim().replace(/[。！!]+$/,'');if(reference.test(body))return {kind:'previous'};
    if(/^(?:的方法|的方法是|怎麼|怎樣|是什麼|可以嗎|嗎|呢|如何)/.test(body))return null;
    return implicit(tail);
  }
  return null;
}
