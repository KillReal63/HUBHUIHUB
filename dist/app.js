const $ = s => document.querySelector(s);
const KEY='vovremya-v1';
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let state={meds:[],taken:{},notified:{}},version=0,authenticated=false,busy=false,lastSaved={meds:[],taken:{}};
let editing=null,toastTimer;
const categories={pill:'Таблетка',ointment:'Мазь',supplement:'БАД',spray:'Спрей',drops:'Капли',injection:'Инъекция',action:'Действие'};
const categoryLabel=m=>categories[m.category||'pill'];
const iconForms={
 pill:['M9 4a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7Z','m6.5 6.5 7 7'],
 ointment:['M6 3h12l-2 14H8ZM9 17h6v4H9Z','M7 6h10M9 11h6'],
 supplement:['M8 3h8v4H8ZM7 7h10l1 3v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9Z','M7 11h10M10 17c0-3 2-4 5-4 0 3-2 5-5 4Z'],
 spray:['M8 10h8l2 3v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6ZM10 10V6h4v4M10 3h8v3h-8Z','M8 15h8M20 4h1'],
 drops:['M10 3h4v6l4 5v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5l4-5Z','M10 7h4M12 12s-2 3-2 4a2 2 0 0 0 4 0c0-1-2-4-2-4Z'],
 injection:['m8 14 7-7 5 5-7 7Zm-2-2 9 9M17 3l5 5M19 5l-3 3M21 7l-3 3M9 17l-6 6','M12 10l2 2M10 12l2 2'],
 action:['M6 4h12v17H6Z','M9 3h6v3H9Zm0 10 2 2 4-5']
};
let iconSerial=0;
function categoryIcon(m){
 const [body,detail]=iconForms[m?.category]||iconForms.pill,id='med-icon-'+(++iconSerial);
 return `<svg class="category-icon unified-icon" viewBox="0 0 24 24" aria-hidden="true" style="--icon-glass:url(#${id})"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".95"/><stop offset=".45" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs><path class="icon-body" d="${body}"/><path class="icon-detail" d="${detail}"/></svg>`;
}
const iconStyleKey='vovremya-icon-style',iconStyles=['line','solid','glass'];
let iconStyle='glass';try{const saved=localStorage.getItem(iconStyleKey);if(iconStyles.includes(saved))iconStyle=saved}catch{}
document.documentElement.dataset.icons=iconStyle;
const completedLabel=m=>m.category==='action'?'Выполнено':m.category==='ointment'?'Нанесено':'Принято';
const mealLabels={before:'До еды',after:'После еды',any:'Неважно',fasting:'Натощак'};
const details=m=>[categoryLabel(m),m.category!=='ointment'&&m.dose,m.category!=='ointment'&&m.meal&&mealLabels[m.meal],m.note].filter(Boolean).map(esc).join(' · ');
const weekdays=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,7000)}
async function api(path,body){const r=await fetch('/vovrema/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});let data;try{data=await r.json()}catch{throw Error('Сервер недоступен. Попробуй позже.')}if(!r.ok){const e=Error(data.error||'Ошибка сервера');e.status=r.status;throw e}return data}
async function load(force=false){const data=await api('state');if((busy&&!force)||data.version<version)return;version=data.version;lastSaved=structuredClone(data.state);state={...data.state,notified:state.notified};render()}
async function save(){if(busy||!authenticated)return false;busy=true;try{const snapshot={meds:state.meds,taken:state.taken,skipped:state.skipped||{},fixed:state.fixed||{}};const result=await api('state',{state:snapshot,version});version=result.version;lastSaved=structuredClone(snapshot);return true}catch(e){state={...structuredClone(lastSaved),notified:state.notified};if(e.status===409){try{await load(true)}catch{}}if(e.status===401)lock();toast(e.message||'Не удалось сохранить. Проверь подключение.');return false}finally{busy=false;render()}}
function entries(date){return scheduleEntries(state,date)}
function settled(x){return !!(state.taken[x.key]||state.skipped?.[x.key])}

function render(){const date=$('#day').value||today(),items=entries(date),todays=entries(today()),done=todays.filter(x=>state.taken[x.key]).length;
 $('#date').textContent=new Intl.DateTimeFormat('ru',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
 $('#progress').textContent=todays.length?`${done} из ${todays.length} приёмов отмечено`:'Пока нет приёмов';$('#bar').max=todays.length||1;$('#bar').value=done;
 const now=new Date().toTimeString().slice(0,5),next=todays.find(x=>!settled(x)&&x.time>=now);
 $('#next').textContent=next?`${next.time} · ${next.med.name}`:todays.some(x=>!settled(x))?'Есть неотмеченные приёмы':todays.length?'Всё на сегодня отмечено':'Добавь своё первое лекарство';
 $('#schedule').innerHTML=items.length?items.map(x=>{const taken=state.taken[x.key],skipped=state.skipped?.[x.key],past=date<today()||(date===today()&&x.time<now);return `<article class="dose ${taken?'done':''}"><div class="dose-top"><time class="time">${x.time}</time><span class="dose-status">${skipped?'Пропущено':taken?completedLabel(x.med):past?'Не отмечено':'По расписанию'}</span></div><div class="dose-info"><h3>${categoryIcon(x.med)}${esc(x.med.name)}</h3><p>${details(x.med)}</p></div><div class="dose-actions">${skipped?`<button data-unskip="${esc(x.key)}">Отменить пропуск</button>`:`${date<=today()?`<button data-take="${esc(x.key)}" aria-label="${taken?'Отменить отметку':'Отметить приём'} ${esc(x.med.name)} в ${x.time}">${taken?'Отменить':completedLabel(x.med)}</button>`:''}${!taken?`<button data-skip="${esc(x.key)}">Пропустить</button>`:''}`}</div></article>`}).join(''):`<div class="empty"><h3>${state.meds.length?'Свободный день':'Начнём с первого лекарства'}</h3><p>${state.meds.length?'На эту дату приёмов нет.':'Добавь название, дозировку и время — здесь появится твоё расписание.'}</p></div>`;
 $('#count').textContent=String(state.meds.length);$('#meds').innerHTML=state.meds.length?state.meds.map(m=>`<article class="med"><div class="med-body">${categoryIcon(m)}<div class="med-info"><strong>${esc(m.name)}</strong><p><b>${esc(categoryLabel(m))}</b>${m.category!=='ointment'&&m.dose?' · '+esc(m.dose):''} · <b>${m.shifts?.length?'Исходное время: ':''}${m.times.length?m.times.join(', '):'Без времени'}</b> · ${m.durationDays?`${m.durationDays} дн.`:m.cycle?`${m.cycle.on} дн. приёма / ${m.cycle.off} дн. перерыва`:m.days.length===7?'Ежедневно':m.days.map(d=>weekdays[d]).join(', ')}</p><p>С ${esc(m.start)}${m.end?' до '+esc(effectiveCourseEnd(m)):' · без даты окончания'}${m.category!=='ointment'&&m.meal?' · '+mealLabels[m.meal]:''}</p>${m.shifts?.length?'<p>Курс сдвинут · переносов: '+m.shifts.length+'</p>':''}${m.category==='ointment'&&m.note?`<p class="med-note">${esc(m.note)}</p>`:''}</div></div><div class="med-actions"><button class="icon" data-edit="${m.id}" aria-label="Изменить ${esc(m.name)}">Изменить</button><button class="icon danger" data-delete="${m.id}" aria-label="Удалить ${esc(m.name)}">Удалить</button></div></article>`).join(''):'<p class="small">Здесь будут сохранённые лекарства.</p>';
}
function openEditor(id){
 editing=id||null;const m=state.meds.find(x=>x.id===id),f=$('#form');f.reset();
 // Keep existing actions editable without offering them for new entries.
 f.elements.category.querySelector('option[value=action]')?.remove();
 if(m?.category==='action')f.elements.category.add(new Option('Действие (ранее созданное)','action'));
 $('#form-error').textContent='';$('#shifted-course-note').hidden=!m?.shifts?.length;$('#form-title').textContent=m?'Изменить запись':'Новая запись';
 f.elements.ointmentNote.value=m?.note||'';
 f.elements.customDose.value=['spray','drops','injection'].includes(m?.category)?m.dose:'';
 for(const key of ['name','end'])f.elements[key].value=m?.[key]||'';
 const choices=['1/4','1/2','1','2','3'],dose=m?m.dose:'1';
 if(!choices.includes(dose))choices.push(dose);
 $('#dose-options').innerHTML=choices.map(value=>`<label><input type="radio" name="dose" value="${esc(value)}" ${value===dose?'checked':''}>${esc(value||'Без дозировки')}</label>`).join('');
 f.elements.meal.value=m?.meal||'any';f.elements.start.value=m?.start||today();f.elements.times.value=m?.times.join(', ')||'';
 $('#week').innerHTML=[1,2,3,4,5,6,0].map(d=>`<label><input type="checkbox" value="${d}" ${(m?m.days.includes(d):true)?'checked':''}>${weekdays[d]}</label>`).join('');
 f.elements.scheduleMode.value=!m?'daily':m.durationDays?'duration':m.cycle?'cycle':!m.end&&m.days.length===7?'daily':'weekly';f.elements.durationDays.value=m?.durationDays||7;f.elements.cycleOn.value=m?.cycle?.on||1;f.elements.cycleOff.value=m?.cycle?.off||1;f.elements.category.value=m?.category||'pill';updateCategory();updateScheduleMode();$('#editor').showModal();
}
function updateCategory(){
 const f=$('#form'),category=f.elements.category.value,ointment=category==='ointment',custom=['spray','drops','injection'].includes(category);
 $('#ointment-note-field').hidden=!ointment;f.elements.ointmentNote.disabled=!ointment;
 $('#custom-dose-field').hidden=!custom;f.elements.customDose.disabled=!custom;
 const doseLabels={spray:['Количество впрыскиваний','Например, 1 впрыскивание в каждую ноздрю'],drops:['Количество капель','Например, 2 капли'],injection:['Дозировка по назначению','Укажи дозу и единицу из назначения']};
 if(custom){$('#custom-dose-label').textContent=doseLabels[category][0];f.elements.customDose.placeholder=doseLabels[category][1]}
 f.elements.name.placeholder=category==='action'?'Например, измерить давление':'Название из назначения';
 $('#dose-fields').hidden=ointment||custom;$('#dose-fields').disabled=ointment||custom;
 const hideMeal=['ointment','spray','injection'].includes(category);
 $('#meal-fields').hidden=hideMeal;$('#meal-fields').disabled=hideMeal;
}
$('#form').elements.category.onchange=updateCategory;

// Multiple 24-hour times: 09001430 -> 09:00, 14:30.
const timeInput=$('#form').elements.times;
// Let native deletion remove separators too; only mask newly entered text.
timeInput.addEventListener('input',event=>{
 if(event.inputType?.startsWith('delete'))return;
 const before=timeInput.value.slice(0,timeInput.selectionStart).replace(/\D/g,'').length;
 const digits=timeInput.value.replace(/\D/g,'').slice(0,192);
 const groups=digits.match(/.{1,4}/g)||[];
 timeInput.value=groups.map(group=>group.length>=2?group.slice(0,2)+':'+group.slice(2):group).join(', ');
 let caret=0,count=0;
 while(caret<timeInput.value.length&&count<before){if(/\d/.test(timeInput.value[caret]))count++;caret++}
 while(caret<timeInput.value.length&&/[^0-9]/.test(timeInput.value[caret]))caret++;
 timeInput.setSelectionRange(caret,caret);
});

function updateScheduleMode(){
 const mode=$('#form').elements.scheduleMode.value;
 for(const [id,value] of [['cycle-fields','cycle'],['weekly-fields','weekly'],['duration-fields','duration']]){$('#'+id).hidden=mode!==value;$('#'+id).disabled=mode!==value}
 const hideEnd=mode==='duration'||mode==='daily';$('#end-field').hidden=hideEnd;$('#form').elements.end.disabled=hideEnd;$('#start-label').textContent=mode==='cycle'?'Первый день приёма':mode==='daily'?'Начало приёма':'Начало курса';updateScheduleHint();
}
$('#form').elements.scheduleMode.onchange=updateScheduleMode;

function updateScheduleHint(){
 const f=$('#form'),mode=f.elements.scheduleMode.value,hint=$('#schedule-hint');
 let text='';
 if(mode==='duration'){
  text='Дата начала считается первым днём курса.';
  const days=Number(f.elements.durationDays.value),start=f.elements.start.value;
  if(start&&f.elements.start.validity.valid&&Number.isInteger(days)&&days>=1&&days<=3650){
   const end=courseEnd(start,days);
   text+=' Последний день — '+new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(end+'T00:00:00Z'))+'.';
  }
 }else if(mode==='cycle'){
  const on=Number(f.elements.cycleOn.value),off=Number(f.elements.cycleOff.value);
  text='Дни приёма + дни перерыва = полный цикл.';
  if([on,off].every(n=>Number.isInteger(n)&&n>=1&&n<=365))text=`Цикл: ${on} дн. приёма + ${off} дн. перерыва = ${on+off} дн. Затем повторяется.`;
 }else if(mode==='daily')text='Ежедневно, без даты окончания.';
 hint.textContent=text;hint.hidden=!text;
}
for(const name of ['durationDays','cycleOn','cycleOff','start'])$('#form').elements[name].addEventListener('input',updateScheduleHint);

$('#add').onclick=()=>openEditor();$('#close').onclick=()=>$('#editor').close();$('#day').value=today();$('#day').onchange=render;
$('#form').onsubmit=async e=>{e.preventDefault();if(busy||!authenticated)return;const f=e.target,isCycle=f.elements.scheduleMode.value==='cycle',days=f.elements.scheduleMode.value!=='weekly'?[0,1,2,3,4,5,6]:[...$('#week').querySelectorAll('input:checked')].map(x=>Number(x.value));const name=f.elements.name.value.trim(),dose=f.elements.category.value==='ointment'?'':['spray','drops','injection'].includes(f.elements.category.value)?f.elements.customDose.value.trim():f.elements.dose.value.trim(),start=f.elements.start.value;let end=f.elements.scheduleMode.value==='daily'?'':f.elements.end.value;const durationDays=Number(f.elements.durationDays.value);if(f.elements.scheduleMode.value==='duration'){if(!Number.isInteger(durationDays)||durationDays<1||durationDays>3650){$('#form-error').textContent='Укажи от 1 до 3650 дней.';return}end=courseEnd(start,durationDays)}if(!name||(!dose&&!['action','ointment'].includes(f.elements.category.value))||!days.length||(end&&end<start)){$('#form-error').textContent='Укажи название, дозировку, хотя бы один день и корректные даты курса.';return}const med={id:editing||crypto.randomUUID(),name,dose,category:f.elements.category.value,start,end,days,times:[...new Set(f.elements.times.value.split(',').map(x=>x.trim()).filter(Boolean))].sort(),...(['ointment','spray','injection'].includes(f.elements.category.value)?{}:{meal:f.elements.meal.value}),note:f.elements.category.value==='ointment'?f.elements.ointmentNote.value.trim():state.meds.find(m=>m.id===editing)?.note||''};if(f.elements.scheduleMode.value==='duration')med.durationDays=durationDays;if(isCycle){const on=Number(f.elements.cycleOn.value),off=Number(f.elements.cycleOff.value);if(![on,off].every(n=>Number.isInteger(n)&&n>=1&&n<=365)){$('#form-error').textContent='Укажи дни приёма и перерыва: целые числа от 1 до 365.';return}med.cycle={on,off}}const original=state.meds.find(m=>m.id===editing);if(original?.shifts)med.shifts=original.shifts;if(editing)state.meds=state.meds.map(m=>m.id===editing?med:m);else state.meds.push(med);const saved=await save();if(saved){$('#editor').close();toast('Сохранено на сервере')}};
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||busy||!authenticated)return;if(b.dataset.take){const key=b.dataset.take;if(state.taken[key]){delete state.taken[key];if(state.fixed)delete state.fixed[key]}else{const [date,id,time]=key.split('|'),med=state.meds.find(m=>m.id===id);if(!med||state.skipped?.[key])return;state.fixed??={};state.fixed[key]=shiftedMoment(med,date+'T'+time);state.taken[key]=new Date().toISOString()}await save();render()}if(b.dataset.edit)openEditor(b.dataset.edit);if(b.dataset.delete&&confirm('Удалить лекарство из расписания?')){state.meds=state.meds.filter(m=>m.id!==b.dataset.delete);await save();render()}});
$('#notifications').onclick=async()=>{if(!('Notification'in window)){toast('Этот браузер не поддерживает уведомления. Напоминания на странице доступны.');return}try{const result=await Notification.requestPermission();$('#notification-status').textContent=result==='granted'?'Уведомления включены для открытой страницы. В фоне возможны задержки; после закрытия сайта они не приходят.':'Уведомления не разрешены. Можно включить их в настройках браузера; напоминания на странице работают.'}catch{toast('Уведомления недоступны. Напоминания на странице продолжают работать.')}};
function tick(){if(!authenticated||window.pushEnabled)return;render();const now=new Date(),minute=now.toTimeString().slice(0,5);for(const x of entries(today())){if(x.time!==minute||settled(x)||state.notified[x.key+'@'+x.moment])continue;state.notified[x.key+'@'+x.moment]=true;toast(`Время приёма: ${x.med.name} · ${x.med.dose}`);if('Notification'in window&&Notification.permission==='granted'){try{new Notification('Время приёма',{body:`${x.med.name} · ${x.med.dose}`,tag:x.key})}catch{}}}}
$('#zone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone;render();setInterval(tick,15000);
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_medication_schedule',description:'Read medication schedule for a local calendar date.',inputSchema:{type:'object',properties:{date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}},required:['date'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:({date})=>{if(!authenticated)throw Error('Login required');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T12:00:00').valueOf()))throw Error('Invalid date');return entries(date).map(x=>({name:x.med.name,dose:x.med.dose,time:x.time,taken:!!state.taken[x.key]}))}})).catch(()=>{})}catch{}}

// Appearance is local to this device, independent of medication data.
const iconOptions=$('#icon-options');
iconOptions.querySelectorAll('[data-icon-preview]').forEach(el=>{el.innerHTML=['pill','ointment','supplement','spray','drops','injection'].map(category=>categoryIcon({category})).join('')});
function syncIconOptions(){iconOptions.querySelectorAll('input').forEach(el=>el.checked=el.value===iconStyle)}
syncIconOptions();
iconOptions.addEventListener('change',event=>{if(event.target.name!=='iconStyle'||!iconStyles.includes(event.target.value))return;iconStyle=event.target.value;document.documentElement.dataset.icons=iconStyle;try{localStorage.setItem(iconStyleKey,iconStyle)}catch{toast('Стиль применён, но браузер не смог его запомнить')}syncIconOptions()});
window.addEventListener('storage',event=>{if(event.key!==iconStyleKey)return;iconStyle=iconStyles.includes(event.newValue)?event.newValue:'glass';document.documentElement.dataset.icons=iconStyle;syncIconOptions()});
