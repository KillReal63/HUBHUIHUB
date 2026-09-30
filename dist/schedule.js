// Calendar days, independent of daylight-saving changes and device UTC offset.
function scheduledOn(med, date) {
  if (date < med.start || (med.end && date > med.end)) return false;
  const day = new Date(date + 'T00:00:00Z');
  if (med.cycle) {
    const elapsed = Math.round((day - new Date(med.start + 'T00:00:00Z')) / 86400000);
    return elapsed % (med.cycle.on + med.cycle.off) < med.cycle.on;
  }
  return med.days.includes(day.getUTCDay());
}
function courseEnd(start, days) { const date=new Date(start+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days-1);return date.toISOString().slice(0,10); }

// All shifts use local calendar minutes, not elapsed UTC hours across DST.
function moveMoment(moment, minutes) {
 const d=new Date(moment+':00Z');d.setUTCMinutes(d.getUTCMinutes()+minutes);return d.toISOString().slice(0,16);
}
function shiftedMoment(med, base, shifts=med.shifts||[]) {
 return moveMoment(base,shifts.reduce((n,s)=>n+(base>=s.from?s.minutes:0),0));
}
function scheduleEntries(state,date){
 const result=[],fixedByMed=new Map();
 for(const [key,moment] of Object.entries(state.fixed||{})){
  if(moment.slice(0,10)!==date)continue;const id=key.split('|')[1];
  if(!fixedByMed.has(id))fixedByMed.set(id,[]);fixedByMed.get(id).push(key);
 }
 for(const med of state.meds){
  const shifts=med.shifts||[],offsets=new Set([0]);let offset=0;
  for(const shift of [...shifts].sort((a,b)=>a.from.localeCompare(b.from))){offset+=shift.minutes;offsets.add(offset)}
  const dates=new Set([date]);
  for(const offset of offsets){dates.add(moveMoment(date+'T00:00',-offset).slice(0,10));dates.add(moveMoment(date+'T23:59',-offset).slice(0,10))}
  const seen=new Set();
  function add(baseDate,time){
   const key=`${baseDate}|${med.id}|${time}`;if(seen.has(key))return;seen.add(key);
   const base=baseDate+'T'+time,settled=state.taken[key]||state.skipped?.[key];
   const moment=settled?(state.fixed?.[key]||base):shiftedMoment(med,base);
   if(moment.slice(0,10)===date)result.push({med,key,base,moment,time:moment.slice(11),skipped:!!state.skipped?.[key]});
  }
  for(const baseDate of dates)if(scheduledOn(med,baseDate))for(const time of med.times)add(baseDate,time);
  for(const key of fixedByMed.get(med.id)||[]){const [baseDate,,time]=key.split('|');add(baseDate,time)}
 }
 return result.sort((a,b)=>a.time.localeCompare(b.time)||a.key.localeCompare(b.key));
}
function effectiveCourseEnd(med){
 if(!med.end||!med.times.length)return med.end;
 return shiftedMoment(med,med.end+'T'+[...med.times].sort().at(-1)).slice(0,10);
}
if(typeof module!=='undefined')module.exports={scheduledOn,courseEnd,moveMoment,shiftedMoment,scheduleEntries,effectiveCourseEnd};
