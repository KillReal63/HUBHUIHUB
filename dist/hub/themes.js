(()=>{
 const key='my-day-hub-theme',colors={air:'#e6eef4',garden:'#e7efe9',tiles:'#f4e9e3',night:'#202836'};
 let current='air',common=null;
 function apply(value=current){const selected=Object.hasOwn(colors,value)?value:'air',effective=common||selected;current=selected;document.documentElement.dataset.hubTheme=effective;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[effective]);document.querySelectorAll('[name="hub-theme"]').forEach(input=>input.checked=input.value===effective)}
 function syncCommon(detail){common=detail?.enabled&&Object.hasOwn(colors,detail.profile)?detail.profile:null;apply(current)}
 try{current=localStorage.getItem(key)||'air';if(localStorage.getItem('my-day-theme-sync')==='1'){const saved=localStorage.getItem('my-day-theme-profile');common=Object.hasOwn(colors,saved)?saved:null}}catch{}apply(current);
 window.addEventListener('my-day-common-theme',event=>syncCommon(event.detail));
 document.addEventListener('DOMContentLoaded',()=>{apply(current);document.querySelectorAll('[name="hub-theme"]').forEach(input=>input.addEventListener('change',()=>{if(!input.checked)return;if(common){apply(current);return}apply(input.value);try{localStorage.setItem(key,current)}catch{document.querySelector('#hub-theme-status').textContent='Тема применена, но браузер не разрешил сохранить выбор.'}}))});
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null){try{current=localStorage.getItem(key)||'air'}catch{current='air'}apply(current)}});
})();
