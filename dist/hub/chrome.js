(() => {
 document.querySelectorAll('[data-device-notifications]').forEach(slot=>{
  slot.innerHTML='<details class="device-notifications" open><summary>Уведомления на этом устройстве<span id="device-push-state" class="device-push-state">Проверяем…</span></summary><div class="device-notifications-content"><p id="notification-status" role="status">Проверяем подписку…</p><div class="device-push-actions"><button type="button" id="notifications">Включить уведомления</button><button type="button" id="push-test" hidden>Проверить доставку</button></div><p class="device-push-privacy">Общая подписка для «Таблеток» и «Дел». На экране блокировки — без названий лекарств и дел.</p></div></details>';
 });
 document.querySelectorAll('[data-open-settings]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.openSettings).showModal()));
 document.querySelectorAll('[data-close-settings]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.closeSettings).close()));
})();

(() => {
 const path=location.pathname;
 const config=path.startsWith('/vovrema')?['[data-panel="settings"]','Все лекарства, расписания, переносы и история отметок будут удалены с сервера на всех устройствах.']:
 path.startsWith('/tasks')?['#settings','Все дела, повторы и отметки выполнения будут удалены с сервера на всех устройствах.']:
 path.startsWith('/food')?['#settings','Дневник питания, запасы, история, любимые блюда и меню будут удалены с сервера на всех устройствах. Связанные покупки будут закрыты. Исходная локальная копия сохранится.']:
 path.startsWith('/watch')?['#settings','Все записи «Что посмотреть», заметки и отметки просмотра будут удалены с сервера на всех устройствах.']:
 path.startsWith('/gym')?['#gym-settings','Все дни программы, упражнения, отметки и история тренировок будут удалены с сервера на всех устройствах. Каталог упражнений и исходная локальная копия сохранятся.']:null;
 if(!config)return;
 const settings=document.querySelector(config[0]);if(!settings)return;
 const section=document.createElement('section');section.className='app-reset-records';
 const button=document.createElement('button');button.type='button';button.textContent='Сбросить записи';
 const description=document.createElement('p');description.textContent=config[1];
 const status=document.createElement('p');status.setAttribute('role','status');
 section.append(button,description,status);settings.append(section);
 button.addEventListener('click',async()=>{
  if(!window.resetAppRecords){status.textContent='Приложение ещё загружается. Попробуй снова.';return;}
  if(!confirm(config[1]+'\n\nОтменить сброс нельзя. Сбросить записи?'))return;
  button.disabled=true;status.textContent='Сбрасываем записи…';
  try{const saved=await window.resetAppRecords();status.textContent=saved?'Записи сброшены.':'Сброс не выполнен. Проверь сообщение приложения и повтори попытку.';}
  catch{status.textContent='Не удалось сбросить записи. Проверь подключение и повтори попытку.';}
  finally{button.disabled=false;}
 });
})();
