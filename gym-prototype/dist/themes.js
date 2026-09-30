(() => {
  const variants = [ ['original', 'Ритм', 'Текущий · тёмный и лайм'], ['logbook', 'Дневник', 'Белый · синий · строгая сетка'], ['studio', 'Студия', 'Голубой · мягкие формы'], ['sport', 'Атлет', 'Графит · оранжевый · компактный'] ];
  const root = document.documentElement;
  let selected = 'original';
  try { const saved = localStorage.getItem('ritm-style'); if (variants.some(([id]) => id === saved)) selected = saved; } catch {}
  const bar = document.createElement('section');
  bar.className = 'style-picker';
  bar.setAttribute('aria-label', 'Варианты оформления');
  bar.innerHTML = '<span class="style-label">Оформление</span><div class="style-options">' + variants.map(([id, name, detail]) => `<button type="button" class="style-option" data-style="${id}" title="${detail}" aria-pressed="false"><span class="swatch swatch-${id}" aria-hidden="true"></span>${name}</button>`).join('') + '</div>';
  document.querySelector('header').after(bar);
  function apply(id) {
    root.dataset.theme = id;
    bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === id)));
    document.querySelector('meta[name="theme-color"]').content = { original:'#121817', logbook:'#f6f8fc', studio:'#edf4ff', sport:'#18202d' }[id];
  }
  bar.addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (!b) return; apply(b.dataset.style); try { localStorage.setItem('ritm-style', b.dataset.style); } catch {} });
  apply(selected);
})();
