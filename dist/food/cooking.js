'use strict';
let cookingRecipe=null;
const cookDialog=document.createElement('dialog');cookDialog.id='cook-editor';cookDialog.setAttribute('aria-labelledby','cook-title');
cookDialog.innerHTML=`<form id="cook-form"><div class="dialog-head"><h2 id="cook-title">Приготовил</h2><button type="button" id="cook-close" aria-label="Закрыть приготовление">×</button></div><label>Порций<input name="servings" type="number" min="0.5" max="100" step="0.5" value="1" required></label><p class="caption">Сначала спишем партии с ближайшим сроком годности. Блюдо появится в дневнике за сегодня. Удаление записи вернёт ингредиенты в исходные партии.</p><div id="cook-preview" aria-live="polite"></div><p id="cook-error" role="alert"></p><button id="cook-submit" class="primary full">Приготовил · списать ингредиенты</button></form>`;
document.body.append(cookDialog);
function cookingNeeds(recipe,servings){
 const rows=new Map();
 for(const item of recipe.ingredients){const key=FoodPlan.key(item.name,item.unit);if(!rows.has(key))rows.set(key,{name:item.name,unit:item.unit,needed:0,available:0});const row=rows.get(key);row.needed=Math.round((row.needed+item.quantity*servings)*1e6)/1e6;}
 for(const stock of state.stocks){const row=rows.get(FoodPlan.key(stock.name,stock.unit));if(!row)continue;const day=new Intl.DateTimeFormat('en-CA',{timeZone:stock.rule.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());row.available+=stock.lots.filter(l=>!l.expiry||l.expiry>=day).reduce((sum,l)=>sum+l.quantity,0);}
 return [...rows.values()].map(r=>({...r,missing:Math.max(0,Math.round((r.needed-r.available)*1e6)/1e6)}));
}
function previewCooking(){
 const recipe=state.recipes.find(r=>r.id===cookingRecipe),servings=Number($('#cook-form').elements.servings.value);
 const valid=recipe&&Number.isFinite(servings)&&servings>=0.5&&servings<=100;
 const rows=valid?cookingNeeds(recipe,servings):[];
 $('#cook-error').textContent=valid?'':'Укажи от 0,5 до 100 порций.';
 $('#cook-preview').innerHTML=rows.map(r=>`<p><strong>${esc(r.name)}</strong><br>Нужно ${number(r.needed)} ${esc(r.unit)} · есть ${number(r.available)} ${esc(r.unit)}${r.missing>0.000001?`<br><span class="expiry">Не хватает ${number(r.missing)} ${esc(r.unit)}</span>`:''}</p>`).join('');
 $('#cook-submit').disabled=!valid||!rows.length||rows.some(r=>r.missing>0.000001);
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-cook-recipe]');if(!button)return;cookingRecipe=button.dataset.cookRecipe;const recipe=state.recipes.find(r=>r.id===cookingRecipe);if(!recipe)return;$('#cook-title').textContent='Приготовил · '+recipe.name;$('#cook-form').reset();previewCooking();cookDialog.showModal();});
$('#cook-close').onclick=()=>{if(!foodStore.busy)cookDialog.close()};
cookDialog.addEventListener('cancel',e=>{if(foodStore.busy)e.preventDefault()});
$('#cook-form').elements.servings.oninput=previewCooking;
$('#cook-form').onsubmit=async e=>{e.preventDefault();previewCooking();if($('#cook-submit').disabled)return;
 if(await foodCommand('cook',{recipe:cookingRecipe,servings:Number(e.currentTarget.elements.servings.value),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})){
  $('#diary-date').value=today();render();cookDialog.close();toast('Блюдо записано. Ингредиенты списаны из запасов.');
 }else previewCooking();
};
