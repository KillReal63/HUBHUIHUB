const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Dubai',serviceWorkers:'block'});
 let session=true,fail='',writes=0;
 const records={state:{meds:[{id:'med',name:'Проверочный препарат',dose:'1',note:'',start:'2026-10-24',end:'',days:[0,1,2,3,4,5,6],times:['09:00']}],taken:{},skipped:{},fixed:{}},tasks:{tasks:[{id:'task',title:'Проверочное дело',date:'2026-10-23',time:'14:00',repeat:'daily',days:[],note:'',timezone:'Asia/Dubai',shifts:{'2026-10-23':{date:'2026-10-24',time:'13:00'}}}],done:{}},gym:{version:1,selected:'day',done:{},days:[{id:'day',name:'Тренировка',weekday:null,groups:[],exercises:[]}]},food:{meals:[],stocks:[{id:'stock',name:'Яйца',unit:'шт',quantity:5,batch:5,days:5,daily:1,asOf:'2026-10-24',expiry:'2026-10-25',remind:false,lots:[{id:'lot',quantity:5,date:'2026-10-24',expiry:'2026-10-25'}],rule:{enabled:false,mode:'threshold',threshold:0,target:5,leadDays:1,time:'18:00',timezone:'Asia/Dubai'}}],recipes:[{id:'recipe',name:'Омлет',kind:'Завтрак',note:'',kcal:null,ingredients:[]}],plans:[{id:'plan',recipeId:'recipe',date:'2026-10-24',servings:1}],movements:[],demo:false}};
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(p.includes('/api/')){
   const endpoint=p.split('/api/')[1];
   if(route.request().method()==='POST'){writes++;if(endpoint==='logout')session=false;}
   if(endpoint==='session')return route.fulfill({json:{authenticated:session,setupRequired:false}});
   if(endpoint in records){if(!session)return route.fulfill({status:401,json:{error:'Войди снова'}});if(fail===endpoint)return route.fulfill({status:500,json:{error:'test'}});return route.fulfill({json:{state:records[endpoint],version:1,shopping:[]}});}
   return route.fulfill({json:{enabled:false}});
  }
  if(url.hostname!=='localhost')return route.abort();
  let file=p.startsWith('/gym')?path.join(__dirname,'gym-prototype/dist',p.replace(/^\/gym\/?/,'')||'index.html'):path.join(__dirname,'dist',p==='/'?'hub/index.html':p.replace(/^\/vovrema\//,'/'));
  if(['/gym/program','/gym/catalog'].includes(p))file=path.join(__dirname,'gym-prototype/dist/index.html');
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript'})[path.extname(file)]||'application/octet-stream'});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-24T08:00:00Z')});
 const go=async url=>{await page.goto('http://localhost:4190'+url);await page.waitForLoadState('networkidle');};
 await go('/');await page.locator('[data-today-group=tasks] a').first().waitFor();
 assert.equal(await page.locator('[data-today-group=tasks] a').count(),2);
 assert.equal(await page.locator('#hub-today a').count(),6);
 const links=await page.locator('#hub-today a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
 for(const theme of ['air','garden','tiles','night'])for(const size of ['normal','large','largest'])for(const width of [320,390,900]){
  await page.setViewportSize({width,height:844});
  await page.evaluate(({theme,size})=>{document.documentElement.dataset.hubTheme=theme;document.documentElement.style.fontSize=({normal:'100%',large:'115%',largest:'130%'})[size];},{theme,size});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),theme+' '+size+' '+width);
 }
 for(const link of links){
  await go(link);
  if(link.startsWith('/tasks/')){assert.equal(await page.locator('.highlight').count(),1);assert.equal(await page.locator('.highlight').getAttribute('data-occurrence'),new URL(link,'http://localhost').searchParams.get('occurrence'));}
  if(link.startsWith('/vovrema/'))assert.equal(await page.locator('#schedule .record-target').count(),1);
  if(link.includes('plan=')){assert(await page.locator('[data-panel=menu]').isVisible());assert.equal(await page.locator('.menu-entry.record-target').count(),1);}
  if(link.includes('stock='))assert(await page.locator('#inventory-editor').isVisible());
  if(link.startsWith('/gym/'))assert((await page.locator('#app').innerText()).includes('Тренировка'));
 }
 assert.equal(writes,0,'opening summary links must not save data');
 const savedTasks=records.tasks.tasks;
 records.tasks.tasks=Array.from({length:120},(_,i)=>({...savedTasks[0],id:'many'+i,time:i===119?'08:00':'09:00',shifts:{}}));
 await go('/tasks/?task=many119&occurrence=2026-10-24');
 assert.equal(await page.locator('.highlight').getAttribute('data-task'),'many119','direct link survives the 100-row history limit');
 assert.equal(await page.locator('.task-row').count(),100);
 records.tasks.tasks=savedTasks;
 await go('/');records.tasks.done={'task|2026-10-23':'done','task|2026-10-24':'done'};
 await page.locator('#today-update').click();await page.waitForFunction(()=>document.querySelector('[data-today-group=tasks]').textContent.includes('Нет незавершённых'));
 fail='food';await page.locator('#today-update').click();await page.waitForFunction(()=>document.querySelector('[data-today-group=menu]').textContent.includes('Не удалось'));
 assert.equal(await page.locator('[data-today-group=menu] a').count(),0);
 assert.equal(await page.locator('[data-today-group=medicine] a').count(),1);
 fail='';await page.locator('[data-today-group=menu] button').click();await page.locator('[data-today-group=menu] a').waitFor();
 session=false;await page.locator('#today-update').click();await page.locator('#auth').waitFor();assert.equal(await page.locator('#hub-today a').count(),0);
 session=true;await go('/');await page.locator('#logout').click();await page.locator('#auth').waitFor();assert.equal(await page.locator('#hub-today a').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: today links, read-only navigation, 4 themes / 3 text sizes / 320–900 px, refresh, partial failure, 401 and logout');
 await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
