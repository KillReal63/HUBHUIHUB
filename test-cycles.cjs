const assert=require('node:assert/strict');
const {scheduledOn}=require('./dist/schedule.js');
const med={start:'2026-09-18',end:'',days:[0],cycle:{on:2,off:3}};
for(let n=-1;n<21;n++){
 const date=new Date(Date.UTC(2026,8,18+n)).toISOString().slice(0,10);
 assert.equal(scheduledOn(med,date),n>=0&&n%5<2,date);
}
assert.equal(scheduledOn({...med,end:'2026-09-19'},'2026-09-23'),false);
for(const start of ['2024-02-28','2026-03-07','2026-10-31','2026-12-31']){
 const m={...med,start,cycle:{on:1,off:1}};
 for(let n=0;n<8;n++)assert.equal(scheduledOn(m,new Date(Date.parse(start+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)),n%2===0);
}
assert.equal(scheduledOn({start:med.start,end:'',days:[5]},'2026-09-18'),true);
assert.equal(scheduledOn({start:med.start,end:'',days:[5]},'2026-09-19'),false);
console.log('PASS: intake/break boundaries, course bounds, leap day, DST dates, year boundary, weekly compatibility');

const {courseEnd}=require("./dist/schedule.js");
assert.equal(courseEnd("2024-02-28",3),"2024-03-01");
assert.equal(courseEnd("2026-12-31",1),"2026-12-31");
assert.equal(courseEnd("2026-03-07",3),"2026-03-09");
