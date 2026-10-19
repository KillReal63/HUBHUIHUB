(() => {
 const key='my-day-text-size',sizes=['normal','large','largest'];
 let size='normal';
 try { const saved=localStorage.getItem(key) ?? localStorage.getItem('vovremya-text-size'); if(sizes.includes(saved))size=saved; } catch {}
 function apply(){document.documentElement.dataset.textSize=size;document.documentElement.style.fontSize=({normal:'100%',large:'115%',largest:'130%'})[size];document.querySelectorAll('[name="hub-text-size"]').forEach(input=>input.checked=input.value===size);}
 apply();
 document.addEventListener('DOMContentLoaded',()=>{
  const settings=document.getElementById('hub-settings');
  if(settings){
   const field=document.createElement('fieldset');field.className='hub-text-settings';
   field.innerHTML='<legend>Размер текста</legend><div class="hub-text-choices"><label><input type="radio" name="hub-text-size" value="normal">Обычный</label><label><input type="radio" name="hub-text-size" value="large">Увеличенный</label><label><input type="radio" name="hub-text-size" value="largest">Крупный</label></div><p role="status">Для хаба и всех приложений на этом устройстве.</p>';
   settings.querySelector('.app-dialog-head').after(field);
   field.addEventListener('change',event=>{if(!sizes.includes(event.target.value))return;size=event.target.value;apply();try{localStorage.setItem(key,size);field.querySelector('[role=status]').textContent='Для хаба и всех приложений на этом устройстве.';}catch{field.querySelector('[role=status]').textContent='Размер изменён, но браузер не смог его запомнить.';}});
  }
  apply();
 });
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null){size=sizes.includes(event.newValue)?event.newValue:'normal';apply();}});
})();
