const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('dist/hub/hub.js','utf8');
const nodes=new Map();let target,loggedIn=false;
const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',addEventListener(){}});return nodes.get(id)};
const context=vm.createContext({URL,URLSearchParams,Intl,Date,setTimeout,clearTimeout,location:{origin:'https://hub.test',search:'?next=%2Fvovrema%2F',hash:'',pathname:'/',replace:value=>target=value},document:{querySelector:node,addEventListener(){}},window:{addEventListener(){}},fetch:async(path,options)=>{if(path==='/api/login')loggedIn=true;if(path==='/api/logout')loggedIn=false;return {ok:true,json:async()=>({authenticated:loggedIn,setupRequired:false})}},history:{replaceState(){}}});
vm.runInContext(source,context);
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(node('main').hidden,true);
 for(const url of ['https://evil.test/vovrema/','//evil.test/gym/','/gym/../../api/logout','/api/logout','javascript:alert(1)','/gym-malicious/'])assert.equal(vm.runInContext(`safeNext(${JSON.stringify(url)})`,context),null,url);
 assert.equal(vm.runInContext("safeNext('/gym/program')",context),'/gym/program');
 assert.equal(vm.runInContext("safeNext('/food/')",context),'/food/');
 assert.equal(vm.runInContext("safeNext('/food-malicious/')",context),null);
 node('#password').value='test-password';await node('#auth-form').onsubmit({preventDefault(){}});assert.equal(target,'/vovrema/');assert.equal(node('main').hidden,false);
 await node('#logout').onclick();assert.equal(node('main').hidden,true);
 // A new installation uses the root worker, but an existing subscription is kept.
 const push=fs.readFileSync('dist/push.js','utf8');const registrationCode=push.slice(push.indexOf('const registrationReady='),push.indexOf('function pushUI'));
 for(const mode of ['new','root','medication']){
  let registered;
  const root={scope:'https://hub.test/',active:true,pushManager:{getSubscription:async()=>mode==='root'?{}:null}};
  const med={scope:'https://hub.test/vovrema/',active:true,pushManager:{getSubscription:async()=>mode==='medication'?{}:null}};
  const selected=await vm.runInNewContext(`let pushRegistration;${registrationCode};registrationReady`,{supported:true,location:{origin:'https://hub.test'},navigator:{serviceWorker:{getRegistrations:async()=>[root,med],register:async(url,options)=>{registered=[url,options.scope];return options.scope==='/vovrema/'?med:root}}}});
  assert.deepEqual(registered,mode==='medication'?['/vovrema/sw.js','/vovrema/']:['/sw.js','/']);assert.equal(selected,mode==='medication'?med:root);
 }
 console.log('PASS: hub login/logout, safe return URLs, shared worker and existing subscriptions');
})().catch(error=>{console.error(error);process.exitCode=1});
