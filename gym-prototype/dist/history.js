'use strict';
const GymHistory = (() => {
  const sessions = () => state.sessions || [];
  const active = () => sessions().find(s => !s.finishedAt);
  const visible = () => location.hash === '#history' && !program() && !Catalog.active();
  const dateLabel = value => new Date(value + 'T12:00:00').toLocaleDateString('ru', {day:'numeric', month:'long', year:'numeric'});
  const completed = s => s.exercises.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0);
  const results = e => e.sets.filter(x => x.done).map(x => `${x.reps} повт.${x.weight === '' ? '' : ` × ${x.weight} кг`}`).join(' · ');
  let timer = null;
  try { timer = JSON.parse(sessionStorage.getItem('gym-rest-timer') || 'null'); } catch {}

  function previous(exerciseId, session) {
    const previousSession = sessions().filter(s => s.finishedAt && s.id !== session.id && Date.parse(s.startedAt) < Date.parse(session.startedAt))
      .sort((a,b) => Date.parse(b.startedAt)-Date.parse(a.startedAt))
      .find(s => s.exercises.some(e => e.id === exerciseId && e.sets.some(x => x.done)));
    if (!previousSession) return '';
    return `${dateLabel(previousSession.date)}: ${results(previousSession.exercises.find(e => e.id === exerciseId))}`;
  }

  function historyView() {
    const list = sessions().filter(s => s.finishedAt).sort((a,b) => Date.parse(b.startedAt)-Date.parse(a.startedAt));
    return `<div class="heading"><div><p class="eyebrow">ТВОИ РЕЗУЛЬТАТЫ</p><h1>История тренировок</h1><p>Сохранённые подходы, повторения и вес.</p></div></div>
      ${active() ? '<p class="session-resume"><a class="button" href="/gym">Продолжить тренировку</a></p>' : ''}
      ${list.length ? list.map(s => `<details class="panel session-record"><summary><strong>${esc(s.name)}</strong><span>${dateLabel(s.date)} · ${completed(s)} подходов</span></summary>
        <p class="helper">${esc(s.timezone)} · ${Math.max(0,Math.round((Date.parse(s.finishedAt)-Date.parse(s.startedAt))/60000))} мин.</p>
        ${s.exercises.map(e => `<section class="session-result"><h3>${esc(e.name)}</h3><p>${esc(results(e) || 'Без выполненных подходов')}</p>${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}</section>`).join('')}</details>`).join('') :
      '<section class="panel empty"><h2>Первая тренировка впереди</h2><p>Начни тренировку и сохрани выполненные подходы. Здесь останутся результаты.</p><br><a class="button" href="/gym">К тренировке</a></section>'}`;
  }

  function setRow(set, index) {
    return `<div class="session-set"><span class="set-number">${index+1}</span>
      <label>Повторения<input data-set-reps type="number" min="0" max="1000" step="1" required value="${set.reps}"></label>
      <label>Вес, кг<input data-set-weight type="number" min="0" max="2000" step="0.25" placeholder="—" value="${esc(set.weight)}"></label>
      <label class="set-done"><span>Готово</span><input data-set-done type="checkbox" ${set.done ? 'checked' : ''}></label></div>`;
  }

  function activeView() {
    const session = active();
    return `<div class="heading"><div><p class="eyebrow">ТРЕНИРОВКА ИДЁТ</p><h1>${esc(session.name)}</h1><p>${dateLabel(session.date)} · ${esc(session.timezone)}</p></div></div>
      <section class="panel rest-timer" aria-label="Таймер отдыха"><div><h2>Отдых</h2><output id="rest-time" aria-live="off">Готов к подходу</output><span id="rest-status" role="status"></span></div>
        <div class="toolbar"><button class="secondary" data-rest="60">1 мин</button><button class="secondary" data-rest="90">1:30</button><button class="secondary" data-rest="120">2 мин</button><button class="secondary" data-rest="0">Сбросить таймер</button></div></section>
      <form id="session-form" data-session-id="${session.id}">
      ${session.exercises.map(e => { const last = previous(e.id,session); return `<section class="panel session-exercise" data-session-exercise="${e.id}"><h2>${esc(e.name)}</h2>
        ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}<p class="helper">${last ? `В прошлый раз · ${esc(last)}` : 'Первый результат этого упражнения'}</p>
        <div class="session-sets">${e.sets.map(setRow).join('')}</div><div class="toolbar"><button type="button" class="secondary" data-session-add-set>＋ Подход</button><button type="button" class="secondary" data-session-remove-set>Убрать последний подход</button></div></section>`; }).join('')}
      <p class="helper">Плановые значения подставлены для удобства. Отметь выполненные подходы и сохрани прогресс перед выходом.</p>
      <div class="toolbar session-controls"><button type="submit" value="save">Сохранить прогресс</button><button type="submit" value="finish">Завершить тренировку</button><button type="button" class="secondary" data-session-discard>Отменить тренировку</button></div></form>`;
  }

  async function start() {
    if (gymStore.busy || gymStore.pending) return;
    if (active()) { navigate('/gym'); return; }
    const day = current();
    if (!day?.exercises.length) return;
    if (sessions().length >= 1000) { notify('Достигнут лимит: 1000 тренировок. Сначала выгрузи резервную копию.'); return; }
    const now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const date = new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const session = {id:uid(),dayId:day.id,name:day.name,date,timezone,startedAt:now.toISOString(),finishedAt:null,
      exercises:day.exercises.map(e => ({id:e.id,name:e.name,group:e.group,note:e.note || '',
        sets:Array.from({length:e.sets}, () => ({reps:e.reps,weight:e.weight,done:false}))}))};
    state.sessions = [...sessions(),session];
    if (await save()) { navigate('/gym'); notify('Тренировка начата'); }
  }

  function readForm(form) {
    const session = structuredClone(active());
    if (!session || session.id !== form.dataset.sessionId) throw Error('Тренировка изменилась. Открой её заново.');
    session.exercises.forEach(e => {
      const section = [...form.querySelectorAll('[data-session-exercise]')].find(el => el.dataset.sessionExercise === e.id);
      e.sets = [...section.querySelectorAll('.session-set')].map(row => ({reps:Number(row.querySelector('[data-set-reps]').value),
        weight:row.querySelector('[data-set-weight]').value === '' ? '' : Number(row.querySelector('[data-set-weight]').value),done:row.querySelector('[data-set-done]').checked}));
    });
    if (session.exercises.some(e => e.sets.some(s => s.done && s.reps === 0))) throw Error('Укажи повторения в выполненных подходах.');
    return session;
  }

  async function storeSession(session, finish) {
    if (gymStore.busy || gymStore.pending) return;
    if (finish) session.finishedAt = new Date().toISOString();
    state.sessions = sessions().map(s => s.id === session.id ? session : s);
    if (!await save()) return;
    dirty = false;
    if (finish) { setTimer(0); navigate('/gym/#history'); notify('Тренировка сохранена в истории'); }
    else { render(); notify('Прогресс сохранён'); }
  }

  function setTimer(seconds) {
    timer = seconds && active() ? {session:active().id,endsAt:Date.now()+seconds*1000} : null;
    try { if (timer) sessionStorage.setItem('gym-rest-timer',JSON.stringify(timer)); else sessionStorage.removeItem('gym-rest-timer'); } catch {}
    updateTimer();
  }
  function updateTimer() {
    const output = document.querySelector('#rest-time');
    if (!output) return;
    const seconds = timer?.session === active()?.id ? Math.max(0,Math.ceil((timer.endsAt-Date.now())/1000)) : null;
    output.textContent = seconds === null ? 'Готов к подходу' : seconds ? `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}` : 'Отдых окончен';
    const status = document.querySelector('#rest-status'), message = seconds === 0 ? 'Можно начинать следующий подход.' : '';
    if (status.textContent !== message) status.textContent = message;
  }
  setInterval(updateTimer,1000);
  document.addEventListener('visibilitychange',updateTimer);
  document.addEventListener('input',event => {if(event.target.closest('#session-form'))dirty=true;});
  document.addEventListener('change',event => {if(event.target.closest('#session-form'))dirty=true;});
  document.addEventListener('submit',event => {
    if (event.target.id !== 'session-form') return;
    event.preventDefault();
    let session;
    try { session = readForm(event.target); } catch (error) { notify(error.message); return; }
    const finish = event.submitter?.value === 'finish';
    if (finish && session.exercises.some(e => e.sets.some(s => !s.done))) {
      confirmAction('Завершить тренировку?', 'Неотмеченные подходы останутся невыполненными.', 'Завершить', () => storeSession(session,true));
    } else storeSession(session,finish);
  });
  document.addEventListener('click',event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-session-start')) withDiscard(start);
    if (button.hasAttribute('data-rest')) setTimer(Number(button.dataset.rest));
    if (button.hasAttribute('data-session-discard')) confirmAction('Отменить тренировку?', 'Записанные подходы этой незавершённой тренировки будут удалены. История и программа останутся.', 'Отменить тренировку', async () => {
      const id = active()?.id;
      state.sessions = sessions().filter(s => s.id !== id);
      if (await save()) {dirty=false;setTimer(0);render();}
    });
    const section = button.closest('[data-session-exercise]');
    if (section && button.hasAttribute('data-session-add-set')) {
      const rows = section.querySelectorAll('.session-set');
      if (rows.length >= 50) { notify('Не больше 50 подходов в упражнении'); return; }
      const last = rows[rows.length-1];
      section.querySelector('.session-sets').insertAdjacentHTML('beforeend',setRow({reps:Number(last.querySelector('[data-set-reps]').value),weight:last.querySelector('[data-set-weight]').value,done:false},rows.length));
      dirty=true;
    }
    if (section && button.hasAttribute('data-session-remove-set')) {
      const rows = section.querySelectorAll('.session-set');
      if (rows.length <= 1) return;
      const remove = () => {rows[rows.length-1].remove();dirty=true;};
      if (rows[rows.length-1].querySelector('[data-set-done]').checked) confirmAction('Убрать выполненный подход?', 'Его результат будет удалён из текущей тренировки.', 'Убрать подход',remove);
      else remove();
    }
  });
  return {active,visible,historyView,activeView,updateTimer};
})();
