/* Loading layouts use the same containers as the screens they stand in for. */
window.HubSkeleton=(()=>{
 const bar=(width='65%',height='1em')=>`<span class="sk-fill" style="width:${width};height:${height}"></span>`;
 const text=()=>`<span class="sk-copy">${bar()}${bar('42%','.7em')}</span>`;
 const rows=(cls,count=3)=>Array.from({length:count},()=>`<div class="${cls}">${text()}${bar('32px','32px')}</div>`).join('');
 const heading=(title)=>`<div class="heading"><div><h1>${title}</h1>${bar('80%')}</div></div>`;
 const tabs=(count)=>`<div class="sk-tabs">${Array.from({length:count},()=>bar('100%','44px')).join('')}</div>`;
 const catalog=()=>`<div class="catalog-filters"><div class="catalog-search">${bar('100%','48px')}</div>${bar('100%','48px')}${bar('100%','48px')}</div><div class="catalog-grid">${Array.from({length:4},()=>`<div class="catalog-item"><span class="catalog-photo sk-fill"></span>${text()}</div>`).join('')}</div>`;
 function body(view){
  switch(view){
   case 'hub':return `<p class="apps-caption">${bar('45%')}</p><nav>${Array.from({length:6},()=>`<div class="app"><span class="mark sk-fill"></span><div>${text()}</div></div>`).join('')}</nav>`;
   case 'tasks':return `${tabs(2)}${tabs(3)}${Array.from({length:3},()=>`<div class="task-row sk-row">${bar('48px','24px')}${text()}${bar('44px','44px')}</div>`).join('')}`;
   case 'watch':return `${tabs(2)}${Array.from({length:3},()=>`<article class="watch-card">${bar('20%','.7em')}<h2>${bar('70%','1em')}</h2>${bar('90%')}<div class="watch-actions">${bar('110px','44px')}${bar('90px','44px')}${bar('70px','44px')}</div></article>`).join('')}`;
   case 'shopping':return `<section class="shopping-intro"><h1>Покупки.</h1>${bar('90%')}${bar('70%')}</section><section class="active-trip"><div class="section-head"><h2>Текущий поход</h2></div>${bar('45%')}<div class="add-row">${bar('100%','48px')}${bar('100px','48px')}</div>${Array.from({length:3},()=>`<div class="shopping-item">${bar('22px','22px')}${text()}${bar('66px','40px')}</div>`).join('')}</section><section class="trip-history"><h2>История походов</h2>${rows('trip-card sk-row',2)}</section>`;
   case 'food-diary':return `<div class="section-heading"><h2>Мой день</h2>${bar('150px','48px')}</div>${bar('70%')}<section class="favorites-panel"><h3>Любимые блюда</h3>${rows('sk-row',1)}</section>${Array.from({length:2},()=>`<section class="meal-group"><header>${bar('35%','1.2em')}</header><article class="meal-row">${bar('44px','1em')}<div>${text()}</div>${bar('32px','32px')}</article></section>`).join('')}${bar('100%','48px')}`;
   case 'food-pantry':return `<div class="section-heading"><h2>Есть дома</h2>${bar('44px','44px')}</div>${Array.from({length:3},()=>`<article class="stock-card"><div class="stock-head"><div>${text()}</div>${bar('48px','44px')}</div><div class="runway">${Array.from({length:7},()=>bar('100%','8px')).join('')}</div>${bar('80%')}</article>`).join('')}`;
   case 'food-menu':return `<h2>Меню на неделю</h2><section class="menu-calendar">${bar('65%','24px')}<div class="sk-calendar">${Array.from({length:35},()=>bar('100%','36px')).join('')}</div></section><div class="menu-week-strip">${Array.from({length:7},()=>bar('100%','54px')).join('')}</div><section class="menu-day">${rows('menu-entry sk-row')}</section>`;
   case 'food-restock':return `<h2>Пора пополнить</h2>${rows('shopping-row sk-row')}<section class="connection-card">${text()}</section>`;
   case 'food-shopping':return `<section class="shopping-bridge"><h2>Список покупок</h2>${bar('90%')}${bar('100%','48px')}</section>`;
   case 'gym-catalog':return heading('Упражнения')+`<section class="panel catalog-panel">${catalog()}</section>`;
   case 'catalog-results':return catalog();
   case 'gym-history':return heading('История тренировок')+rows('panel session-record sk-row');
   case 'gym-program':return heading('Программа')+`<div class="days">${Array.from({length:3},()=>`<div class="day">${bar('45%')}${text()}</div>`).join('')}</div><section class="panel">${bar('50%','1.5em')}${rows('edit-row sk-row')}${tabs(2)}</section>`;
   case 'gym':return heading('Тренировка')+`<div class="days">${Array.from({length:3},()=>`<div class="day">${bar('45%')}${text()}</div>`).join('')}</div><section class="panel"><div class="panel-head">${text()}${bar('48px','32px')}</div>${bar('100%','7px')}${rows('exercise sk-row')}</section>`;
   case 'medicine':return `${tabs(3)}${bar('55%','2em')}${Array.from({length:3},()=>`<div class="sk-medication">${bar('48px','1.2em')}${text()}${bar('100%','44px')}</div>`).join('')}`;
  }
  return '';
 }
 function html(view){return `<div class="screen-skeleton" data-skeleton-view="${view}" role="status" aria-label="Загрузка…"><div aria-hidden="true">${body(view)}</div></div>`}
 return {html};
})();
