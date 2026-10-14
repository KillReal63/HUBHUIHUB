const assert=require('node:assert/strict');
const {scheduleEntries,shiftedMoment,effectiveCourseEnd}=require('./dist/schedule.js');
const med={id:'m',name:'Test',dose:'1',note:'',start:'2026-09-28',end:'2026-09-30',days:[0,1,2,3,4,5,6],times:['09:00','20:00'],shifts:[{from:'2026-09-29T09:00',minutes:1440,at:'2026-09-29T06:00:00Z'}]};
const state={meds:[med],taken:{'2026-09-29|m|09:00':'2026-09-29T05:00:00Z'},skipped:{},fixed:{}};
const compact=date=>scheduleEntries(state,date).map(x=>[x.key,x.moment]);
assert.deepEqual(compact('2026-09-29'),[['2026-09-29|m|09:00','2026-09-29T09:00']]);
assert.deepEqual(compact('2026-09-30'),[['2026-09-29|m|20:00','2026-09-30T20:00']]);
assert.equal(compact('2026-10-01').length,2);assert.equal(effectiveCourseEnd(med),'2026-10-01');
state.skipped['2026-09-29|m|20:00']='2026-09-30T16:00:00Z';state.fixed['2026-09-29|m|20:00']='2026-09-30T20:00';
med.shifts.push({from:'2026-09-29T20:00',minutes:300,at:'2026-09-30T16:01:00Z'});
assert.equal(compact('2026-09-30')[0][1],'2026-09-30T20:00');
assert.equal(compact('2026-10-01')[0][1],'2026-10-01T14:00');assert.equal(effectiveCourseEnd(med),'2026-10-02');
assert.equal(shiftedMoment(med,'2026-09-30T20:00'),'2026-10-02T01:00');
med.shifts=[];assert.equal(compact('2026-09-30').length,3); // frozen skipped dose stays at its actual date
const cycle={...med,start:'2026-10-24',end:'2026-10-28',times:['09:00'],cycle:{on:1,off:1},shifts:[{from:'2026-10-24T09:00',minutes:1440,at:'2026-10-24T06:00:00Z'}]};
assert.equal(scheduleEntries({meds:[cycle],taken:{}},'2026-10-25')[0].time,'09:00');
assert.equal(scheduleEntries({meds:[cycle],taken:{}},'2026-10-26').length,0);
assert.equal(scheduleEntries({meds:[cycle],taken:{}},'2026-10-29').length,1);
console.log('PASS: partial course, repeated shifts, midnight, course end, fixed outcomes, undo and cycles');

// A one-time delay never shifts later doses, even across midnight or course end.
const single={...med,shifts:[{from:'2026-09-29T20:00',minutes:360,scope:'once',at:'2026-09-29T16:00:00Z'}]};
const singleState={meds:[single],taken:{},skipped:{},fixed:{}};
assert.equal(shiftedMoment(single,'2026-09-29T20:00'),'2026-09-30T02:00');
assert.equal(shiftedMoment(single,'2026-09-30T09:00'),'2026-09-30T09:00');
assert.equal(scheduleEntries(singleState,'2026-09-30').length,3);
single.shifts.push({from:'2026-09-29T20:00',minutes:1440,scope:'course',at:'2026-09-29T16:01:00Z'});
assert.equal(shiftedMoment(single,'2026-09-29T20:00'),'2026-10-01T02:00');
assert.equal(shiftedMoment(single,'2026-09-30T09:00'),'2026-10-01T09:00');
assert.equal(effectiveCourseEnd(single),'2026-10-01');
single.shifts=[{from:'2026-09-30T20:00',minutes:3000,scope:'once',at:'2026-09-29T16:02:00Z'}];
assert.equal(effectiveCourseEnd(single),'2026-09-30');
assert.equal(scheduleEntries(singleState,'2026-10-02').length,1);
single.shifts.push({from:'2026-09-30T20:00',minutes:60,scope:'once',at:'2026-09-29T16:03:00Z'});
assert.equal(shiftedMoment(single,'2026-09-30T20:00'),'2026-10-02T23:00');
singleState.taken['2026-09-30|m|20:00']='2026-10-02T19:00:00Z';singleState.fixed['2026-09-30|m|20:00']='2026-10-02T23:00';
single.shifts=[];
assert.equal(scheduleEntries(singleState,'2026-10-02')[0].time,'23:00');
console.log('PASS: one-time delay, midnight, combined course shift, repeated delay and frozen outcomes');
