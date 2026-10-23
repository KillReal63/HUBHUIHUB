const $=selector=>document.querySelector(selector);
const schedule=TaskSchedule,deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
let authenticated=false,state={tasks:[],done:{}},version=0,busy=false,filter='active',period='today',editing=null,editingZone=deviceZone,toastTimer,targetShown=false;
let subtaskDraft=[];
const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,6000)}
function signIn(){authenticated=false;state={tasks:[],done:{}};$('#editor').close();$('#remove-dialog').close();$('#move-dialog').close();$('main').hidden=true;location.replace('/?next='+encodeURIComponent(location.pathname+location.search))}
async function api(path,body){const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok){if(response.status===401)signIn();const error=Error(data.error||'Не удалось выполнить запрос');error.status=response.status;throw error}return data}
async function load(){const result=await api('tasks');state=result.state;version=result.version;authenticated=true;$('main').hidden=false;$('#loading').hidden=true;$('#add').disabled=false;$('#retry').hidden=true;$('#load-error').textContent='';if(!targetShown){const id=new URLSearchParams(location.search).get('task');if(id){period='any';const lists=schedule.lists(state.tasks,state.done);if(lists.missed.some(x=>x.task.id===id))filter='missed';else if(lists.done.some(x=>x.task.id===id)&&!lists.active.some(x=>x.task.id===id))filter='done';}}render();if(!targetShown&&$('.highlight')){$('.highlight').scrollIntoView({block:'center'});targetShown=true}}
async function save(next){const result=await api('tasks',{state:next,version});state=next;version=result.version;render()}
async function change(fn){if(busy)return false;busy=true;$('#save').disabled=true;try{await fn();return true}catch(error){if(error.status===409){await load().catch(()=>{});toast(error.message)}if($('#move-dialog').open)$('#move-error').textContent=error.message;else if($('#editor').open)$('#form-error').textContent=error.message;else toast(error.message);return false}finally{busy=false;$('#save').disabled=false}}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function dateLabel(day){return new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',year:day.slice(0,4)!==String(new Date().getFullYear())?'numeric':undefined,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}
function repeatLabel(task){if(task.repeat==='interval')return 'Каждые '+task.interval+' дн.';return task.repeat==='once'?'Один раз':task.repeat==='daily'?'Каждый день':task.days.map(d=>weekdays[d]).join(', ')}
function zoneLabel(zone){return new Intl.DateTimeFormat('ru',{timeZone:zone,timeZoneName:'long'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName').value}
function row(task,day,status){
  const occurrence=schedule.event(task,day),done=status==='done',article=element('article','task-row '+status+'-row');article.dataset.task=task.id;
  const button=element('button','complete',done?'↶ Отменить':'✓ Готово');button.type='button';button.setAttribute('aria-pressed',String(done));button.setAttribute('aria-label',(done?'Отменить выполнение: ':'Выполнить: ')+task.title+' · '+dateLabel(occurrence.date));
  button.onclick=()=>change(async()=>{const next=structuredClone(state),key=task.id+'|'+day;if(done)delete next.done[key];else next.done[key]=new Date().toISOString();await save(next);toast(done?'Отметка отменена':'Готово!')});
  const content=element('button','task-body');content.type='button';content.setAttribute('aria-label','Изменить: '+task.title);content.onclick=()=>openEditor(task.id);
  content.append(element('span','task-time',occurrence.time),element('h2','',task.title));
  content.append(element('span','task-meta',dateLabel(occurrence.date)+' · '+repeatLabel(task)+(task.timezone!==deviceZone?' · '+zoneLabel(task.timezone):'')));
  if(task.shifts?.[day])content.append(element('span','task-meta','Перенесено с '+dateLabel(day)+' · '+task.time));
  if(task.reminderMinutes)content.append(element('span','task-meta','Ещё до 3 напоминаний · каждые '+task.reminderMinutes+' мин'));
  if(task.note)content.append(element('span','task-note',task.note));
  const actions=element('div','task-actions'),remove=element('button','row-delete','Удалить');remove.type='button';remove.setAttribute('aria-label','Удалить дело: '+task.title);remove.onclick=()=>requestDelete(task.id);actions.append(button,remove);if(!done){const move=element('button','row-move','Перенести');move.type='button';move.setAttribute('aria-label','Перенести событие: '+task.title+' · '+dateLabel(occurrence.date));move.onclick=()=>openMove(task.id,day);actions.append(move)}article.append(content,actions);
  if(task.subtasks?.length){article.classList.add('has-subtasks');article.append(checklist(task,day,done));}
  if(new URLSearchParams(location.search).get('task')===task.id)article.classList.add('highlight');return article;
}
function render(){
  const list=$('#list');list.replaceChildren();const buckets=schedule.lists(state.tasks,state.done,new Date(),period);
  document.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===period)));
  $('#active-count').textContent=buckets.active.length;
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
  const names={active:'Предстоящие',done:'Выполненные',missed:'Пропущенные'};let count=0;
  for(const section of [filter]){
    const items=buckets[section];if(!items?.length)continue;
    list.append(element('h2','group-title',names[section]));
    if(period==='any'&&section!=='active')list.append(element('p','history-limit','Последние '+(section==='done'?'выполнения':'пропущенные даты')+' · до 100 записей'));
    for(const item of items){list.append(row(item.task,item.day,item.status));count++;}
  }
  if(!count){const empty=element('section','empty'),copy={active:['Всё спокойно','Предстоящих дел нет. Можно добавить новое.'],done:['Пока без отметок','Здесь появятся выполненные дела.'],missed:['Нет пропущенных','Здесь будут невыполненные дела, назначенное время которых уже прошло.'],all:['Начнём с одного дела','Добавь дело и выбери время напоминания.']}[filter];empty.append(element('div','empty-mark','✓'),element('h2','',copy[0]),element('p','',period==='today'?'На сегодня в этом разделе дел нет. Другие даты — во вкладке «Дела вообще».':copy[1]));if(filter==='active'){const add=element('button','','Добавить дело');add.onclick=()=>openEditor();empty.append(add)}list.append(empty)}
}
let deleting=null;
function requestDelete(id){if(busy)return;const task=state.tasks.find(t=>t.id===id);if(!task)return;deleting=id;$('#remove-description').textContent='Удалить «'+task.title+'»'+(task.repeat==='once'?' вместе с отметками выполнения?':' вместе со всеми повторами и отметками выполнения?');$('#remove-dialog').showModal();}
function repeatChanged(){$('#interval-field').hidden=$('#repeat').value!=='interval';$('#interval').disabled=$('#repeat').value!=='interval';$('#weekdays').hidden=$('#repeat').value!=='weekly';$('#weekdays').disabled=$('#repeat').value!=='weekly';$('#date-label').textContent=$('#repeat').value==='once'?'Дата':'Начиная с'}
function openEditor(id){
  if(busy)return;editing=id||null;const task=state.tasks.find(item=>item.id===id);$('#task-form').reset();$('#form-error').textContent='';
  subtaskDraft=structuredClone(task?.subtasks||[]);renderSubtaskEditor();
  const future=new Date(Date.now()+3600000);future.setMinutes(Math.ceil(future.getMinutes()/5)*5,0,0);
  $('#title').value=task?.title||'';$('#note').value=task?.note||'';$('#date').value=task?.date||schedule.dayAt(deviceZone,future);$('#time').value=task?.time||new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(future);$('#repeat').value=task?.repeat||'once';editingZone=task?.timezone||deviceZone;
  document.querySelectorAll('#weekdays input').forEach(input=>input.checked=(task?.days||[(future.getDay()+6)%7]).includes(Number(input.value)));
  $('#zone-note').textContent='Время: '+zoneLabel(editingZone)+'. При поездках напоминание останется в этом часовом поясе.';
  $('#reminder-minutes').value=String(task?.reminderMinutes||0);
  $('#interval').value=task?.interval||2;$('#form-title').textContent=task?'Изменить дело':'Новое дело';$('#delete').hidden=!task;repeatChanged();$('#editor').showModal();$('#title').focus();
}
$('#add').onclick=()=>openEditor();$('#close-editor').onclick=()=>{if(!busy)$('#editor').close()};$('#editor').addEventListener('cancel',event=>{if(busy)event.preventDefault()});$('#repeat').onchange=repeatChanged;
$('#task-form').onsubmit=async event=>{event.preventDefault();$('#form-error').textContent='';const days=[...document.querySelectorAll('#weekdays input:checked')].map(input=>Number(input.value));if($('#repeat').value==='weekly'&&!days.length){$('#form-error').textContent='Выбери хотя бы один день недели.';return}if(!$('#title').value.trim()){$('#form-error').textContent='Напиши, что нужно сделать.';return}
  const task={id:editing||crypto.randomUUID(),title:$('#title').value.trim(),note:$('#note').value.trim(),date:$('#date').value,time:$('#time').value,repeat:$('#repeat').value,days,timezone:editingZone};
  task.reminderMinutes=Number($('#reminder-minutes').value);
  task.subtasks=subtaskDraft.map(item=>({id:item.id,title:item.title.trim()})).filter(item=>item.title);
  if(task.repeat==='interval'){task.interval=Number($('#interval').value);if(!Number.isInteger(task.interval)||task.interval<1||task.interval>365){$('#form-error').textContent='Укажи интервал от 1 до 365 дней.';return}}
  const saved=await change(async()=>{const next=structuredClone(state),index=next.tasks.findIndex(item=>item.id===task.id);if(editing&&index<0)throw Error('Дело уже удалено на другом устройстве. Закрой форму и создай новое.');if(index>=0){const previous=next.tasks[index];if(previous.subtaskDone){const ids=new Set(task.subtasks.map(item=>item.id));task.subtaskDone={};for(const [day,checked] of Object.entries(previous.subtaskDone)){const kept=checked.filter(id=>ids.has(id));if(kept.length)task.subtaskDone[day]=kept;}}if(previous.shifts){if(Object.keys(previous.shifts).some(day=>!schedule.occurs(task,day)))throw Error('Новое расписание исключает перенесённые события. Сохрани прежнюю дату начала и повтор или создай отдельное дело.');task.shifts=previous.shifts;}}if(index<0)next.tasks.push(task);else next.tasks[index]=task;await save(next)});if(saved){$('#editor').close();toast('Дело сохранено')}
};
$('#delete').onclick=()=>requestDelete(editing);
$('#delete-no').onclick=()=>{if(!busy)$('#remove-dialog').close()};
$('#remove-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('#delete-yes').onclick=async()=>{if(!deleting)return;const id=deleting;$('#delete-yes').disabled=true;const saved=await change(async()=>{const next=structuredClone(state);next.tasks=next.tasks.filter(task=>task.id!==id);for(const key of Object.keys(next.done))if(key.startsWith(id+'|'))delete next.done[key];await save(next)});$('#delete-yes').disabled=false;if(saved){$('#remove-dialog').close();if(editing===id)$('#editor').close();deleting=null;toast('Запись удалена')}};

document.querySelectorAll('[data-period]').forEach(button=>button.onclick=()=>{period=button.dataset.period;render()});
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;render()});
async function refresh(){if(busy||$('#editor').open||$('#remove-dialog').open||$('#move-dialog').open||document.hidden)return;busy=true;try{await load();window.pushRefresh?.()}catch(error){$('#loading').hidden=true;$('#load-error').textContent=error.status===401?'Переходим к общему входу…':'Не удалось обновить дела. Проверь подключение.';$('#retry').hidden=false}finally{busy=false}}
$('#retry').onclick=refresh;$('#today').textContent=new Intl.DateTimeFormat('ru',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(refresh,30000);refresh();

window.resetAppRecords=async()=>{
 if(busy||!authenticated)return false;
 const saved=await change(()=>save({tasks:[],done:{}}));
 if(saved){editing=null;deleting=null;$('#editor').close();$('#remove-dialog').close();$('#move-dialog').close();toast('Записи дел сброшены');}
 return saved;
};

let moving=null;
function openMove(id,day){
  if(busy)return;const task=state.tasks.find(t=>t.id===id);if(!task||state.done[id+'|'+day])return;
  moving={id,day};const occurrence=schedule.event(task,day);
  $('#move-date').value=occurrence.date;$('#move-time').value=occurrence.time;$('#move-error').textContent='';
  $('#move-description').textContent='«'+task.title+'» · '+dateLabel(occurrence.date)+'. '+(task.repeat==='once'?'Изменится время этого дела.':'Переносится только это событие. Остальные повторы останутся на своих датах.');
  $('#move-zone').textContent='Время: '+zoneLabel(task.timezone)+'.';$('#move-dialog').showModal();$('#move-date').focus();
}
$('#close-move').onclick=()=>{if(!busy)$('#move-dialog').close()};
$('#move-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('#move-form').onsubmit=async event=>{
  event.preventDefault();if(!moving||busy)return;const {id,day}=moving;
  $('#move-error').textContent='';$('#move-save').disabled=true;
  const saved=await change(async()=>{
    const next=structuredClone(state),task=next.tasks.find(t=>t.id===id);
    if(!task||!schedule.occurs(task,day)||next.done[id+'|'+day])throw Error('Событие уже изменено или выполнено. Закрой окно и обнови список.');
    const target={date:$('#move-date').value,time:$('#move-time').value};
    if(!target.date||!target.time)throw Error('Укажи дату и время.');
    task.shifts={...task.shifts,[day]:target};await save(next);
  });
  $('#move-save').disabled=false;
  if(saved){$('#move-dialog').close();moving=null;toast('Событие перенесено');}
};

function renderSubtaskEditor(){
  const container=$('#subtask-inputs');container.replaceChildren();
  for(const [index,item] of subtaskDraft.entries()){
    const row=element('div','subtask-input-row'),input=element('input'),remove=element('button','subtask-remove','Удалить');
    input.type='text';input.maxLength=120;input.value=item.title;input.placeholder='Например, взять паспорт';input.setAttribute('aria-label','Подзадача '+(index+1));
    input.oninput=()=>{item.title=input.value};
    remove.type='button';remove.setAttribute('aria-label','Удалить подзадачу '+(index+1));
    remove.onclick=()=>{if(busy)return;subtaskDraft=subtaskDraft.filter(s=>s.id!==item.id);renderSubtaskEditor();$('#add-subtask').focus()};
    row.append(input,remove);container.append(row);
  }
  $('#add-subtask').disabled=subtaskDraft.length>=50;
}
$('#add-subtask').onclick=()=>{
  if(busy||subtaskDraft.length>=50)return;
  subtaskDraft.push({id:crypto.randomUUID(),title:''});renderSubtaskEditor();
  document.querySelectorAll('#subtask-inputs input').item(subtaskDraft.length-1)?.focus();
};
function checklist(task,day,completed){
  const box=element('fieldset','task-checklist'),checked=task.subtaskDone?.[day]||[];
  box.append(element('legend','',`Подзадачи · ${checked.length} из ${task.subtasks.length}`));
  for(const item of task.subtasks){
    const label=element('label','subtask-check'),input=element('input'),text=element('span','',item.title);
    input.type='checkbox';input.checked=checked.includes(item.id);input.disabled=completed;
    input.setAttribute('aria-label',item.title+' · '+dateLabel(schedule.event(task,day).date));
    input.onchange=async()=>{
      const value=input.checked;input.checked=!value;if(busy)return;input.disabled=true;
      const saved=await change(async()=>{
        const next=structuredClone(state),current=next.tasks.find(t=>t.id===task.id);
        if(!current?.subtasks?.some(s=>s.id===item.id)||next.done[task.id+'|'+day])throw Error('Дело уже изменено. Обнови список.');
        const marks=new Set(current.subtaskDone?.[day]||[]);if(value)marks.add(item.id);else marks.delete(item.id);
        current.subtaskDone={...current.subtaskDone};if(marks.size)current.subtaskDone[day]=[...marks];else delete current.subtaskDone[day];
        await save(next);
      });
      if(!saved)input.disabled=false;
    };
    label.append(input,text);box.append(label);
  }
  return box;
}
