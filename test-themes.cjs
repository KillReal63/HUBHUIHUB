const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/dist/themes.js','utf8');let hour=0,tick;
const document={documentElement:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}};
const context={document,window:{addEventListener(){}},localStorage:{getItem:()=>null},Intl,Date:class extends Date{getHours(){return hour}},setInterval:fn=>tick=fn};
vm.runInNewContext(source,context);
for(const [h,theme] of [[0,'plum'],[5,'plum'],[6,'dawn'],[13,'dawn'],[14,'tide'],[21,'tide'],[22,'plum'],[23,'plum']]){hour=h;tick();assert.equal(document.documentElement.dataset.theme,theme)}
console.log('PASS: automatic themes at 00,05,06,13,14,21,22,23 hours, including live transitions');
