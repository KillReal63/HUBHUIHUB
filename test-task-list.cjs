const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const schedule=require('./dist/tasks/schedule.js');
class Element{
 constructor(){this.children=[];this.hidden=false;this.open=false;this.value='';this.classList={add(){}};this.dataset={};}
 append(...items){this.children.push(...items)} replaceChildren(...items){this.children=items}setAttribute(name,value){this[name]=value}
 addEventListener(){}showModal(){this.open=true}close(){this.open=false}focus(){}scrollIntoView(){}reset(){}
}
const html=fs.readFileSync('dist/tasks/index.html','utf8'),nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>['#'+m[1],new Element()]));nodes.set('main',new Element());
const tabs=['all','active','done','missed'].map(filter=>{const e=new Element();e.dataset.filter=filter;return e});
const model={tasks:[{id:'a',title:'Future',date:'2099-01-01',time:'09:00',repeat:'once',days:[],timezone:'Asia/Dubai',note:''},{id:'b',title:'Repeat',date:'2026-10-07',time:'09:00',repeat:'daily',days:[],timezone:'Asia/Dubai',note:''}],done:{'b|2026-10-07':'2026-10-07T06:00:00Z'}};
let persisted=structuredClone(model),posts=0,conflict=false;
const context=vm.createContext({TaskSchedule:schedule,Intl,Date,URLSearchParams,structuredClone,Map,Error,Number,String,crypto:{randomUUID:()=> 'new'},location:{search:'',pathname:'/tasks/',replace(){}},window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){},setInterval(){},document:{hidden:false,createElement:()=>new Element(),querySelector:s=>nodes.get(s)||null,querySelectorAll:s=>s==='[data-filter]'?tabs:[],addEventListener(){}},fetch:async(path,options)=>{if(options.method==='POST'){posts++;if(conflict)return{ok:false,status:409,json:async()=>({error:'Conflict'})};persisted=JSON.parse(options.body).state}return{ok:true,json:async()=>({version:1,state:structuredClone(persisted)})}}});
vm.runInContext(fs.readFileSync('dist/tasks/tasks.js','utf8'),context);
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(vm.runInContext('filter',context),'active');
 const row=vm.runInContext("row(state.tasks[0],state.tasks[0].date,'active')",context);
 assert.equal(row.children[0].className,'task-body');assert.equal(row.children[1].className,'task-actions');
 row.children[1].children[1].onclick();assert.equal(nodes.get('#remove-dialog').open,true);assert.equal(posts,0);
 nodes.get('#delete-no').onclick();assert.equal(posts,0);
 vm.runInContext("requestDelete('b')",context);await nodes.get('#delete-yes').onclick();
 assert.equal(persisted.tasks.length,1);assert.equal(persisted.tasks[0].id,'a');assert.deepEqual(persisted.done,{});
 assert.equal(nodes.get('#remove-dialog').open,false);
 conflict=true;vm.runInContext("requestDelete('a')",context);await nodes.get('#delete-yes').onclick();
 assert.equal(persisted.tasks.length,1);assert.equal(nodes.get('#remove-dialog').open,true);
 console.log('PASS: default tab, right-hand actions, cancellation, confirmed series deletion and conflict preservation');
})().catch(error=>{console.error(error);process.exitCode=1});
