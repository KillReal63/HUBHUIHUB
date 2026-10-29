'use strict';
function pantryLots(){return state.stocks.flatMap(s=>s.lots.map(l=>({...s,...l})))}
let ruleProduct=null;
const inventoryDialog=document.createElement('dialog');inventoryDialog.id='inventory-editor';
inventoryDialog.setAttribute('aria-label','Партии продукта');document.body.append(inventoryDialog);
const ruleDialog=document.createElement('dialog');ruleDialog.id='rule-editor';
ruleDialog.setAttribute('aria-label','Автопокупка');document.body.append(ruleDialog);
function openRule(id){
 ruleProduct=id;const s=state.stocks.find(x=>x.id===id),r=s.rule;
 ruleDialog.innerHTML=`<form id="rule-form"><div class="dialog-head"><h2>Покупать ${esc(s.name)}</h2><button type="button" data-inventory-close aria-label="Закрыть">×</button></div><label class="check"><input name="enabled" type="checkbox" ${r.enabled?'checked':''}> Автопокупка включена</label><label>Когда создавать дело<select name="mode"><option value="threshold" ${r.mode==='threshold'?'selected':''}>Остаток достиг минимума</option><option value="forecast" ${r.mode==='forecast'?'selected':''}>Заранее по оценке расхода</option></select></label><label>Минимальный остаток, ${esc(s.unit)}<input name="threshold" type="number" min="0" step="any" value="${r.threshold}" required></label><label>Пополнить до, ${esc(s.unit)}<input name="target" type="number" min="0.01" step="any" value="${r.target}" required></label><label>За сколько дней до конца запаса<input name="leadDays" type="number" min="0" max="365" value="${r.leadDays}" required></label><label>Время напоминания<input name="time" type="time" value="${r.time}" required></label><label>Часовой пояс<input name="timezone" maxlength="80" value="${esc(r.timezone)}" required></label><p class="caption">Прогноз — оценка по указанному расходу, а не автоматическое списание. Если время сегодня прошло, уведомление назначается на завтра. Пауза закрывает текущую автопокупку.</p><label class="check"><input name="resume" type="checkbox"> Возобновить после удаления или выполнения дела</label><p id="rule-error" role="alert"></p><button class="primary full">Сохранить правило</button></form>`;
 ruleDialog.querySelector('[data-inventory-close]').onclick=()=>ruleDialog.close();
 ruleDialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget.elements;
  if(Number(f.target.value)<=Number(f.threshold.value)){document.querySelector('#rule-error').textContent='Целевой запас должен быть больше минимального.';return}
  const value={enabled:f.enabled.checked,mode:f.mode.value,threshold:Number(f.threshold.value),target:Number(f.target.value),leadDays:Number(f.leadDays.value),time:f.time.value,timezone:f.timezone.value};
  if(await foodCommand('rule',{product:id,value,resume:f.resume.checked})){ruleDialog.close();toast('Правило сохранено. Покупки пересчитаны.')}
 };
 ruleDialog.showModal();
}
function openLots(id){
 const s=state.stocks.find(x=>x.id===id),labels={purchase:'Куплено',consume:'Съедено',return:'Возвращено',discard:'Списано'};
 inventoryDialog.innerHTML=`<div class="dialog-head"><h2>${esc(s.name)} · партии</h2><button type="button" data-inventory-close aria-label="Закрыть">×</button></div><div class="stock-lots">${s.lots.map(l=>`<p><span>Куплено ${dateText(l.date)} · осталось ${number(l.quantity)} ${esc(s.unit)} · ${l.expiry?'годен до '+dateText(l.expiry):'срок не указан'}</span>${l.quantity>0?`<button data-discard="${esc(l.id)}">Списать партию</button>`:''}</p>`).join('')}</div><h3>История движений</h3>${state.movements.filter(m=>m.stockId===id).slice(-50).reverse().map(m=>`<p>${new Date(m.at).toLocaleString('ru')} · ${labels[m.kind]||esc(m.kind)}: ${number(m.amount)} ${esc(s.unit)}</p>`).join('')||'<p>Импортированный остаток — начальный баланс. Новые движения появятся здесь.</p>'}`;
 inventoryDialog.querySelector('[data-inventory-close]').onclick=()=>inventoryDialog.close();
 inventoryDialog.querySelectorAll('[data-discard]').forEach(b=>b.onclick=async()=>{const lot=s.lots.find(l=>l.id===b.dataset.discard);if(!confirm(`Списать остаток этой партии: ${number(lot.quantity)} ${s.unit}?`))return;if(await foodCommand('discard',{product:id,lot:lot.id,quantity:lot.quantity})){inventoryDialog.close();openLots(id)}});
 inventoryDialog.showModal();
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.rule)openRule(b.dataset.rule);if(b.dataset.lots)openLots(b.dataset.lots);if(b.dataset.buy)stockEditor(b.dataset.buy)});

let foodTargetOpened=false;
window.openHubFood=()=>{
 if(foodTargetOpened)return;
 const params=new URLSearchParams(location.search),stock=params.get('stock'),plan=params.get('plan');
 if(!stock&&!plan)return;foodTargetOpened=true;
 if(stock){
  if(!state.stocks.some(s=>s.id===stock)){toast('Этот продукт уже удалён.');return;}
  tab('pantry');openLots(stock);return;
 }
 const entry=state.plans.find(p=>p.id===plan);
 if(!entry){toast('Это блюдо уже убрано из меню.');return;}
 chooseMenuDay(entry.date);tab('menu');
 const button=[...document.querySelectorAll('[data-remove-plan]')].find(b=>b.dataset.removePlan===plan);
 window.hubFocusRecord?.(button?.closest('.menu-entry'));
};
if(ready)window.openHubFood();
