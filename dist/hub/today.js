(() => {
 'use strict';
 const root=document.getElementById('hub-today');
 const groups=[['tasks','Дела','Нет незавершённых дел на сегодня.','tasks'],['medicine','Лекарства','Нет неотмеченных приёмов на сегодня.','state'],['gym','Тренировка','Программа пока пустая.','gym'],['menu','Меню','На сегодня блюда не запланированы.','food'],['expiry','Использовать первым','Нет продуктов со сроком в ближайшие три дня.','food']];
 const nodes=new Map();let active=false,generation=0,controller=null;
 const element=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n};
 for(const [key,title] of groups){
  const section=element('section',undefined,'today-group');section.dataset.todayGroup=key;
  const heading=element('h3',title);heading.id='today-'+key;section.setAttribute('aria-labelledby',heading.id);
  const body=element('div');section.append(heading,body);root.querySelector('.today-groups').append(section);nodes.set(key,body);
 }
 function message(key,text,retry=false){const body=nodes.get(key);body.replaceChildren(element('p',text,'today-empty'));if(retry){const button=element('button','Повторить');button.type='button';button.onclick=refresh;body.append(button);}}
 function render(module,state){
  const result=HubTodayLogic.build(module,state);
  for(const [key,,empty,source] of groups){if(source!==module)continue;const rows=result[key];if(!rows.length){message(key,empty);continue;}
   const list=element('ul',undefined,'today-list');
   for(const row of rows){const item=element('li'),link=element('a');link.href=row.href;link.append(element('span',row.title,'today-name'),element('span',row.meta,'today-meta'));item.append(link);list.append(item);}
   nodes.get(key).replaceChildren(list);
  }
 }
 async function refresh(){
  if(!active||controller||document.hidden||document.querySelector('dialog[open]'))return;
  const run=generation;controller=new AbortController();const signal=controller.signal;
  document.getElementById('today').textContent=new Intl.DateTimeFormat('ru',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  root.setAttribute('aria-busy','true');
  document.getElementById('today-update').disabled=true;
  try{await Promise.all(['tasks','state','gym','food'].map(async module=>{
   try{
    const response=await fetch('/api/'+module,{credentials:'same-origin',cache:'no-store',signal});
    if(response.status===401){if(run===generation){window.HubToday.setSession(false);window.hubSessionExpired?.();}return;}
    if(!response.ok)throw Error('request');const data=await response.json();
    if(run===generation&&active)render(module,data.state);
   }catch(error){if(signal.aborted||run!==generation)return;for(const [key,,,source] of groups)if(source===module)message(key,'Не удалось обновить. Проверь подключение.',true);}
  }));}finally{if(run===generation){controller=null;root.setAttribute('aria-busy','false');document.getElementById('today-update').disabled=false;}}
 }
 window.HubToday={refresh,setSession(value){
  if(active===value)return;active=value;generation++;controller?.abort();controller=null;root.hidden=!value;
  for(const [key] of groups)message(key,value?'Загружаем…':'');
  root.setAttribute('aria-busy','false');document.getElementById('today-update').disabled=false;if(value)refresh();
 }};
 document.getElementById('today-update').onclick=refresh;
 setInterval(refresh,30000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
