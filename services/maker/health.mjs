// Health probes never allocate quote nonces, sign, cancel or move funds.
export function workerHealth({initialized,paused,retired,pendingCancellation}) {
 return {ready:!!initialized&&!paused&&!retired&&!pendingCancellation,
  reason:!initialized?'NOT_INITIALIZED':retired?'MAKER_WITHDRAWN':pendingCancellation?'CANCELLATION_UNRESOLVED':paused?'MAKER_MAINTENANCE':null};
}
export function startMakerHealth(makers,{interval=30000,now=()=>new Date().toISOString()}={}) {
 let stopped=false,timer,running;
 const poll=()=>{running=Promise.all(makers.map(async m=>{
  try{const h=await m.ask('health',{});m.health={checked_at:now(),ready:h.ready===true,reason:h.reason};}
  catch{m.health={checked_at:now(),ready:false,reason:'MAKER_HEALTH_UNAVAILABLE'};}
 })).finally(()=>{if(!stopped)timer=setTimeout(poll,interval);});};
 poll();return {stop:async()=>{stopped=true;clearTimeout(timer);await running;}};
}
