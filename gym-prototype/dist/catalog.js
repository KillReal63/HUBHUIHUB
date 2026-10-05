'use strict';

// Only text and image paths are local. Photos are requested directly by the browser.
const Catalog = (() => {
  const sourceURL = 'https://github.com/yuhonas/free-exercise-db';
  const pageSize = 24;
  const muscles = {
    abdominals: 'Пресс', abductors: 'Отводящие мышцы бедра', adductors: 'Приводящие мышцы бедра',
    biceps: 'Бицепс', calves: 'Икры', chest: 'Грудь', forearms: 'Предплечья', glutes: 'Ягодицы',
    hamstrings: 'Задняя поверхность бедра', lats: 'Широчайшие', 'lower back': 'Поясница',
    'middle back': 'Середина спины', neck: 'Шея', quadriceps: 'Квадрицепс', shoulders: 'Плечи',
    traps: 'Трапеции', triceps: 'Трицепс'
  };
  const equipment = {
    barbell: 'Штанга', dumbbell: 'Гантели', cable: 'Блок', machine: 'Тренажёр',
    'body only': 'Собственный вес', kettlebells: 'Гири', bands: 'Резинки',
    'medicine ball': 'Медбол', 'exercise ball': 'Фитбол', 'foam roll': 'Массажный ролик',
    'e-z curl bar': 'EZ-гриф', other: 'Другое', unknown: 'Не указано'
  };
  const levels = { beginner: 'Начальный', intermediate: 'Средний', expert: 'Продвинутый' };
  const groups = {
    chest: 'chest', lats: 'back', 'middle back': 'back', 'lower back': 'back', traps: 'back',
    shoulders: 'shoulders', biceps: 'biceps', triceps: 'triceps', quadriceps: 'legs',
    hamstrings: 'legs', calves: 'legs', abductors: 'legs', adductors: 'legs', glutes: 'glutes', abdominals: 'abs'
  };
  let entries = [], revision = '', status = 'idle';
  let russian = null, russianPending = null;
  const filters = { query: '', muscle: '', equipment: '', page: 1 };
  const active = () => location.pathname.replace(/\/$/, '') === '/gym/catalog';
  const title = e => e.ru?.name || e.name;
  const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  const muscleText = list => list.map(m => muscles[m] || m).join(', ');
  const equipmentText = e => equipment[e.equipment || 'unknown'] || e.equipment;
  const groupFor = e => e.primaryMuscles.map(m => groups[m]).find(Boolean) || '';
  const imageURL = (path, rev) => /^[a-f0-9]{40}$/.test(rev) && /^[A-Za-z0-9_()'., -]+\/\d+\.jpg$/.test(path)
    ? `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${rev}/exercises/${path.split('/').map(encodeURIComponent).join('/')}` : '';
  const photo = (path, rev, alt) => {
    const url = imageURL(path, rev);
    return `<div class="catalog-photo">${url ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}<span ${url ? 'hidden' : ''}>Фото недоступно</span></div>`;
  };

  async function fetchJSON(path) {
    const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
    if (response.status === 401 || response.status === 403 ||
        (response.redirected && new URL(response.url, location.origin).pathname === '/')) {
      throw Object.assign(new Error('Hub login required'), { auth: true });
    }
    if (!response.ok) throw Error('Catalog HTTP error');
    return response.json();
  }

  const validTranslation = value => value && typeof value.name === 'string' && value.name.trim() &&
    Array.isArray(value.instructions) && value.instructions.every(text => typeof text === 'string');

  async function loadRussian() {
    if (russian) return russian;
    if (!russianPending) russianPending = (async () => {
      const data = await fetchJSON('/gym/catalog/ru.json');
      if (!/^[a-f0-9]{40}$/.test(data.catalogRevision) || data.language !== 'ru' || !data.exercises ||
          !Object.keys(data.exercises).length || !Object.values(data.exercises).every(validTranslation)) {
        throw Error('Invalid Russian catalog');
      }
      russian = data;
      return data;
    })();
    try { return await russianPending; }
    finally { russianPending = null; }
  }

  async function load() {
    if (status === 'loading' || status === 'ready') return;
    status = 'loading';
    if (active()) render();
    try {
      const data = await fetchJSON('/gym/catalog/exercises.json');
      if (!/^[a-f0-9]{40}$/.test(data.revision) || !Array.isArray(data.exercises) || !data.exercises.length ||
          data.exercises.some(e => typeof e.id !== 'string' || typeof e.name !== 'string' ||
            !['primaryMuscles', 'secondaryMuscles', 'images', 'instructions'].every(key =>
              Array.isArray(e[key]) && e[key].every(value => typeof value === 'string')))) throw Error('Invalid catalog');
      revision = data.revision;
      const locale = await loadRussian();
      if (locale.catalogRevision !== revision || data.exercises.some(e =>
        !validTranslation(locale.exercises[e.id]) || locale.exercises[e.id].instructions.length !== e.instructions.length)) {
        russian = null;
        throw Error('Russian catalog does not match source');
      }
      entries = data.exercises.map(e => ({ ...e, ru: locale.exercises[e.id] }));
      status = 'ready';
    } catch (error) {
      status = error.auth ? 'auth' : 'error';
    }
    // A slow response must never replace the program or an unsaved exercise form.
    if (active()) render();
  }

  function filtered() {
    const words = normalize(filters.query).split(/\s+/).filter(Boolean);
    return entries.filter(e => {
      const allMuscles = [...e.primaryMuscles, ...e.secondaryMuscles];
      const haystack = normalize([title(e), e.name, ...allMuscles, muscleText(allMuscles), equipmentText(e)].join(' '));
      return (!filters.muscle || allMuscles.includes(filters.muscle)) &&
        (!filters.equipment || (e.equipment || 'unknown') === filters.equipment) &&
        words.every(word => haystack.includes(word));
    });
  }

  function results() {
    const found = filtered(), pages = Math.max(1, Math.ceil(found.length / pageSize));
    filters.page = Math.min(filters.page, pages);
    const start = (filters.page - 1) * pageSize;
    return `<p class="helper catalog-count" role="status">Найдено: ${found.length}${found.length ? ` · ${start + 1}–${Math.min(start + pageSize, found.length)}` : ''}</p>
      ${found.length ? `<div class="catalog-grid">${found.slice(start, start + pageSize).map(e => `<button class="secondary catalog-item" data-catalog-open="${esc(e.id)}">
        ${photo(e.images[0] || '', revision, title(e))}<span class="catalog-summary"><strong>${esc(title(e))}</strong>
        ${e.ru?.name ? `<span lang="en">${esc(e.name)}</span>` : ''}<span>${esc(muscleText(e.primaryMuscles))}</span><span>${esc(equipmentText(e))}</span></span>
      </button>`).join('')}</div>` : '<div class="empty"><h2>Ничего не найдено</h2><p>Попробуй другое название или убери фильтры.</p><button class="secondary" data-catalog-action="clear">Сбросить фильтры</button></div>'}
      ${pages > 1 ? `<div class="catalog-pagination"><button class="secondary" data-catalog-page="${filters.page - 1}" ${filters.page === 1 ? 'disabled' : ''}>Назад</button><span>Страница ${filters.page} из ${pages}</span><button class="secondary" data-catalog-page="${filters.page + 1}" ${filters.page === pages ? 'disabled' : ''}>Далее</button></div>` : ''}`;
  }

  function render() {
    app.innerHTML = `<div class="heading"><div><h1>Упражнения</h1><p>Найди упражнение и добавь в свой день тренировки.</p></div></div>
      <section class="panel catalog-panel" aria-label="Каталог упражнений">
      ${status === 'ready' ? `<div class="catalog-filters">
        <label class="field catalog-search">Поиск<input id="catalog-query" type="search" maxlength="100" placeholder="Жим лёжа, squat, гантели…" value="${esc(filters.query)}" aria-controls="catalog-results"></label>
        <label class="field">Мышцы<select id="catalog-muscle"><option value="">Все мышцы</option>${Object.entries(muscles).map(([id, name]) => `<option value="${id}" ${filters.muscle === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
        <label class="field">Оборудование<select id="catalog-equipment"><option value="">Любое</option>${Object.entries(equipment).map(([id, name]) => `<option value="${id}" ${filters.equipment === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      </div><p class="helper">Поиск понимает русские и английские названия. В карточке есть перевод техники и английский оригинал.</p><div id="catalog-results">${results()}</div>` : status === 'auth' ?
        '<div class="empty" role="alert"><h2>Нужно войти в хаб</h2><p>Сессия завершилась. После входа ты вернёшься в каталог; программа остаётся в этом браузере.</p><a class="button" href="/?next=%2Fgym%2Fcatalog">Войти в «Мой день»</a></div>' : status === 'error' ?
        '<div class="empty" role="alert"><h2>Каталог не загрузился</h2><p>Проверь соединение и попробуй ещё раз. Твоя программа сохранена отдельно.</p><button data-catalog-action="retry">Повторить загрузку</button></div>' :
        '<p role="status" class="empty">Загружаем каталог…</p>'}
      </section><p class="helper catalog-source">Источник: <a href="${sourceURL}" target="_blank" rel="noopener noreferrer">free-exercise-db</a> · <a href="/gym/catalog/NOTICE.txt" target="_blank" rel="noopener">О данных и фотографиях</a>. Фотографии загружаются с внешнего сайта.</p>`;
    if (status === 'idle') load();
  }

  function updateResults() {
    const container = document.querySelector('#catalog-results');
    if (container) container.innerHTML = results();
  }

  function technique(entry, translation, problem = '') {
    const translated = validTranslation(translation);
    const instructions = translated ? translation.instructions : entry.instructions;
    const note = translated ? '<p class="helper">Автоматический перевод. Английский оригинал доступен ниже для сверки.</p>' :
      problem === 'loading' ? '<p class="helper" role="status">Загружаем русский перевод…</p>' :
      problem === 'auth' ? '<p class="helper">Для загрузки перевода нужно <a href="/?next=%2Fgym%2Fcatalog">войти в хаб</a>. Ниже сохранённый английский оригинал.</p>' :
      '<p class="helper" role="status">Не удалось загрузить русский перевод. Ниже сохранённый английский оригинал.</p><button class="secondary" data-translation-retry>Повторить загрузку перевода</button>';
    return `<h3>Техника выполнения${translated ? '' : ' · оригинал'}</h3>${note}
      ${instructions.length ? `<ol class="catalog-instructions" lang="${translated ? 'ru' : 'en'}">${instructions.filter(text => text.trim()).map(text => `<li>${esc(text)}</li>`).join('')}</ol>` : '<p>В источнике нет описания техники.</p>'}
      ${translated ? `<details class="catalog-original"><summary>Оригинал на английском</summary><ol class="catalog-instructions" lang="en">${entry.instructions.filter(text => text.trim()).map(text => `<li>${esc(text)}</li>`).join('')}</ol></details>` : ''}`;
  }

  function openDetail(entry, rev, savedName) {
    const returnFocus = document.activeElement;
    const translation = entry.ru || (russian?.catalogRevision === rev ? russian.exercises[entry.id] : null);
    const dlg = modal(`<div class="panel-head"><div><h2 id="catalog-detail-title">${esc(savedName || title(entry))}</h2><p lang="en">${esc(entry.name)}</p></div><button class="secondary" data-catalog-action="close">Закрыть</button></div>
      <p>${esc(muscleText(entry.primaryMuscles))} · ${esc(equipmentText(entry))}${levels[entry.level] ? ` · ${levels[entry.level]}` : ''}</p>
      ${entry.secondaryMuscles.length ? `<p class="helper">Дополнительно: ${esc(muscleText(entry.secondaryMuscles))}</p>` : ''}
      <div class="catalog-photos">${entry.images.length ? entry.images.map((path, i) => photo(path, rev, `${title(entry)} — положение ${i + 1}`)).join('') : photo('', rev, '')}</div>
      <div class="catalog-technique">${technique(entry, translation, 'loading')}</div>
      <p class="helper catalog-source">Источник: <a href="${sourceURL}/tree/${/^[a-f0-9]{40}$/.test(rev) ? rev : 'main'}" target="_blank" rel="noopener noreferrer">free-exercise-db</a>. <a href="/gym/catalog/NOTICE.txt" target="_blank" rel="noopener">О данных и фотографиях</a></p>
      ${savedName ? '' : state.days.length ? `<form id="catalog-add-form" class="editor"><h3>Добавить в программу</h3>
        <div class="form-grid"><label class="field full">День<select name="day">${[...state.days].sort((a, b) => a.weekday - b.weekday).map(day => `<option value="${esc(day.id)}" ${day.id === current()?.id ? 'selected' : ''}>${WEEKDAYS[day.weekday]} · ${esc(day.name)}</option>`).join('')}</select></label>
        <label class="field full">Группа в программе<select name="group" required><option value="" ${!groupFor(entry) ? 'selected' : ''} disabled>Выбери группу мышц</option>${Object.entries(GROUPS).map(([id, [, name]]) => `<option value="${id}" ${id === groupFor(entry) ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
        <label class="field">Подходы<input name="sets" type="number" min="1" max="50" step="1" value="3" required></label>
        <label class="field">Повторения<input name="reps" type="number" min="1" max="1000" step="1" value="12" required></label>
        <label class="field full">Вес, кг · необязательно<input name="weight" type="number" min="0" max="2000" step="0.25" placeholder="Без веса"></label></div>
        <p class="helper" id="catalog-duplicate" role="status"></p><p class="helper" id="catalog-save-error" role="alert"></p><button type="submit">Добавить в программу</button>
      </form>` : '<div class="editor"><p>Сначала создай день в программе, затем вернись к этому упражнению.</p><a class="button" href="/gym/program">Создать день</a></div>'}`);
    dlg.classList.add('catalog-detail');
    dlg.setAttribute('aria-labelledby', 'catalog-detail-title');
    dlg.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
    dlg.querySelector('[data-catalog-action="close"]').onclick = () => dlg.close();
    const refreshTranslation = async () => {
      const container = dlg.querySelector('.catalog-technique');
      container.innerHTML = technique(entry, null, 'loading');
      try {
        const locale = await loadRussian();
        const value = locale.catalogRevision === rev ? locale.exercises[entry.id] : null;
        if (!validTranslation(value) || value.instructions.length !== entry.instructions.length) throw Error('No matching translation');
        if (dlg.isConnected) container.innerHTML = technique(entry, value);
      } catch (error) {
        if (dlg.isConnected) {
          container.innerHTML = technique(entry, null, error.auth ? 'auth' : 'error');
          container.querySelector('[data-translation-retry]')?.addEventListener('click', refreshTranslation);
        }
      }
    };
    // Older saved exercises retain their IDs, custom names and original snapshots.
    // Only the visible technique is enriched; no program data is silently rewritten.
    if (!translation) refreshTranslation();
    const form = dlg.querySelector('#catalog-add-form');
    if (!form) return;
    const duplicate = () => {
      const day = state.days.find(d => d.id === form.elements.day.value);
      const exists = day?.exercises.some(e => e.reference?.id === entry.id && e.reference?.source === 'free-exercise-db');
      dlg.querySelector('#catalog-duplicate').textContent = exists ? 'Упражнение уже есть в этом дне. Можно добавить ещё один экземпляр.' : '';
      form.querySelector('button[type=submit]').textContent = exists ? 'Добавить ещё раз' : 'Добавить в программу';
    };
    form.elements.day.addEventListener('change', duplicate);
    duplicate();
    form.onsubmit = event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form), day = state.days.find(d => d.id === data.get('day'));
      if (!day || !GROUPS[data.get('group')]) return;
      const previousGroups = [...day.groups], previousSelected = state.selected;
      const exercise = {
        id: uid(), name: title(entry), group: data.get('group'), sets: Number(data.get('sets')), reps: Number(data.get('reps')),
        weight: data.get('weight') === '' ? '' : Number(data.get('weight')), note: '',
        reference: { ...entry, source: 'free-exercise-db', revision: rev }
      };
      day.exercises.push(exercise);
      if (!day.groups.includes(exercise.group)) day.groups.push(exercise.group);
      state.selected = day.id;
      if (!save()) {
        day.exercises.pop(); day.groups = previousGroups; state.selected = previousSelected;
        dlg.querySelector('#catalog-save-error').textContent = 'Не удалось сохранить в браузере. Освободи место в хранилище и попробуй снова.';
        return;
      }
      dlg.close();
      navigate('/gym/program');
      notify('Упражнение добавлено в программу');
    };
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.catalogOpen) {
      const entry = entries.find(e => e.id === button.dataset.catalogOpen);
      if (entry) openDetail(entry, revision);
    } else if (button.dataset.exerciseInfo) {
      const exercise = current()?.exercises.find(e => e.id === button.dataset.exerciseInfo);
      if (exercise?.reference) openDetail(exercise.reference, exercise.reference.revision, exercise.name);
    } else if (button.dataset.catalogPage) {
      filters.page = Math.max(1, Number(button.dataset.catalogPage));
      updateResults();
      const first = document.querySelector('[data-catalog-open]');
      first?.focus({ preventScroll: true });
      document.querySelector('#catalog-results')?.scrollIntoView({ block: 'start' });
    } else if (button.dataset.catalogAction === 'retry') load();
    else if (button.dataset.catalogAction === 'clear') {
      Object.assign(filters, { query: '', muscle: '', equipment: '', page: 1 });
      render();
      document.querySelector('#catalog-query')?.focus();
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id !== 'catalog-query') return;
    filters.query = event.target.value; filters.page = 1; updateResults();
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'catalog-muscle' || event.target.id === 'catalog-equipment') {
      filters[event.target.id === 'catalog-muscle' ? 'muscle' : 'equipment'] = event.target.value;
      filters.page = 1; updateResults();
    }
  });
  document.addEventListener('error', event => {
    const img = event.target;
    if (img.tagName === 'IMG' && img.parentElement?.classList.contains('catalog-photo')) {
      img.hidden = true;
      img.parentElement.querySelector('span').hidden = false;
    }
  }, true);
  return { active, render };
})();
