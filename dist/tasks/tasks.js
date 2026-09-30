const $=selector=>document.querySelector(selector);
const schedule=TaskSchedule,deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
let authenticated=false,state={tasks:[],done:{}},version=0,busy=false,filter='active',editing=null,editingZone=deviceZone,toastTimer,targetShown=false;
const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,6000)}
function signIn(){authenticated=false;state={tasks:[],done:{}};$('#editor').close();$('main').hidden=true;location.replace('/?next='+encodeURIComponent(location.pathname+location.search))}
async function api(path,body){const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok){if(response.status===401)signIn();const error=Error(data.error||'Не удалось выполнить запрос');error.status=response.status;throw error}return data}
async function load(){const result=await api('tasks');state=result.state;version=result.version;authenticated=true;$('main').hidden=false;$('#loading').hidden=true;$('#add').disabled=false;$('#retry').hidden=true;$('#load-error').textContent='';render();if(!targetShown&&$('.highlight')){$('.highlight').scrollIntoView({block:'center'});targetShown=true}}
async function save(next){const result=await api('tasks',{state:next,version});state=next;version=result.version;render()}
async function change(fn){if(busy)return false;busy=true;$('#save').disabled=true;try{await fn();return true}catch(error){if(error.status===409){await load().catch(()=>{});toast(error.message)}if($('#editor').open)$('#form-error').textContent=error.message;else toast(error.message);return false}finally{busy=false;$('#save').disabled=false}}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function dateLabel(day){return new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',year:day.slice(0,4)!==String(new Date().getFullYear())?'numeric':undefined,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}
function repeatLabel(task){return task.repeat==='once'?'Один раз':task.repeat==='daily'?'Каждый день':task.days.map(d=>weekdays[d]).join(', ')}
function zoneLabel(zone){return new Intl.DateTimeFormat('ru',{timeZone:zone,timeZoneName:'long'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName').value}
function row(task,day,done){
  const article=element('article','task-row'+(done?' done-row':''));article.dataset.task=task.id;
  const button=element('button','complete',done?'✓':'○');button.type='button';button.setAttribute('aria-label',(done?'Отменить выполнение: ':'Выполнить: ')+task.title);
  button.onclick=()=>change(async()=>{const next=structuredClone(state),key=task.id+'|'+day;if(done)delete next.done[key];else next.done[key]=new Date().toISOString();await save(next);toast(done?'Дело возвращено в список':'Готово!')});
  const content=element('button','task-body');content.type='button';content.setAttribute('aria-label','Изменить: '+task.title);content.onclick=()=>openEditor(task.id);
  content.append(element('span','task-time',task.time),element('h2','',task.title));
  content.append(element('span','task-meta',dateLabel(day)+' · '+repeatLabel(task)+(task.timezone!==deviceZone?' · '+zoneLabel(task.timezone):'')));
  if(task.note)content.append(element('span','task-note',task.note));article.append(button,content);
  if(new URLSearchParams(location.search).get('task')===task.id)article.classList.add('highlight');
  return article;
}
function render(){
  const list=$('#list');list.replaceChildren();
  const upcoming=state.tasks.map(task=>({task,day:schedule.next(task,state.done)})).filter(item=>item.day).sort((a,b)=>(a.day+a.task.time).localeCompare(b.day+b.task.time));
  $('#active-count').textContent=upcoming.length;
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
  let count=0;
  if(filter==='active'){
    const groups=new Map([['Просрочено',[]],['Сегодня',[]],['Дальше',[]]]);
    for(const item of upcoming){const today=schedule.dayAt(item.task.timezone);groups.get(item.day<today?'Просрочено':item.day===today?'Сегодня':'Дальше').push(item)}
    for(const [name,items] of groups){if(!items.length)continue;list.append(element('h2','group-title',name));for(const {task,day} of items){list.append(row(task,day,false));count++}}
  }else{
    const tasks=new Map(state.tasks.map(task=>[task.id,task]));
    const completed=Object.entries(state.done).sort((a,b)=>b[1].localeCompare(a[1])).slice(0,100);
    for(const [key] of completed){const [id,day]=key.split('|'),task=tasks.get(id);if(task){list.append(row(task,day,true));count++}}
    if(count)list.prepend(element('p','task-meta','Последние выполненные дела · до 100 отметок'));
  }
  if(!count){const empty=element('section','empty');empty.append(element('div','empty-mark','✓'),element('h2','',filter==='done'?'Пока без отметок':'Ничего не забыто'),element('p','',filter==='done'?'Выполненные дела появятся здесь. Отметку можно будет отменить.':'Добавь первое дело — напомним, когда придёт время.'));if(filter==='active'){const add=element('button','','Добавить дело');add.onclick=()=>openEditor();empty.append(add)}list.append(empty)}
}
function repeatChanged(){$('#weekdays').hidden=$('#repeat').value!=='weekly';$('#weekdays').disabled=$('#repeat').value!=='weekly';$('#date-label').textContent=$('#repeat').value==='once'?'Дата':'Начиная с'}
function openEditor(id){
  if(busy)return;editing=id||null;const task=state.tasks.find(item=>item.id===id);$('#task-form').reset();$('#form-error').textContent='';$('#delete-confirm').hidden=true;
  const future=new Date(Date.now()+3600000);future.setMinutes(Math.ceil(future.getMinutes()/5)*5,0,0);
  $('#title').value=task?.title||'';$('#note').value=task?.note||'';$('#date').value=task?.date||schedule.dayAt(deviceZone,future);$('#time').value=task?.time||new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(future);$('#repeat').value=task?.repeat||'once';editingZone=task?.timezone||deviceZone;
  document.querySelectorAll('#weekdays input').forEach(input=>input.checked=(task?.days||[(future.getDay()+6)%7]).includes(Number(input.value)));
  $('#zone-note').textContent='Время: '+zoneLabel(editingZone)+'. При поездках напоминание останется в этом часовом поясе.';
  $('#form-title').textContent=task?'Изменить дело':'Новое дело';$('#delete').hidden=!task;repeatChanged();$('#editor').showModal();$('#title').focus();
}
$('#add').onclick=()=>openEditor();$('#close-editor').onclick=()=>{if(!busy)$('#editor').close()};$('#editor').addEventListener('cancel',event=>{if(busy)event.preventDefault()});$('#repeat').onchange=repeatChanged;
$('#task-form').onsubmit=async event=>{event.preventDefault();$('#form-error').textContent='';const days=[...document.querySelectorAll('#weekdays input:checked')].map(input=>Number(input.value));if($('#repeat').value==='weekly'&&!days.length){$('#form-error').textContent='Выбери хотя бы один день недели.';return}if(!$('#title').value.trim()){$('#form-error').textContent='Напиши, что нужно сделать.';return}
  const task={id:editing||crypto.randomUUID(),title:$('#title').value.trim(),note:$('#note').value.trim(),date:$('#date').value,time:$('#time').value,repeat:$('#repeat').value,days,timezone:editingZone};
  const saved=await change(async()=>{const next=structuredClone(state),index=next.tasks.findIndex(item=>item.id===task.id);if(editing&&index<0)throw Error('Дело уже удалено на другом устройстве. Закрой форму и создай новое.');if(index<0)next.tasks.push(task);else next.tasks[index]=task;await save(next)});if(saved){$('#editor').close();toast('Дело сохранено')}
};
$('#delete').onclick=()=>$('#delete-confirm').hidden=false;$('#delete-no').onclick=()=>$('#delete-confirm').hidden=true;
$('#delete-yes').onclick=async()=>{const saved=await change(async()=>{const next=structuredClone(state);next.tasks=next.tasks.filter(task=>task.id!==editing);for(const key of Object.keys(next.done))if(key.startsWith(editing+'|'))delete next.done[key];await save(next)});if(saved){$('#editor').close();toast('Дело удалено')}};
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;render()});
async function refresh(){if(busy||$('#editor').open||document.hidden)return;busy=true;try{await load();window.pushRefresh?.()}catch(error){$('#loading').hidden=true;$('#load-error').textContent=error.status===401?'Переходим к общему входу…':'Не удалось обновить дела. Проверь подключение.';$('#retry').hidden=false}finally{busy=false}}
$('#retry').onclick=refresh;$('#today').textContent=new Intl.DateTimeFormat('ru',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,30000);refresh();
