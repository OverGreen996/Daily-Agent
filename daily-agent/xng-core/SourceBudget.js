export function sourceBudget(mode='normal',limit,sourceLimit){
 const cap=mode==='fast'?3:10,defaultCount=mode==='fast'?3:mode==='deep'?10:5;
 const returned=Math.max(1,Math.min(cap,Math.floor(Number(limit)||defaultCount)));
 const collected=Math.max(returned,Math.min(cap,Math.floor(Number(sourceLimit)||defaultCount)));
 return {returned,collected};
}
