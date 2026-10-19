'use strict';
const $=s=>document.querySelector(s), key='my-day-food-prototype-v1',themeKey='my-day-food-theme';
const themes=['pistachio','berry','paper','evening'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateValue=s=>new Date(s+'T12:00:00');
const dateText=s=>dateValue(s).toLocaleDateString('ru',{day:'numeric',month:'short'});
const dayGap=(a,b)=>Math.round((Date.UTC(...a.split('-').map((n,i)=>Number(n)-(i===1?1:0)))-Date.UTC(...b.split('-').map((n,i)=>Number(n)-(i===1?1:0))))/86400000);
function plusDays(date,days){const d=dateValue(date);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
const forecast=s=>plusDays(s.asOf,Math.ceil(s.quantity/s.daily));
const plural=(n,forms)=>forms[new Intl.PluralRules('ru').select(n)==='one'?0:new Intl.PluralRules('ru').select(n)==='few'?1:2];
const number=n=>new Intl.NumberFormat('ru',{maximumFractionDigits:2}).format(n);
let state={meals:[],stocks:[],demo:false},editStock=null,toastTimer,ready=false;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000)}
let shoppingLinks=[];
const foodStore=new HubStore('food',key,(next,result)=>{state=next;shoppingLinks=result.shopping||[];ready=true;render();document.querySelector('main').hidden=false;$('#connection').hidden=true},()=>!!document.querySelector('dialog[open]'));
async function persist(next){return !!(await foodStore.save({state:next}))}
async function foodCommand(command,extra){return !!(await foodStore.save({command,...extra}))}
function changeTheme(theme){if(!themes.includes(theme))return;document.documentElement.dataset.theme=theme;document.querySelector(`input[name=theme][value=${theme}]`).checked=true;document.querySelector('meta[name=theme-color]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();}
try{changeTheme(localStorage.getItem(themeKey)||'pistachio')}catch{}
$('#diary-date').value=today();
function render(){
 const date=$('#diary-date').value||today(),meals=state.meals.filter(m=>m.date===date).sort((a,b)=>a.time.localeCompare(b.time));
 const kcal=meals.reduce((n,m)=>n+(m.kcal??0),0),known=meals.filter(m=>m.kcal!==null).length;
 $('#day-summary').textContent=meals.length?`${meals.length} ${plural(meals.length,['запись','записи','записей'])}${known?` · ${number(kcal)} ккал${known<meals.length?' по заполненным записям':''}`:''}`:'День начинается с первой записи.';
 $('#meals').innerHTML=meals.length?['Завтрак','Обед','Ужин','Перекус'].map(kind=>{const list=meals.filter(m=>m.kind===kind);return list.length?`<section class="meal-group"><header><h3>${kind}</h3><span class="eyebrow">${list.length} ${plural(list.length,['запись','записи','записей'])}</span></header>${list.map(m=>`<article class="meal-row"><time>${esc(m.time)}</time><div><strong>${esc(m.name)}</strong><p>${[m.note&&esc(m.note),m.kcal!==null&&`${number(m.kcal)} ккал`,m.consumed&&`${number(m.consumed.amount)} ${esc(m.consumed.unit)} из запасов`].filter(Boolean).join(' · ')}</p></div><button data-favorite-meal="${esc(m.id)}" aria-label="В любимые: ${esc(m.name)}">♡</button><button data-remove-meal="${esc(m.id)}" aria-label="Удалить запись ${esc(m.name)}">×</button></article>`).join('')}</section>`:''}).join(''):'<div class="empty"><h3>Что сегодня было вкусного?</h3><p>Запиши блюдо или перекус. Здесь соберётся твой день.</p></div>';
 $('#stocks').innerHTML=state.stocks.length?state.stocks.map(s=>{const days=Math.max(0,dayGap(forecast(s),today())),segments=Math.min(7,Math.max(3,s.days));return `<article class="stock-card"><div class="stock-head"><div><h3>${esc(s.name)}</h3><p>Учтено ${number(s.quantity)} ${esc(s.unit)} · ${dateText(s.asOf)}</p></div><strong>${days}<small>дн. по оценке</small></strong></div><div class="runway" aria-label="Осталось примерно ${days} ${plural(days,['день','дня','дней'])}">${Array.from({length:segments},(_,i)=>`<span class="${i<days?'filled':''}"></span>`).join('')}</div><p class="caption">${number(s.daily)} ${esc(s.unit)} в день · ${days?`покупка ${dateText(forecast(s))}`:'пора проверить остаток'}</p>${s.expiry?`<p class="expiry">${s.expiry<today()?'Срок годности прошёл':'Годен до'} ${dateText(s.expiry)}</p>`:''}<div class="stock-actions"><button data-rule="${esc(s.id)}">Автопокупка</button><button data-lots="${esc(s.id)}">Партии и история</button><button data-replenish="${esc(s.id)}">＋ Пополнить</button><button data-portion="${esc(s.id)}" ${s.quantity<=0?'disabled':''}>Съел порцию</button></div></article>`}).join(''):'<div class="empty"><h3>Заглянем в холодильник?</h3><p>Добавь продукт, количество и на сколько дней его обычно хватает.</p></div>';
 const shopping=shoppingLinks.filter(x=>x.task&&!x.suppressed);
 $('#shopping-count').textContent=shopping.length||'';
 $('#shopping').innerHTML=shoppingLinks.map(link=>{const product=state.stocks.find(s=>s.id===link.product);if(!product||!product.rule.enabled)return '';return `<article class="shopping-row"><div><h3>${esc(product.name)}</h3>${link.suppressed?'<p>Покупка закрыта или удалена. Уточни остаток или возобнови правило.</p>':link.task?`<p>${esc(link.task.note)}</p><a href="/tasks/?task=${encodeURIComponent(link.task.id)}">Открыть дело</a>`:'<p>Запаса пока достаточно.</p>'}<div class="inventory-actions"><button data-buy="${esc(product.id)}">Купил · учесть количество</button><button data-rule="${esc(product.id)}">Правило покупки</button></div></div></article>`}).join('')||'<p class="caption">Включи автопокупку в настройках продукта.</p>';
 if(typeof renderPlanner==='function')renderPlanner();
}
function tab(name){document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===name)));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name)}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
$('#settings-open').onclick=()=>$('#settings').showModal();
document.querySelectorAll('[name=theme]').forEach(r=>r.onchange=()=>{changeTheme(r.value);try{localStorage.setItem(themeKey,r.value)}catch{toast('Оформление изменено, но браузер не сохранил выбор.')}});
$('#diary-date').onchange=render;
function mealEditor(stockId){const f=$('#meal-form');f.reset();f.elements.date.value=$('#diary-date').value||today();f.elements.time.value=new Date().toTimeString().slice(0,5);$('#meal-error').textContent='';$('#meal-stock').innerHTML='<option value="">Не списывать</option>'+state.stocks.filter(s=>s.quantity>0).map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${number(s.quantity)} ${esc(s.unit)}</option>`).join('');if(stockId){const s=state.stocks.find(s=>s.id===stockId);f.elements.date.value=today();f.elements.stock.value=s.id;f.elements.amount.value=Math.min(s.quantity,s.daily);f.elements.name.value=s.name;f.querySelector('details').open=true}updateUnit();$('#meal-editor').showModal()}
function updateUnit(){const s=state.stocks.find(s=>s.id===$('#meal-stock').value);$('#consume-unit').textContent=s?s.unit:'в единицах продукта';$('#meal-form').elements.amount.required=!!s;}
$('#meal-stock').onchange=updateUnit;$('#meal-add').onclick=()=>mealEditor();
$('#meal-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,v=f.elements,next=structuredClone(state),s=next.stocks.find(s=>s.id===v.stock.value),amount=Number(v.amount.value);$('#meal-error').textContent='';if(!v.name.value.trim()){ $('#meal-error').textContent='Напиши название блюда.';return}if(s&&(v.date.value!==today()||!Number.isFinite(amount)||amount<=0||amount>s.quantity)){ $('#meal-error').textContent=v.date.value!==today()?'Списать запас можно только для сегодняшнего приёма пищи.':'Количество должно быть больше нуля и не больше остатка.';return}next.meals.push({id:crypto.randomUUID(),name:v.name.value.trim(),kind:v.kind.value,date:v.date.value,time:v.time.value,note:v.note.value.trim(),kcal:v.kcal.value===''?null:Number(v.kcal.value),consumed:s?{stockId:s.id,amount,unit:s.unit}:null});if(await persist(next)){$('#diary-date').value=v.date.value;render();$('#meal-editor').close();toast('Приём пищи записан')}};
function stockEditor(id){editStock=id||null;const f=$('#stock-form');f.reset();f.elements.date.value=today();$('#stock-error').textContent='';$('#stock-title').textContent=id?'Пополнить запас':'Добавить продукт';f.elements.name.readOnly=!!id;f.elements.unit.disabled=!!id;if(id){const s=state.stocks.find(s=>s.id===id);f.elements.name.value=s.name;f.elements.unit.value=s.unit;f.elements.quantity.value=s.batch;f.elements.days.value=s.days;}$('#stock-editor').showModal()}
$('#stock-add').onclick=()=>stockEditor();
$('#stock-form').onsubmit=async e=>{e.preventDefault();const v=e.currentTarget.elements;const value={name:v.name.value.trim(),unit:v.unit.value,quantity:Number(v.quantity.value),days:Number(v.days.value),date:v.date.value,expiry:v.expiry.value,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};if(await foodCommand('stock',{product:editStock,value})){$('#stock-editor').close();toast('Покупка учтена. Запас и дело обновлены.')}};
$('#stocks').onclick=e=>{const b=e.target.closest('button');if(b?.dataset.replenish)stockEditor(b.dataset.replenish);if(b?.dataset.portion)mealEditor(b.dataset.portion)};
$('#meals').onclick=async e=>{const id=e.target.closest('[data-remove-meal]')?.dataset.removeMeal;if(!id)return;const next=structuredClone(state);next.meals=next.meals.filter(m=>m.id!==id);if(await persist(next))toast('Запись удалена. Списанное количество возвращено в исходные партии.')};
async function boot(){await foodStore.load()}
boot();

window.resetAppRecords=async()=>{
 if(!ready)return false;
 const saved=await foodCommand('reset');
 if(saved){editStock=null;document.querySelectorAll('dialog[open]:not(#settings)').forEach(dialog=>dialog.close());toast('Записи питания сброшены');}
 return saved;
};
