const $=selector=>document.querySelector(selector);
const schedule=TaskSchedule,deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
let authenticated=false,state={tasks:[],done:{}},version=0,busy=false,filter='active',editing=null,editingZone=deviceZone,toastTimer,targetShown=false;
const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,6000)}
function signIn(){authenticated=false;state={tasks:[],done:{}};$('#editor').close();$('#remove-dialog').close();$('main').hidden=true;location.replace('/?next='+encodeURIComponent(location.pathname+location.search))}
async function api(path,body){const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok){if(response.status===401)signIn();const error=Error(data.error||'Не удалось выполнить запрос');error.status=response.status;throw error}return data}
async function load(){const result=await api('tasks');state=result.state;version=result.version;authenticated=true;$('main').hidden=false;$('#loading').hidden=true;$('#add').disabled=false;$('#retry').hidden=true;$('#load-error').textContent='';render();if(!targetShown&&$('.highlight')){$('.highlight').scrollIntoView({block:'center'});targetShown=true}}
async function save(next){const result=await api('tasks',{state:next,version});state=next;version=result.version;render()}
async function change(fn){if(busy)return false;busy=true;$('#save').disabled=true;try{await fn();return true}catch(error){if(error.status===409){await load().catch(()=>{});toast(error.message)}if($('#editor').open)$('#form-error').textContent=error.message;else toast(error.message);return false}finally{busy=false;$('#save').disabled=false}}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function dateLabel(day){return new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',year:day.slice(0,4)!==String(new Date().getFullYear())?'numeric':undefined,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}
function repeatLabel(task){return task.repeat==='once'?'Один раз':task.repeat==='daily'?'Каждый день':task.days.map(d=>weekdays[d]).join(', ')}
function zoneLabel(zone){return new Intl.DateTimeFormat('ru',{timeZone:zone,timeZoneName:'long'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName').value}
function row(task,day,status){
  const done=status==='done',article=element('article','task-row '+status+'-row');article.dataset.task=task.id;
  const button=element('button','complete',done?'✓':'');button.type='button';button.setAttribute('aria-label',(done?'Отменить выполнение: ':'Выполнить: ')+task.title+' · '+dateLabel(day));
  button.onclick=()=>change(async()=>{const next=structuredClone(state),key=task.id+'|'+day;if(done)delete next.done[key];else next.done[key]=new Date().toISOString();await save(next);toast(done?'Отметка отменена':'Готово!')});
  const content=element('button','task-body');content.type='button';content.setAttribute('aria-label','Изменить: '+task.title);content.onclick=()=>openEditor(task.id);
  content.append(element('span','task-time',task.time),element('h2','',task.title));
  content.append(element('span','task-meta',dateLabel(day)+' · '+repeatLabel(task)+(task.timezone!==deviceZone?' · '+zoneLabel(task.timezone):'')));
  if(task.note)content.append(element('span','task-note',task.note));
  const actions=element('div','task-actions'),remove=element('button','row-delete','Удалить');remove.type='button';remove.setAttribute('aria-label','Удалить дело: '+task.title);remove.onclick=()=>requestDelete(task.id);actions.append(button,remove);article.append(content,actions);
  if(new URLSearchParams(location.search).get('task')===task.id)article.classList.add('highlight');return article;
}
function render(){
  const list=$('#list');list.replaceChildren();const buckets=schedule.lists(state.tasks,state.done);
  $('#active-count').textContent=buckets.active.length;
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
  const names={active:'Предстоящие',done:'Выполненные',missed:'Пропущенные'};let count=0;
  for(const section of filter==='all'?['active','missed','done']:[filter]){
    const items=buckets[section];if(!items?.length)continue;
    list.append(element('h2','group-title',names[section]));
    if(section!=='active')list.append(element('p','history-limit','Последние '+(section==='done'?'выполнения':'пропущенные даты')+' · до 100 записей'));
    for(const item of items){list.append(row(item.task,item.day,item.status));count++;}
  }
  if(!count){const empty=element('section','empty'),copy={active:['Всё спокойно','Предстоящих дел нет. Можно добавить новое.'],done:['Пока без отметок','Здесь появятся выполненные дела.'],missed:['Нет пропущенных','Здесь будут невыполненные дела, назначенное время которых уже прошло.'],all:['Начнём с одного дела','Добавь дело и выбери время напоминания.']}[filter];empty.append(element('div','empty-mark','✓'),element('h2','',copy[0]),element('p','',copy[1]));if(filter==='active'||filter==='all'){const add=element('button','','Добавить дело');add.onclick=()=>openEditor();empty.append(add)}list.append(empty)}
}
let deleting=null;
function requestDelete(id){if(busy)return;const task=state.tasks.find(t=>t.id===id);if(!task)return;deleting=id;$('#remove-description').textContent='Удалить «'+task.title+'»'+(task.repeat==='once'?' вместе с отметками выполнения?':' вместе со всеми повторами и отметками выполнения?');$('#remove-dialog').showModal();}
function repeatChanged(){$('#weekdays').hidden=$('#repeat').value!=='weekly';$('#weekdays').disabled=$('#repeat').value!=='weekly';$('#date-label').textContent=$('#repeat').value==='once'?'Дата':'Начиная с'}
function openEditor(id){
  if(busy)return;editing=id||null;const task=state.tasks.find(item=>item.id===id);$('#task-form').reset();$('#form-error').textContent='';
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
$('#delete').onclick=()=>requestDelete(editing);
$('#delete-no').onclick=()=>{if(!busy)$('#remove-dialog').close()};
$('#remove-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('#delete-yes').onclick=async()=>{if(!deleting)return;const id=deleting;$('#delete-yes').disabled=true;const saved=await change(async()=>{const next=structuredClone(state);next.tasks=next.tasks.filter(task=>task.id!==id);for(const key of Object.keys(next.done))if(key.startsWith(id+'|'))delete next.done[key];await save(next)});$('#delete-yes').disabled=false;if(saved){$('#remove-dialog').close();if(editing===id)$('#editor').close();deleting=null;toast('Запись удалена')}};

document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;render()});
async function refresh(){if(busy||$('#editor').open||$('#remove-dialog').open||document.hidden)return;busy=true;try{await load();window.pushRefresh?.()}catch(error){$('#loading').hidden=true;$('#load-error').textContent=error.status===401?'Переходим к общему входу…':'Не удалось обновить дела. Проверь подключение.';$('#retry').hidden=false}finally{busy=false}}
$('#retry').onclick=refresh;$('#today').textContent=new Intl.DateTimeFormat('ru',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,30000);refresh();
