const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();const get=s=>{if(!nodes.has(s))nodes.set(s,{open:false,hidden:false,disabled:false,addEventListener(name,fn){this[name]=fn}});return nodes.get(s)};
let subscribed=null,enabled=false,permissionCalls=0,failSubscribe=false;
const subscription={endpoint:'test-endpoint',toJSON:()=>({endpoint:'test-endpoint'}),unsubscribe:async()=>{subscribed=null;return true}};
const registration={scope:'https://example.test/',active:true,pushManager:{getSubscription:async()=>subscribed,subscribe:async()=>subscribed=subscription}};
const window={PushManager:function(){},Notification:{},addEventListener(){}};
const context=vm.createContext({window,document:{querySelector:get},navigator:{userAgent:'iPhone',standalone:true,serviceWorker:{getRegistrations:async()=>[],register:async()=>registration}},location:{origin:'https://example.test'},matchMedia:()=>({matches:true}),Notification:{permission:'granted',requestPermission:()=>{permissionCalls++;return Promise.resolve('granted')}},Intl,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,clearTimeout,fetch:async(path)=>{let data={};if(path==='/api/session')data={authenticated:true};if(path==='/api/push/status')data={enabled,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};if(path==='/api/push/key')data={publicKey:'AAAA'};if(path==='/api/push/subscribe'){if(failSubscribe)return {ok:false,json:async()=>({error:'No connection'})};enabled=true}if(path==='/api/push/unsubscribe')enabled=false;return {ok:true,json:async()=>data}}});
vm.runInContext(fs.readFileSync('dist/push.js','utf8'),context);
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));const panel=get('.device-notifications'),button=get('#notifications');
 assert.equal(panel.open,true);panel.open=false;panel.toggle();assert.equal(panel.open,true);
 const enabling=button.onclick();assert.equal(permissionCalls,1,'Permission request must keep the click gesture');await enabling;
 assert.equal(enabled,true);assert.equal(panel.open,false);assert.equal(get('#push-test').hidden,false);
 panel.open=true;await window.pushRefresh();assert.equal(panel.open,true,'Refresh must preserve manual expansion');
 await button.onclick();assert.equal(enabled,false);assert.equal(panel.open,true);
 failSubscribe=true;await button.onclick();assert.equal(panel.open,true);assert.equal(window.pushEnabled,false);
 console.log('PASS: disabled accordion stays open, successful subscription collapses, manual expansion survives refresh, disable/error reopens, iOS gesture preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
