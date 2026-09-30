(()=>{
  const key='my-day-tasks-theme',colors={air:'#e6eef4',sage:'#e8eee7',iris:'#eeeaf4',graphite:'#182229'};
  let current='air';
  function apply(value){
    current=Object.hasOwn(colors,value)?value:'air';
    document.documentElement.dataset.tasksTheme=current;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[current]);
    document.querySelectorAll('input[name="tasks-theme"]').forEach(input=>input.checked=input.value===current);
  }
  try{current=localStorage.getItem(key)||'air'}catch{}
  apply(current);
  document.addEventListener('DOMContentLoaded',()=>{
    apply(current);
    const dialog=document.querySelector('#settings');
    document.querySelector('#open-settings').onclick=()=>dialog.showModal();
    document.querySelector('#close-settings').onclick=()=>dialog.close();
    document.querySelectorAll('input[name="tasks-theme"]').forEach(input=>input.addEventListener('change',()=>{
      if(!input.checked)return;
      apply(input.value);
      try{localStorage.setItem(key,current);document.querySelector('#theme-storage').textContent='Выбор сохраняется на этом устройстве.'}
      catch{document.querySelector('#theme-storage').textContent='Тема применена. Браузер не разрешил сохранить выбор после закрытия.'}
    }));
  });
  window.addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(event.newValue||'air')});
})();
