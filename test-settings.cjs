const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname;
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let records={state:{meds:[{id:'med-test',name:'Проверочный препарат',dose:'1',start:'2026-10-14',end:'',days:[0,1,2,3,4,5,6],times:['09:00'],note:''}],taken:{},skipped:{},fixed:{}},tasks:{tasks:[{id:'task-test',title:'Проверочное дело',note:'',date:'2099-01-01',time:'12:00',repeat:'once',days:[],timezone:'Asia/Dubai'}],done:{}}},version=1,fail=0,posts=0;
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url()),p=u.pathname;
  if(p.includes('/api/')){
   const endpoint=p.split('/api/')[1];let body={enabled:false};
   if(endpoint==='session')body={authenticated:true,setupRequired:false};
   if(endpoint in records){
    if(r.request().method()==='POST'){posts++;if(fail)return r.fulfill({status:fail,json:{error:'Проверочная ошибка'}});const data=r.request().postDataJSON();assert.equal(data.version,version);records[endpoint]=data.state;version++;}
    body={state:records[endpoint],version};
   }
   return r.fulfill({json:body});
  }
  let file=p.startsWith('/gym')?path.join(root,'gym-prototype/dist',p.replace(/^\/gym\/?/,'')||'index.html'):p.startsWith('/vovrema/')?path.join(root,'dist',p.slice(9)||'index.html'):path.join(root,'dist',p==='/'?'hub/index.html':p);
  if(['/gym/program','/gym/catalog'].includes(p))file=path.join(root,'gym-prototype/dist/index.html');
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file))return r.fulfill({status:404,body:''});
  return r.fulfill({body:fs.readFileSync(file),contentType:({'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const go=async p=>{await page.goto('http://localhost:4177'+p);await page.waitForLoadState('networkidle');};
 await go('/');await page.locator('#hub-settings-open').click();
 for(const [value,size] of [['normal',16],['large',18.4],['largest',20.8]]){await page.locator(`[name=hub-text-size][value=${value}]`).check();assert(Math.abs(await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))-size)<.1);}
 for(const [url,open,key] of [['/vovrema/','[data-view=settings]',null],['/tasks/','#open-settings',null],['/food/','#open-settings','my-day-food-prototype-v1'],['/gym/','#gym-settings-open','ritm-gym-prototype-v1']]){
  await go(url);
  assert.equal(await page.evaluate(()=>localStorage.getItem('my-day-text-size')),'largest');
  assert(Math.abs(await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))-20.8)<.1);
  if(key){await page.evaluate(k=>{const value=k.startsWith('ritm')?{version:1,selected:'day',days:[{id:'day',name:'Тест',weekday:null,groups:[],exercises:[]}],done:{}}:{meals:[],stocks:[],recipes:[{id:'recipe',name:'Тест',ingredients:[]}],plans:[],demo:false};localStorage.setItem(k,JSON.stringify(value));},key);await page.reload();await page.waitForLoadState('networkidle');}
  // Food uses a settings button with its own id.
  const trigger=url==='/food/'?'#settings-open':open;
  await page.locator(trigger).click();
  const reset=page.locator('.app-reset-records button');
  const before=posts;page.once('dialog',d=>d.dismiss());await reset.click();assert.equal(posts,before);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(e=>[e.tagName,e.className,e.textContent.slice(0,40),e.getBoundingClientRect().right])));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),url+' page overflow');assert(await page.locator('.app-reset-records').evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1),url+' reset overflow');}
  if(!key){const original=JSON.stringify(records);fail=409;page.once('dialog',d=>d.accept());await reset.click();await page.waitForFunction(()=>!document.querySelector('.app-reset-records button').disabled);assert.match(await page.locator('.app-reset-records [role=status]').innerText(),/не выполнен/);fail=500;page.once('dialog',d=>d.accept());await reset.click();await page.waitForFunction(()=>!document.querySelector('.app-reset-records button').disabled);assert.equal(JSON.stringify(records),original);fail=0;}
  else{await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('storage unavailable')};});page.once('dialog',d=>d.accept());await reset.click();await page.waitForFunction(()=>!document.querySelector('.app-reset-records button').disabled);assert.match(await page.locator('.app-reset-records [role=status]').innerText(),/не выполнен/);await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});}
  page.once('dialog',d=>d.accept());await reset.click();await page.waitForFunction(()=>document.querySelector('.app-reset-records [role=status]').textContent==='Записи сброшены.');
  if(key){const data=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal((data.days||data.recipes).length,0);}
  else assert.equal(url==='/vovrema/'?records.state.meds.length:records.tasks.tasks.length,0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('my-day-text-size')),'largest');
  console.log('PASS settings/reset',url);
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS all settings scenarios; synthetic data only');
})().catch(e=>{console.error(e);process.exit(1)});
