(function(root){
 'use strict';
 const tasks=typeof module!=='undefined'?require('../tasks/schedule.js'):root.TaskSchedule;
 const medicine=typeof module!=='undefined'?require('../schedule.js'):{scheduleEntries};
 const clock=(zone,now)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
 const query=(path,values)=>path+'?'+new URLSearchParams(values);
 function build(module,state,now=new Date(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone){
  const day=tasks.dayAt(zone,now),time=clock(zone,now);
  if(module==='tasks'){
   const rows=[];
   for(const task of state.tasks){
    const localDay=tasks.dayAt(task.timezone,now),localTime=clock(task.timezone,now);
    for(const original of new Set([localDay,...Object.keys(task.shifts||{})])){
     if(!tasks.occurs(task,original)||state.done[task.id+'|'+original])continue;
     const event=tasks.event(task,original);
     if(event.date!==localDay)continue;
     rows.push({id:task.id+'|'+original,title:task.title,meta:event.time+(event.time<localTime?' · Время прошло':'')+(task.timezone!==zone?' · '+task.timezone:''),order:minutes(event.time)-minutes(localTime),href:query('/tasks/',{task:task.id,occurrence:original})});
    }
   }
   return {tasks:rows.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))};
  }
  if(module==='state')return {medicine:medicine.scheduleEntries(state,day).filter(e=>!state.taken[e.key]&&!state.skipped?.[e.key]).map(e=>({id:e.key,title:e.med.name,meta:e.time+(e.med.dose?' · '+e.med.dose:'')+(e.time<time?' · Не отмечено':''),href:query('/vovrema/',{dose:e.key,date:day})}))};
  if(module==='gym'){
   const selected=state.days.find(d=>d.id===state.selected)||state.days[0];
   return {gym:selected?[{id:selected.id,title:selected.name,meta:'Выбранная тренировка · '+selected.exercises.length+' упр.',href:query('/gym/',{day:selected.id})}]:[]};
  }
  if(module==='food'){
   const recipes=new Map(state.recipes.map(r=>[r.id,r]));
   const menu=state.plans.filter(p=>p.date===day&&recipes.has(p.recipeId)).map(p=>({id:p.id,title:recipes.get(p.recipeId).name,meta:[recipes.get(p.recipeId).kind,p.servings+' порц.'].filter(Boolean).join(' · '),href:query('/food/',{plan:p.id})}));
   const expiry=state.stocks.flatMap(s=>{
    const lots=s.lots.filter(l=>l.quantity>0&&l.expiry&&l.expiry>=day&&l.expiry<=tasks.addDays(day,3)).sort((a,b)=>a.expiry.localeCompare(b.expiry));
    if(!lots.length)return [];
    const first=lots[0].expiry,amount=lots.filter(l=>l.expiry===first).reduce((sum,l)=>sum+l.quantity,0);
    return [{id:s.id,title:s.name,date:first,meta:(first===day?'Годен до сегодня':'До '+new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(first+'T12:00:00Z')))+' · '+new Intl.NumberFormat('ru',{maximumFractionDigits:2}).format(amount)+' '+s.unit,href:query('/food/',{stock:s.id})}];
   }).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
   return {menu,expiry};
  }
  return {};
 }
 root.HubTodayLogic={build};if(typeof module!=='undefined')module.exports={build};
})(typeof globalThis!=='undefined'?globalThis:this);
