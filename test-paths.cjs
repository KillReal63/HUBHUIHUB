const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base='/vovrema/',root=__dirname+'/dist/';
const html=fs.readFileSync(root+'index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const url=match[1];assert.ok(url==='/'||url.startsWith('/?next=')||url.startsWith(base)||['/hub/chrome.css','/hub/chrome.js'].includes(url),url);if(url.startsWith(base)&&url!==base)assert.ok(fs.existsSync(root+url.slice(base.length)),url)}
for(const name of ['hub/chrome.css','hub/chrome.js'])assert.ok(fs.existsSync(root+name));
const manifest=JSON.parse(fs.readFileSync(root+'manifest.webmanifest','utf8'));
assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.id,'/');
for(const icon of manifest.icons)assert.ok(fs.existsSync(root+icon.src.slice(base.length)));
assert.ok(fs.readFileSync(root+'app.js','utf8').includes("fetch('/vovrema/api/'"));
const events={},calls=[];let clients=[];
const self={location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn,clients:{matchAll:async()=>clients,openWindow:async url=>calls.push(['open',url])},registration:{showNotification:async(title,options)=>calls.push(['notification',options.data.url])}};
vm.runInNewContext(fs.readFileSync(root+'sw.js','utf8'),{self,URL});
(async()=>{
 let pending;
 const event={notification:{close(){}},waitUntil:p=>pending=p};
 clients=[{url:'https://example.test/other/',focus:async()=>calls.push(['wrong'])}];events.notificationclick(event);await pending;assert.deepEqual(calls.pop(),['open',base]);
 clients=[{url:'https://example.test/',navigate:async url=>calls.push(['navigate',url]),focus:async()=>calls.push(['focus'])}];events.notificationclick(event);await pending;assert.deepEqual(calls.splice(0),[['navigate',base],['focus']]);
 events.push({data:{json:()=>({title:'Test'})},waitUntil:p=>pending=p});await pending;assert.deepEqual(calls.pop(),['notification',base]);
 console.log('PASS: subpath assets, stable PWA identity, notification target and legacy navigation');
})().catch(error=>{console.error(error);process.exitCode=1});
