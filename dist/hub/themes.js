(()=>{
 const key='my-day-hub-theme',colors={air:'#e6eef4',garden:'#e7efe9',tiles:'#f4e9e3',night:'#202836'};
 let current='air';
 function apply(value){current=Object.hasOwn(colors,value)?value:'air';document.documentElement.dataset.hubTheme=current;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[current]);document.querySelectorAll('[name="hub-theme"]').forEach(input=>input.checked=input.value===current)}
 try{current=localStorage.getItem(key)||'air'}catch{}apply(current);
 document.addEventListener('DOMContentLoaded',()=>{apply(current);document.querySelectorAll('[name="hub-theme"]').forEach(input=>input.addEventListener('change',()=>{if(!input.checked)return;apply(input.value);try{localStorage.setItem(key,current)}catch{document.querySelector('#hub-theme-status').textContent='Тема применена, но браузер не разрешил сохранить выбор.'}}))});
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(event.newValue||'air')});
})();
