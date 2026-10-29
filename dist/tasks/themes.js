(()=>{
  const key='my-day-tasks-theme',colors={air:'#e6eef4',sage:'#e8eee7',iris:'#eeeaf4',graphite:'#182229'};
  let current='air',common=null;
  function apply(value){
    current=Object.hasOwn(colors,value)?value:'air';const effective=common||current;
    document.documentElement.dataset.tasksTheme=effective;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[effective]);
    document.querySelectorAll('input[name="tasks-theme"]').forEach(input=>{input.checked=input.value===effective;input.disabled=!!common});
    const status=document.querySelector('#theme-storage');if(status)status.textContent=common?'Оформление синхронизировано с хабом.':'Выбор сохраняется на этом устройстве.';
  }
  function syncCommon(detail){common=detail?.themeFor?.('tasks')||window.MyDayPreferences?.themeFor?.('tasks')||null;apply(current)}
  try{current=localStorage.getItem(key)||'air'}catch{}common=window.MyDayPreferences?.themeFor?.('tasks')||null;
  apply(current);
  window.addEventListener('my-day-common-theme',event=>syncCommon(event.detail));
  document.addEventListener('DOMContentLoaded',()=>{
    apply(current);
    const dialog=document.querySelector('#settings');
    document.querySelector('#open-settings').onclick=()=>dialog.showModal();
    document.querySelector('#close-settings').onclick=()=>dialog.close();
    document.querySelectorAll('input[name="tasks-theme"]').forEach(input=>input.addEventListener('change',()=>{
      if(!input.checked)return;
      if(common){apply(current);return}
      apply(input.value);
      try{localStorage.setItem(key,current);document.querySelector('#theme-storage').textContent='Выбор сохраняется на этом устройстве.'}
      catch{document.querySelector('#theme-storage').textContent='Тема применена. Браузер не разрешил сохранить выбор после закрытия.'}
    }));
  });
  window.addEventListener('storage',event=>{if(event.key===key||event.key===null){try{current=localStorage.getItem(key)||'air'}catch{current='air'}apply(current)}});
})();
