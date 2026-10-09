(function(root){
  function dayAt(zone,now=new Date()){
    const parts=new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get=type=>parts.find(p=>p.type===type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function addDays(day,n){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
  function occurs(task,day){
    if(day<task.date)return false;
    return task.repeat==='once'?day===task.date:task.repeat==='daily'||task.days.includes((new Date(day+'T12:00:00Z').getUTCDay()+6)%7);
  }
  function next(task,done,now=new Date()){
    if(task.repeat==='once')return done[task.id+'|'+task.date]?null:task.date;
    let day=[dayAt(task.timezone,now),task.date].sort().pop();
    for(let i=0;i<37000&&day<='2100-12-31';i++,day=addDays(day,1)){
      if(occurs(task,day)&&!done[task.id+'|'+day])return day;
    }
    return null;
  }
  function lists(tasks,done,now=new Date()){
    const active=[],missed=[],completed=[],byId=new Map(tasks.map(t=>[t.id,t]));
    for(const task of tasks){
      const today=dayAt(task.timezone,now),time=new Intl.DateTimeFormat('en-GB',{timeZone:task.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
      const past=day=>day<today||(day===today&&task.time<time);
      let day=next(task,done,now);
      if(day&&past(day))day=task.repeat==='once'?null:next({...task,date:[task.date,addDays(today,1)].sort().pop()},done,now);
      if(day)active.push({task,day,status:'active'});
      let found=0;
      for(let d=task.repeat==='once'?task.date:today;d>=task.date;d=addDays(d,-1)){
        if(past(d)&&occurs(task,d)&&!done[task.id+'|'+d]){missed.push({task,day:d,status:'missed'});if(++found===100)break;}
        if(task.repeat==='once')break;
      }
    }
    for(const [key,stamp] of Object.entries(done)){const [id,day]=key.split('|'),task=byId.get(id);if(task)completed.push({task,day,status:'done',stamp});}
    active.sort((a,b)=>(a.day+a.task.time).localeCompare(b.day+b.task.time));
    missed.sort((a,b)=>(b.day+b.task.time).localeCompare(a.day+a.task.time));
    completed.sort((a,b)=>b.stamp.localeCompare(a.stamp));
    return {active,missed:missed.slice(0,100),done:completed.slice(0,100)};
  }
  const api={dayAt,addDays,occurs,next,lists};root.TaskSchedule=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
