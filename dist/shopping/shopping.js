document.querySelector('#shopping-loading').className='';document.querySelector('#shopping-loading').innerHTML=HubSkeleton.html('shopping');
(() => {
 'use strict';
 const $=selector=>document.querySelector(selector),esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 let state={manualShopping:[],shoppingTrips:[],stocks:[]},links=[],shownTrips=10,toastTimer,ready=false;
 function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000)}
 const store=new HubStore('food',null,(next,result)=>{state=next;links=result.shopping||[];ready=true;render();$('main').hidden=false;$('#shopping-loading').hidden=true},()=>!!document.querySelector('dialog[open]'));
 const busy=()=>store.busy||store.pending||!ready;
 async function command(name,extra={}){return !!(await store.save({command:name,...extra}))}
 function dateText(value){const date=new Date(value);return Number.isNaN(date.valueOf())?'Дата не указана':date.toLocaleString('ru',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}
 function render(){
  const items=state.manualShopping||[],done=items.filter(item=>item.done).length;
  $('#active-summary').textContent=items.length?`${done} из ${items.length} отмечено`:'Добавь покупки перед походом';
  $('#active-progress').textContent=items.length?`${done}/${items.length}`:'';$('#active-progress').hidden=!items.length;
  $('#active-list').innerHTML=items.length?items.map(item=>`<div class="shopping-item"><label><input type="checkbox" data-check="${esc(item.id)}" ${item.done?'checked':''}><span>${esc(item.name)}</span></label><button type="button" data-delete="${esc(item.id)}" aria-label="Удалить ${esc(item.name)}">Удалить</button></div>`).join(''):'<p class="empty-list">Список пока пуст. Можно добавить вручную или из подсказок питания.</p>';
  $('#finish-trip').hidden=!items.length;$('#finish-trip').disabled=!done;
  const activeNames=new Set(items.map(item=>' '+item.name.toLowerCase().trim()+' '));
  const suggestions=links.filter(link=>link.task&&!link.suppressed).map(link=>{const stock=(state.stocks||[]).find(item=>item.id===link.product);return stock?{name:stock.name,note:link.task.note}:null}).filter(Boolean).filter(item=>!activeNames.has(' '+item.name.toLowerCase().trim()+' '));
  $('#suggestions-section').hidden=!suggestions.length;
  $('#suggestions-list').innerHTML=suggestions.map(item=>`<div class="suggestion-row"><div><strong>${esc(item.name)}</strong><span>${esc(item.note||'Запас пора пополнить')}</span></div><button type="button" data-suggestion="${esc(item.name)}">В список</button></div>`).join('');
  const trips=state.shoppingTrips||[],visible=trips.slice(0,shownTrips);
  $('#clear-history').hidden=!trips.length;$('#history-more').hidden=shownTrips>=trips.length;
  $('#history-list').innerHTML=visible.length?visible.map(trip=>{const bought=trip.items.filter(item=>item.bought).length;return `<article class="trip-card"><header><div><h3>${bought} из ${trip.items.length} куплено</h3><time datetime="${esc(trip.completedAt)}">${esc(dateText(trip.completedAt))}</time></div><button type="button" data-repeat-trip="${esc(trip.id)}">Повторить</button></header><ul class="trip-items">${trip.items.map(item=>`<li class="${item.bought?'':'not-bought'}"><span aria-hidden="true">${item.bought?'✓':'—'}</span><span>${esc(item.name)}</span><button type="button" data-repeat-item="${esc(item.id)}" data-trip="${esc(trip.id)}">В список</button></li>`).join('')}</ul></article>`}).join(''):'<p class="empty-list">После первого завершённого похода здесь останется его список.</p>';
 }
 $('#shopping-form').onsubmit=async event=>{event.preventDefault();if(busy())return;const input=$('#shopping-name'),name=input.value.trim();if(!name)return;if(await command('shopping-add',{name})){input.value='';input.focus()}};
 $('#active-list').onchange=async event=>{const input=event.target,id=input.dataset.check;if(!id||busy())return;const done=input.checked;input.checked=!done;await command('shopping-check',{item:id,done})};
 $('#active-list').onclick=async event=>{const id=event.target.closest('[data-delete]')?.dataset.delete;if(!id||busy())return;const item=(state.manualShopping||[]).find(item=>item.id===id);if(item&&confirm(`Удалить «${item.name}» из текущего списка?`))await command('shopping-delete',{item:id})};
 $('#suggestions-list').onclick=async event=>{const name=event.target.closest('[data-suggestion]')?.dataset.suggestion;if(name&&!busy())await command('shopping-add',{name})};
 $('#finish-trip').onclick=async()=>{if(busy())return;const pending=(state.manualShopping||[]).filter(item=>!item.done).length;if(pending&&!confirm(`Не отмечено: ${pending}. Завершить поход и сохранить весь список в истории?`))return;if(await command('shopping-finish')){shownTrips=10;toast('Поход сохранён в истории.')}};
 $('#history-list').onclick=async event=>{const tripButton=event.target.closest('[data-repeat-trip]'),itemButton=event.target.closest('[data-repeat-item]');if(busy())return;if(tripButton){if(await command('shopping-repeat',{trip:tripButton.dataset.repeatTrip}))toast('Список похода добавлен.')}else if(itemButton){if(await command('shopping-repeat',{trip:itemButton.dataset.trip,item:itemButton.dataset.repeatItem}))toast('Покупка добавлена в текущий список.')}};
 $('#clear-history').onclick=async()=>{if(!busy()&&confirm('Очистить всю историю походов? Текущий список останется.'))await command('shopping-history-clear')};
 $('#history-more').onclick=()=>{shownTrips+=10;render()};
 window.resetAppRecords=async()=>{if(busy())return false;const saved=await command('shopping-reset');if(saved){shownTrips=10;toast('Покупки и история сброшены.')}return saved};
 store.load();
})();
