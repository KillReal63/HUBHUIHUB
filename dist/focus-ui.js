let activeView='today';
// Presentation-only cutoff: keep earlier dose marks and shifts for schedule calculations.
const historySince=new Date(2026,9,1).getTime();
let historyPage=1,historyDate='',scheduleMonth=today().slice(0,7),historyPageSize=20;
const dayInput=$('#day'),calendar=document.createElement('section');dayInput.hidden=true;calendar.className='schedule-calendar';calendar.setAttribute('aria-label','Календарь расписания');dayInput.parentElement.replaceChildren(dayInput,calendar);
const historyTools=document.createElement('div');historyTools.className='history-tools';historyTools.innerHTML='<label>Найти по дате<input id="history-date" type="date" min="2026-10-01" max="2100-12-31"></label><button type="button" class="compact-action" id="history-clear" hidden>Сбросить</button>';$('#history-list').before(historyTools);
const historyPager=document.createElement('nav');historyPager.id='history-pagination';historyPager.className='history-pagination';historyPager.hidden=true;historyPager.innerHTML='<button type="button" id="history-prev">Назад</button><span id="history-page" aria-live="polite"></span><button type="button" id="history-next">Дальше</button>';$('#history-list').after(historyPager);
function shiftMonth(offset){const [year,month]=scheduleMonth.split('-').map(Number),date=new Date(year,month-1+offset,1);scheduleMonth=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;renderScheduleCalendar()}
function selectScheduleDay(value){dayInput.value=value;scheduleMonth=value.slice(0,7);render();renderScheduleCalendar()}
function renderScheduleCalendar(){
 const [year,month]=scheduleMonth.split('-').map(Number),first=new Date(year,month-1,1),offset=(first.getDay()+6)%7,last=new Date(year,month,0).getDate(),previous=new Date(year,month-1,0).getDate(),selected=dayInput.value||today();
 const cells=Array.from({length:42},(_,index)=>{let number=index-offset+1,cellMonth=month,cellYear=year;if(number<1){number=previous+number;cellMonth--;if(cellMonth<1){cellMonth=12;cellYear--}}else if(number>last){number-=last;cellMonth++;if(cellMonth>12){cellMonth=1;cellYear++}}const value=`${cellYear}-${String(cellMonth).padStart(2,'0')}-${String(number).padStart(2,'0')}`,outside=value.slice(0,7)!==scheduleMonth;return `<button type="button" data-calendar-day="${value}" class="${outside?'outside ':''}${value===selected?'selected':''}" aria-pressed="${value===selected}">${number}</button>`}).join('');
 calendar.innerHTML=`<header><button type="button" data-calendar-prev aria-label="Предыдущий месяц">←</button><strong>${first.toLocaleDateString('ru',{month:'long',year:'numeric'})}</strong><button type="button" data-calendar-next aria-label="Следующий месяц">→</button></header><div class="calendar-weekdays" aria-hidden="true">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-days">${cells}</div>`;
}
calendar.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.calendarDay)selectScheduleDay(button.dataset.calendarDay);if(button?.hasAttribute('data-calendar-prev'))shiftMonth(-1);if(button?.hasAttribute('data-calendar-next'))shiftMonth(1)});
$('#history-date').addEventListener('change',event=>{historyDate=event.target.value;historyPage=1;$('#history-clear').hidden=!historyDate;render()});$('#history-clear').onclick=()=>{historyDate='';historyPage=1;$('#history-date').value='';$('#history-clear').hidden=true;render()};$('#history-prev').onclick=()=>{historyPage=Math.max(1,historyPage-1);render()};$('#history-next').onclick=()=>{historyPage++;render()};
const previousRender=render;
function setView(view){if(!['today','meds','schedule','history','settings'].includes(view))return;activeView=view;document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==view);document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});window.scrollTo({top:0,behavior:'instant'})}
render=function(){
 previousRender();
 renderScheduleCalendar();
 const list=entries(today()),remaining=list.filter(x=>!settled(x)),focus=remaining[0],next=remaining[1];
 $('#focus-hero').innerHTML=focus?`<section class="md-focus-main"><div class="md-focus-time">${esc(focus.time)}</div><div class="md-focus-object">${categoryIcon(focus.med)}</div><h2>${esc(focus.med.name)}</h2><p>${details(focus.med)}</p></section><button class="md-primary" data-take="${esc(focus.key)}">✓ ${focus.med.category==='action'?'Я выполнил':focus.med.category==='ointment'?'Я нанёс':'Я принял'}</button><div class="md-focus-secondary"><button class="md-text-button" data-skip="${esc(focus.key)}">Пропустить</button><button class="md-text-button" data-view="schedule">Всё расписание</button></div>`:`<section class="md-focus-main"><div class="md-focus-object"><svg class="category-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="12" y="14" width="40" height="40" rx="8"/><path d="M12 26h40M23 9v10M41 9v10M23 39l6 6 13-13"/></svg></div><h2>${list.length?'Всё на сегодня':state.meds.length?'Сегодня без приёмов':'Пока нет приёмов'}</h2><p>${list.length?'На сегодня больше нет ожидающих приёмов.':state.meds.length?'По твоему расписанию сегодня нет приёмов.':'Добавь препарат и время из своего назначения.'}</p></section><button class="md-primary" ${state.meds.length?'data-view="schedule"':'data-add'}>${state.meds.length?'Посмотреть расписание':'＋ Добавить запись'}</button>`;
 $('#following').innerHTML=next?`<button class="md-focus-next" data-view="schedule"><div><small>Следом</small><strong>${esc(next.med.name)}${next.med.category!=='ointment'&&next.med.dose?' · '+doseAmount(next.med):''}</strong></div><div><small>По расписанию</small>${esc(next.time)}</div></button>`:'';
 const completed=list.filter(x=>state.taken[x.key]).sort((a,b)=>state.taken[b.key].localeCompare(state.taken[a.key]));
 $('#recently-taken').textContent=completed.length?`✓ ${completed[0].med.name} — отмечено в ${new Date(state.taken[completed[0].key]).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}`:'';
 $('#recently-taken').hidden=!focus||!completed.length;
 $('#focus-progress').hidden=true;
 $('#summary').innerHTML=list.length?list.map(x=>{const done=!!state.taken[x.key],skipped=!!state.skipped?.[x.key],label=`${x.time} · ${x.med.name} · ${skipped?'Пропущено':done?completedLabel(x.med):'По расписанию'}`;return `<button class="progress-item ${done?'is-done':skipped?'is-skipped':''}" data-view="schedule" title="${esc(label)}" aria-label="${esc(label)}"><span class="progress-time">${esc(x.time)}</span><span class="progress-symbol">${categoryIcon(x.med)}${done?'<span class="progress-check" aria-hidden="true">✓</span>':skipped?'<span class="progress-check" aria-hidden="true">−</span>':''}</span></button>`}).join(''):state.meds.length?'На сегодня приёмов нет':'Расписание появится здесь';
 const history=[];
 for(const [key,stamp] of Object.entries(state.taken))history.push({type:'taken',key,stamp});
 for(const [key,stamp] of Object.entries(state.skipped||{}))history.push({type:'skipped',key,stamp});
 for(const med of state.meds)for(const [index,shift] of (med.shifts||[]).entries())history.push({type:'shift',med,index,shift,stamp:shift.at});
 const itemDate=item=>item.type==='shift'?item.shift.from.slice(0,10):item.key.slice(0,10);
 const visibleHistory=history.filter(item=>new Date(item.stamp).getTime()>=historySince&&(!historyDate||itemDate(item)===historyDate)).sort((a,b)=>new Date(b.stamp)-new Date(a.stamp));
 const pages=Math.max(1,Math.ceil(visibleHistory.length/historyPageSize));historyPage=Math.min(historyPage,pages);const pageItems=visibleHistory.slice((historyPage-1)*historyPageSize,historyPage*historyPageSize);
 $('#history-list').innerHTML=pageItems.length?pageItems.map(item=>{
  if(item.type==='shift'){
   const {med,shift,index}=item,previous=shiftedMoment(med,shift.from,med.shifts.slice(0,index)),target=moveMoment(previous,shift.minutes);
   return `<article class="dose history-entry"><div class="history-top"><span class="history-status">${shift.scope==='once'?'Приём перенесён':'Курс перенесён'}</span><time>${esc(new Date(item.stamp).toLocaleDateString('ru',{day:'numeric',month:'short'}))}</time></div><div class="dose-info"><h3>${esc(med.name)}</h3><div class="history-transfer"><p><span>Было</span>${esc(prettyMoment(previous))}</p><p><span>Стало</span>${esc(prettyMoment(target))}</p></div></div>${index===med.shifts.length-1?`<button data-undo-shift="${esc(med.id)}">Отменить перенос</button>`:''}</article>`;
  }
  const [date,id,clock]=item.key.split('|'),med=state.meds.find(m=>m.id===id),skipped=item.type==='skipped',moment=state.fixed?.[item.key]||date+'T'+clock;
  return `<article class="dose history-entry"><div class="history-content"><div class="history-heading"><h3>${esc(med?.name||'Удалённый препарат')}</h3><span class="history-status">${skipped?'Пропущено':completedLabel(med||{})}</span></div><p class="history-planned">${esc(prettyMoment(moment))}</p><p class="history-recorded">Отмечено ${esc(new Date(item.stamp).toLocaleDateString('ru',{day:'numeric',month:'short'}))} в ${esc(new Date(item.stamp).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}))}</p></div><button class="compact-action" ${skipped?'data-unskip':'data-take'}="${esc(item.key)}" aria-label="Отменить ${skipped?'пропуск':'отметку'} ${esc(med?.name||'препарата')}">Отменить</button></article>`;
 }).join(''):`<p class="small">${historyDate?'На выбранную дату записей нет.':'Здесь появятся принятые, пропущенные приёмы и переносы курса.'}</p>`;
 historyPager.hidden=visibleHistory.length<=historyPageSize;$('#history-page').textContent=`${historyPage} из ${pages}`;$('#history-prev').disabled=historyPage<=1;$('#history-next').disabled=historyPage>=pages;

};
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.view)setView(button.dataset.view);if(button.hasAttribute('data-add')&&authenticated)openEditor()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)render()});
setInterval(()=>{if(authenticated&&!busy&&!document.hidden)render()},30000);
render();setView('today');

let doseTargetOpened=false;
window.openHubDose=()=>{
 if(doseTargetOpened)return;
 const params=new URLSearchParams(location.search),key=params.get('dose'),date=params.get('date');
 if(!key)return;doseTargetOpened=true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!scheduleEntries(state,date).some(e=>e.key===key)){toast('Этот приём больше не находится на указанной дате. Проверь расписание.');return;}
 selectScheduleDay(date);setView('schedule');
 const button=[...document.querySelectorAll('#schedule [data-take],#schedule [data-unskip]')].find(b=>(b.dataset.take||b.dataset.unskip)===key);
 window.hubFocusRecord?.(button?.closest('.dose'));
};
