(() => {
  const variants = [ ['original', 'Ритм', 'Текущий · тёмный и лайм'], ['logbook', 'Дневник', 'Белый · синий · строгая сетка'], ['studio', 'Студия', 'Голубой · мягкие формы'], ['sport', 'Атлет', 'Графит · оранжевый · компактный'] ];
  const root = document.documentElement;
  let selected = 'original', common = window.MyDayPreferences?.themeFor?.('gym') || null;
  try { const saved = localStorage.getItem('ritm-style'); if (variants.some(([id]) => id === saved)) selected = saved; } catch {}
  const bar = document.createElement('section');
  bar.className = 'style-picker';
  bar.setAttribute('aria-label', 'Варианты оформления');
  bar.innerHTML = '<span class="style-label">Оформление</span><div class="style-options">' + variants.map(([id, name, detail]) => `<button type="button" class="style-option" data-style="${id}" title="${detail}" aria-pressed="false"><span class="swatch swatch-${id}" aria-hidden="true"></span>${name}</button>`).join('') + '</div><p class="style-sync-note"></p>';
  document.querySelector('[data-gym-appearance]').append(bar);
  function apply(id) {
    const effective=common||id;root.dataset.theme = effective;
    bar.querySelectorAll('button').forEach(b => {b.setAttribute('aria-pressed', String(b.dataset.style === effective));b.disabled=!!common});
    bar.querySelector('.style-sync-note').textContent=common?'Оформление синхронизировано с хабом.':'';
    document.querySelector('meta[name="theme-color"]').content = { original:'#121817', logbook:'#f6f8fc', studio:'#edf4ff', sport:'#18202d' }[effective];
  }
  bar.addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (!b||common) return;selected=b.dataset.style;apply(selected); try { localStorage.setItem('ritm-style', selected); } catch {} });
  window.addEventListener('my-day-common-theme',event=>{common=event.detail?.themeFor?.('gym')||null;apply(selected)});
  apply(selected);
})();
