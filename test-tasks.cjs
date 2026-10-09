const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const schedule=require('./dist/tasks/schedule.js');
const task={id:'a',date:'2026-09-30',time:'09:00',repeat:'once',days:[2,4],timezone:'Asia/Dubai'};
const now=new Date('2026-09-30T05:00:20Z');
assert.equal(schedule.next(task,{},now),'2026-09-30');
assert.equal(schedule.next(task,{'a|2026-09-30':'done'},now),null);
assert.equal(schedule.next({...task,repeat:'daily'},{'a|2026-09-30':'done'},now),'2026-10-01');
assert.equal(schedule.next({...task,repeat:'weekly'},{'a|2026-09-30':'done'},now),'2026-10-02');
assert.equal(schedule.next({...task,date:'2026-09-29'}, {}, now),'2026-09-29');
assert.equal(schedule.dayAt('Asia/Dubai',new Date('2026-09-30T21:00:00Z')),'2026-10-01');
assert.equal(schedule.addDays('2028-02-28',1),'2028-02-29');
const events={},calls=[];let pending;
const self={location:{origin:'https://test.local'},addEventListener:(name,fn)=>events[name]=fn,clients:{matchAll:async()=>[],openWindow:async url=>calls.push(url)},registration:{showNotification:async(title,options)=>calls.push(options.data.url)}};
vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{self,URL});
(async()=>{
  for(const [input,target] of [['/tasks/?task=a','/tasks/?task=a'],['https://evil.test/tasks/','/vovrema/'],['/api/logout','/vovrema/'],[undefined,'/vovrema/']]){
    events.push({data:{json:()=>({url:input})},waitUntil:p=>pending=p});await pending;assert.equal(calls.pop(),target);
    events.notificationclick({notification:{data:{url:input},close(){}},waitUntil:p=>pending=p});await pending;assert.equal(calls.pop(),target);
  }
  console.log('PASS: task recurrence, completion, timezone dates and safe notification routing');
})().catch(error=>{console.error(error);process.exitCode=1});

const viewNow=new Date('2026-10-09T08:00:00Z');
const daily={...task,id:'daily',repeat:'daily',date:'2026-10-07',time:'09:00'};
let views=schedule.lists([daily],{'daily|2026-10-08':'2026-10-08T06:00:00Z'},viewNow);
assert.equal(views.active[0].day,'2026-10-10');
assert.deepEqual(views.missed.map(x=>x.day),['2026-10-09','2026-10-07']);
assert.equal(views.done[0].day,'2026-10-08');
views=schedule.lists([{...task,date:'2026-10-09',time:'12:00'}],{},viewNow);
assert.equal(views.active.length,1);assert.equal(views.missed.length,0);
views=schedule.lists([{...task,date:'2026-10-08'}],{},viewNow);
assert.equal(views.active.length,0);assert.equal(views.missed.length,1);
views=schedule.lists([{...daily,date:'2020-01-01'}],{},viewNow);
assert.equal(views.missed.length,100);
views=schedule.lists([{...task,date:'2026-10-09',timezone:'America/Los_Angeles',time:'09:00'}],{},viewNow);
assert.equal(views.active.length,1);assert.equal(views.missed.length,0);
console.log('PASS: task views distinguish upcoming, missed occurrences, completed and per-record timezones');
