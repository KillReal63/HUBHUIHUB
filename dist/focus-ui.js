let activeView='today';
const previousRender=render;
function setView(view){if(!['today','meds','schedule','history','settings'].includes(view))return;activeView=view;document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==view);document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});window.scrollTo({top:0,behavior:'instant'})}
render=function(){
 previousRender();
 const list=entries(today()),remaining=list.filter(x=>!settled(x)),focus=remaining[0],next=remaining[1];
 $('#focus-hero').innerHTML=focus?`<section class="md-focus-main"><div class="md-focus-time">${esc(focus.time)}</div><div class="md-focus-object">${categoryIcon(focus.med)}</div><h2>${esc(focus.med.name)}</h2><p>${details(focus.med)}</p></section><button class="md-primary" data-take="${esc(focus.key)}">✓ ${focus.med.category==='action'?'Я выполнил':focus.med.category==='ointment'?'Я нанёс':'Я принял'}</button><div class="md-focus-secondary"><button class="md-text-button" data-skip="${esc(focus.key)}">Пропустить</button><button class="md-text-button" data-view="schedule">Всё расписание</button></div>`:`<section class="md-focus-main"><div class="md-focus-time">${list.length?'✓':'—'}</div><div class="md-focus-object"><svg class="category-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="12" y="14" width="40" height="40" rx="8"/><path d="M12 26h40M23 9v10M41 9v10M23 39l6 6 13-13"/></svg></div><h2>${list.length?'Всё на сегодня':state.meds.length?'Сегодня без приёмов':'Пока нет приёмов'}</h2><p>${list.length?'На сегодня больше нет ожидающих приёмов.':state.meds.length?'По твоему расписанию сегодня нет приёмов.':'Добавь препарат и время из своего назначения.'}</p></section><button class="md-primary" ${state.meds.length?'data-view="schedule"':'data-add'}>${state.meds.length?'Посмотреть расписание':'＋ Добавить запись'}</button>`;
 $('#following').innerHTML=next?`<button class="md-focus-next" data-view="schedule"><div><small>Следом</small><strong>${esc(next.med.name)}${next.med.category!=='ointment'&&next.med.dose?' · '+esc(next.med.dose):''}</strong></div><div><small>По расписанию</small>${esc(next.time)}</div></button>`:'';
 const completed=list.filter(x=>state.taken[x.key]).sort((a,b)=>state.taken[b.key].localeCompare(state.taken[a.key]));
 $('#recently-taken').textContent=completed.length?`✓ ${completed[0].med.name} — отмечено в ${new Date(state.taken[completed[0].key]).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}`:'';
 $('#focus-progress').hidden=true;
 $('#summary').innerHTML=list.length?list.map(x=>{const done=!!state.taken[x.key],skipped=!!state.skipped?.[x.key],label=`${x.time} · ${x.med.name} · ${skipped?'Пропущено':done?completedLabel(x.med):'По расписанию'}`;return `<button class="progress-item ${done?'is-done':skipped?'is-skipped':''}" data-view="schedule" title="${esc(label)}" aria-label="${esc(label)}"><span class="progress-time">${esc(x.time)}</span><span class="progress-symbol">${categoryIcon(x.med)}${done?'<span class="progress-check" aria-hidden="true">✓</span>':skipped?'<span class="progress-check" aria-hidden="true">−</span>':''}</span></button>`}).join(''):state.meds.length?'На сегодня приёмов нет':'Расписание появится здесь';
 const history=[];
 for(const [key,stamp] of Object.entries(state.taken))history.push({type:'taken',key,stamp});
 for(const [key,stamp] of Object.entries(state.skipped||{}))history.push({type:'skipped',key,stamp});
 for(const med of state.meds)for(const [index,shift] of (med.shifts||[]).entries())history.push({type:'shift',med,index,shift,stamp:shift.at});
 history.sort((a,b)=>b.stamp.localeCompare(a.stamp));
 $('#history-list').innerHTML=history.length?history.slice(0,100).map(item=>{
  if(item.type==='shift'){
   const {med,shift,index}=item,previous=shiftedMoment(med,shift.from,med.shifts.slice(0,index)),target=moveMoment(previous,shift.minutes);
   return `<article class="dose history-entry"><div class="history-top"><span class="history-status">Курс перенесён</span><time>${esc(new Date(item.stamp).toLocaleDateString('ru',{day:'numeric',month:'short'}))}</time></div><div class="dose-info"><h3>${esc(med.name)}</h3><div class="history-transfer"><p><span>Было</span>${esc(prettyMoment(previous))}</p><p><span>Стало</span>${esc(prettyMoment(target))}</p></div></div>${index===med.shifts.length-1?`<button data-undo-shift="${esc(med.id)}">Отменить перенос</button>`:''}</article>`;
  }
  const [date,id,clock]=item.key.split('|'),med=state.meds.find(m=>m.id===id),skipped=item.type==='skipped',moment=state.fixed?.[item.key]||date+'T'+clock;
  return `<article class="dose history-entry"><div class="history-top"><span class="history-status">${skipped?'Пропущено':completedLabel(med||{})}</span><time>${esc(new Date(item.stamp).toLocaleDateString('ru',{day:'numeric',month:'short'}))}</time></div><div class="dose-info"><h3>${esc(med?.name||'Удалённый препарат')}</h3><p class="history-planned">${esc(prettyMoment(moment))}</p><p class="history-recorded">Отметка в ${esc(new Date(item.stamp).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}))}</p></div><button class="compact-action" ${skipped?'data-unskip':'data-take'}="${esc(item.key)}" aria-label="Отменить ${skipped?'пропуск':'отметку'} ${esc(med?.name||'препарата')}">Отменить</button></article>`;
 }).join(''):'<p class="small">Здесь появятся принятые, пропущенные приёмы и переносы курса.</p>';

};
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.view)setView(button.dataset.view);if(button.hasAttribute('data-add')&&authenticated)openEditor()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)render()});
setInterval(()=>{if(authenticated&&!busy&&!document.hidden)render()},30000);
render();setView('today');
