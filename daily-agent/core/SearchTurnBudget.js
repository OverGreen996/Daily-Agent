// Only conversation/search uses this gate. Images, documents and assistant actions bypass it.
export function searchTurnBudget(understanding,now=Date.now){
  let remaining=2,deadline=null;
  return {allowed:understanding?.needs_search===true,
    claim(){if(understanding?.needs_search!==true)throw Error('Qwen 判斷本次不需搜尋，未呼叫搜尋 API。');
      if(remaining<=0)throw Error('本次已達兩次搜尋上限，未再次呼叫 API。');
      if(deadline===null)deadline=now()+60000;
      if(now()>=deadline)throw Error('本次搜尋時限已結束，未再次呼叫 API。');
      remaining--;return remaining;}};
}
