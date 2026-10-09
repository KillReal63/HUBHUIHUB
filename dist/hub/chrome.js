(() => {
 document.querySelectorAll('[data-device-notifications]').forEach(slot=>{
  slot.innerHTML='<details class="device-notifications" open><summary>Уведомления на этом устройстве<span id="device-push-state" class="device-push-state">Проверяем…</span></summary><div class="device-notifications-content"><p id="notification-status" role="status">Проверяем подписку…</p><div class="device-push-actions"><button type="button" id="notifications">Включить уведомления</button><button type="button" id="push-test" hidden>Проверить доставку</button></div><p class="device-push-privacy">Общая подписка для «Таблеток» и «Дел». На экране блокировки — без названий лекарств и дел.</p></div></details>';
 });
 document.querySelectorAll('[data-open-settings]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.openSettings).showModal()));
 document.querySelectorAll('[data-close-settings]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.closeSettings).close()));
})();
