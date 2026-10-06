/* Pure calendar and ingredient calculations shared by the UI and Node tests. */
(function(root){
 const date=s=>new Date(s+'T12:00:00');
 function addDays(s,n){const d=date(s);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
 function monday(s){return addDays(s,-((date(s).getDay()+6)%7))}
 const key=(name,unit)=>JSON.stringify([name.trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' '),unit]);
 function shopping(plans,recipes,stocks,start,today){
  const end=addDays(start,6),rows=new Map(),pool=stocks.map(s=>({...s,quantity:Math.max(0,s.quantity)})).sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999'));
  for(const plan of plans.filter(p=>p.date>=start&&p.date<=end&&p.date>=today).sort((a,b)=>a.date.localeCompare(b.date))){
   const recipe=recipes.find(r=>r.id===plan.recipeId);if(!recipe)continue;
   for(const ingredient of recipe.ingredients){
    const k=key(ingredient.name,ingredient.unit),needed=ingredient.quantity*plan.servings;
    if(!rows.has(k))rows.set(k,{name:ingredient.name,unit:ingredient.unit,needed:0,available:0,missing:0});
    const row=rows.get(k);row.needed+=needed;let remaining=needed;
    for(const stock of pool){if(key(stock.name,stock.unit)!==k||stock.expiry&&stock.expiry<plan.date)continue;const used=Math.min(remaining,stock.quantity);stock.quantity-=used;remaining-=used;row.available+=used;if(remaining<=0)break;}
    row.missing+=remaining;
   }
  }
  return [...rows.values()].map(r=>({...r,needed:Math.round(r.needed*100)/100,available:Math.round(r.available*100)/100,missing:Math.round(r.missing*100)/100}));
 }
 function useFirst(stocks,today){return stocks.filter(s=>s.quantity>0&&s.expiry&&s.expiry>=today&&s.expiry<=addDays(today,3)).sort((a,b)=>a.expiry.localeCompare(b.expiry))}
 const api={addDays,monday,key,shopping,useFirst};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FoodPlan=api;
})(typeof window==='undefined'?{}:window);
