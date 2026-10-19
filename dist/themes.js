(function(){
 const names={glass:'Стекло',tide:'Прилив',plum:'Слива',dawn:'Рассвет',coal:'Уголь'};
 const colors={glass:'#e6eef4',tide:'#244777',plum:'#554568',dawn:'#fae9cf',coal:'#282623'};
 const key='vovremya-theme-mode';
 function themeAt(hour){return hour>=6&&hour<14?'dawn':hour>=14&&hour<22?'tide':'plum'}
 let mode='auto';try{const saved=localStorage.getItem(key);if(saved==='auto'||names[saved])mode=saved}catch{}
 function apply(){const theme=mode==='auto'?themeAt(new Date().getHours()):mode;document.documentElement.dataset.theme=theme;const phone=document.querySelector('.md-phone');if(phone)phone.className='md-phone focus '+theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[theme]);document.querySelectorAll('[name="theme"]').forEach(el=>el.checked=el.value===mode);const status=document.querySelector('#theme-status');if(status)status.textContent=mode==='auto'?`Сейчас ${names[theme]}.`:`Всегда ${names[theme]} на этом устройстве.`;}
 window.themeAt=themeAt;
 document.addEventListener('DOMContentLoaded',()=>{apply();document.querySelector('#theme-options')?.addEventListener('change',event=>{if(event.target.name!=='theme')return;mode=event.target.value;if(mode!=='auto'&&!names[mode])return;try{localStorage.setItem(key,mode)}catch{window.toast?.('Не удалось запомнить тему в браузере')}apply()})});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)apply()});window.addEventListener('focus',apply);window.addEventListener('storage',event=>{if(event.key===key){mode=event.newValue==='auto'||names[event.newValue]?event.newValue:'auto';apply()}});setInterval(apply,15000);apply();
})();
