export function parseMemoryCommand(text) {
  const s=text.trim().replace(/^請\s*/, '');
  let m;
  if(/^查看記憶衝突[。！!]*$/.test(s))return {action:'pins_conflicts'};
  if((m=s.match(/^(使用新記憶|保留舊記憶)\s+([a-f\d-]{8,36})$/i)))return {action:'pins_resolve',id:m[2],useNew:m[1]==='使用新記憶'};
  if((m=s.match(/^(?:查看|顯示|列出)永久記憶(?:\s*第\s*(\d+)\s*頁)?[。！!]?$/)))return {action:'pins_list',page:Number(m[1]||1)};
  if((m=s.match(/^(?:搜尋|查找)永久記憶\s*[:：]\s*(.+)$/s)))return {action:'pins_list',query:m[1]};
  if((m=s.match(/^記住(偏好|規則|決定)?\s*[:：]\s*(.*)$/s)))return {action:'pins_add',type:({偏好:'preference',規則:'rule',決定:'decision'})[m[1]]||'preference',text:m[2]};
  if((m=s.match(/^修改(?:永久)?記憶\s+([a-f\d-]{8,36})\s*[:：]\s*(.*)$/is)))return {action:'pins_update',id:m[1],text:m[2]};
  if((m=s.match(/^(?:刪除|移除)(?:永久)?記憶\s+([a-f\d-]{8,36})[。！!]?$/i)))return {action:'pins_remove',id:m[1]};
  return null;
}
export function memoryCommand(pins,command) {
  try {
    if(command.action==='pins_conflicts'){const rows=pins.conflicts.list();return rows.length?rows.map(r=>`[${r.id.slice(0,8)}] 待確認：${r.text}`).join('\n')+'\n說「使用新記憶 編號」或「保留舊記憶 編號」。':'目前沒有待確認的記憶衝突。';}
    if(command.action==='pins_resolve'){pins.conflicts.resolve(command.id,command.useNew,pins);return command.useNew?'已採用新記憶，舊版本保留在記憶變更紀錄。':'已保留舊記憶。';}
    if(command.action==='pins_list') {
      const r=pins.page(command.query,command.page);
      if(!r.total)return command.query?'沒有符合的永久記憶。':'目前沒有永久記憶。可以說「記住：我喜歡簡短回答」。';
      if(!r.rows.length)return `只有 ${r.pages} 頁，可以說「查看永久記憶第${r.pages}頁」。`;
      const labels={preference:'偏好',rule:'規則',decision:'決定'};
      return `永久記憶 · 第 ${r.page}/${r.pages} 頁，共 ${r.total} 條\n\n`+
        r.rows.map(p=>`[${p.id.slice(0,8)}] ${labels[p.type]||p.type}\n${p.text}`).join('\n\n')+
        '\n\n可說「修改記憶 編號：新內容」或「刪除記憶 編號」。刪除永久記憶不會刪除原始聊天。';
    }
    if(command.action==='pins_add') {const p=pins.save(command.text,command.type);return p.conflict?`這和既有記憶可能衝突，先保留原記憶。\n[${p.id.slice(0,8)}] 新內容：${p.text}\n請說「使用新記憶 ${p.id.slice(0,8)}」或「保留舊記憶 ${p.id.slice(0,8)}」。`:`記住了。[${p.id.slice(0,8)}]\n${p.text}`;}
    if(command.action==='pins_update') {const p=pins.update(command.id,command.text);return `已更新永久記憶 [${p.id.slice(0,8)}]：\n${p.text}`;}
    if(command.action==='pins_remove') {const p=pins.remove(command.id);return `已移除永久記憶 [${p.id.slice(0,8)}]。原始聊天仍保留。`;}
  }catch(e){return e.message;}
}
