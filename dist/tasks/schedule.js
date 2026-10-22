(function(root){
  const LAST='2100-12-31';
  function dayAt(zone,now=new Date()){
    const parts=new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get=type=>parts.find(p=>p.type===type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function addDays(day,n){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
  function occurs(task,day){
    if(day<task.date)return false;
    if(task.repeat==='once')return day===task.date;
    if(task.repeat==='daily')return true;
    if(task.repeat==='interval')return Math.round((new Date(day+'T12:00:00Z')-new Date(task.date+'T12:00:00Z'))/86400000)%task.interval===0;
    return task.repeat==='weekly'&&task.days.includes((new Date(day+'T12:00:00Z').getUTCDay()+6)%7);
  }
  function event(task,day,status){const target=task.shifts?.[day];return {task,day,date:target?.date||day,time:target?.time||task.time,status};}
  function compare(a,b){return (a.date+a.time).localeCompare(b.date+b.time)||a.day.localeCompare(b.day);}
  function next(task,done,now=new Date()){
    const today=dayAt(task.timezone,now),candidates=[];
    for(const day of Object.keys(task.shifts||{}))if(occurs(task,day)&&!done[task.id+'|'+day]){
      const item=event(task,day);if(item.date>=today||task.repeat==='once')candidates.push(item);
    }
    for(let day=task.repeat==='once'?task.date:[today,task.date].sort().pop();day<=LAST;day=addDays(day,1)){
      if(occurs(task,day)&&!task.shifts?.[day]&&!done[task.id+'|'+day]){candidates.push(event(task,day));break;}
      if(task.repeat==='once')break;
    }
    return candidates.sort(compare)[0]?.day||null;
  }
  function lists(tasks,done,now=new Date(),period='any'){
    const active=[],missed=[],completed=[],byId=new Map(tasks.map(t=>[t.id,t]));
    for(const task of tasks){
      const today=dayAt(task.timezone,now),time=new Intl.DateTimeFormat('en-GB',{timeZone:task.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
      const past=item=>item.date<today||(item.date===today&&item.time<time);
      // A moved event keeps its original day as its completion identity.
      for(const day of Object.keys(task.shifts||{}))if(occurs(task,day)&&!done[task.id+'|'+day]){
        const item=event(task,day);item.status=past(item)?'missed':'active';(past(item)?missed:active).push(item);
      }
      for(let day=task.repeat==='once'?task.date:[today,task.date].sort().pop();day<=LAST;day=addDays(day,1)){
        const item=event(task,day,'active');
        if(occurs(task,day)&&!task.shifts?.[day]&&!done[task.id+'|'+day]&&!past(item)){active.push(item);break;}
        if(task.repeat==='once')break;
      }
      let found=0;
      for(let day=task.repeat==='once'?task.date:today;day>=task.date;day=addDays(day,-1)){
        const item=event(task,day,'missed');
        if(!task.shifts?.[day]&&past(item)&&occurs(task,day)&&!done[task.id+'|'+day]){missed.push(item);if(++found===100)break;}
        if(task.repeat==='once')break;
      }
    }
    for(const [key,stamp] of Object.entries(done)){const [id,day]=key.split('|'),task=byId.get(id);if(task)completed.push({...event(task,day,'done'),stamp});}
    active.sort(compare);missed.sort((a,b)=>compare(b,a));completed.sort((a,b)=>b.stamp.localeCompare(a.stamp));
    const inPeriod=item=>period!=='today'||item.date===dayAt(item.task.timezone,now);
    return {active:active.filter(inPeriod),missed:missed.filter(inPeriod).slice(0,100),done:completed.filter(inPeriod).slice(0,100)};
  }
  const api={dayAt,addDays,occurs,next,lists,event};root.TaskSchedule=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
