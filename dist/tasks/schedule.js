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
  const api={dayAt,addDays,occurs,next};root.TaskSchedule=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
