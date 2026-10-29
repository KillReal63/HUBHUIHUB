const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/dist/hub/preferences.js','utf8'),events=[];
const values=new Map([['my-day-theme-sync','1'],['my-day-theme-profile','garden'],['my-day-text-size','large']]);
const root={dataset:{},style:{}},meta={content:'',setAttribute(name,value){if(name==='content')this.content=value}};
const document={documentElement:root,querySelector:selector=>selector==='meta[name="theme-color"]'?meta:null,querySelectorAll:()=>[],addEventListener(){},getElementById:()=>null};
const window={dispatchEvent:event=>events.push(event),addEventListener(){}};
class CustomEvent{constructor(type,options){this.type=type;this.detail=options.detail}}
vm.runInNewContext(source,{document,window,CustomEvent,localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
assert.equal(root.dataset.commonTheme,'garden');assert.equal(root.style.fontSize,'115%');assert.equal(meta.content,'#e7efe9');
const detail=events.find(event=>event.type==='my-day-common-theme').detail;
assert.equal(detail.themeFor('medicine'),'tide');assert.equal(detail.themeFor('tasks'),'sage');assert.equal(detail.themeFor('food'),'pistachio');assert.equal(detail.themeFor('gym'),'studio');

const hubSource=fs.readFileSync(__dirname+'/dist/hub/themes.js','utf8'),hubInputs=['air','garden','tiles','night'].map(value=>({value,checked:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler}}));
const hubRoot={dataset:{}},hubMeta={setAttribute(name,value){if(name==='content')this.content=value}},hubStatus={textContent:''};
const hubDocument={documentElement:hubRoot,querySelector:selector=>selector==='meta[name="theme-color"]'?hubMeta:selector==='#hub-theme-status'?hubStatus:null,querySelectorAll:selector=>selector==='[name="hub-theme"]'?hubInputs:[],addEventListener(type,handler){if(type==='DOMContentLoaded')handler()}};
const hubEvents={};
const hubWindow={addEventListener(type,handler){hubEvents[type]=handler}};
const hubValues=new Map([['my-day-hub-theme','tiles'],['my-day-theme-sync','1'],['my-day-theme-profile','garden']]);
vm.runInNewContext(hubSource,{document:hubDocument,window:hubWindow,localStorage:{getItem:key=>hubValues.get(key)??null,setItem:(key,value)=>hubValues.set(key,value)}});
assert.equal(hubRoot.dataset.hubTheme,'garden');
const night=hubInputs.find(input=>input.value==='night');night.checked=true;night.handlers.change();
assert.equal(hubValues.get('my-day-hub-theme'),'tiles');
hubEvents['my-day-common-theme']({detail:{enabled:true,profile:'night'}});assert.equal(hubRoot.dataset.hubTheme,'night');
hubEvents['my-day-common-theme']({detail:{enabled:false,profile:'night'}});assert.equal(hubRoot.dataset.hubTheme,'tiles');
console.log('PASS: common theme maps every application, preserves text size, and restores the hub local theme');
