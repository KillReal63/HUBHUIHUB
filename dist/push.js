window.pushEnabled=false;
const pushStatus=$('#notification-status'),pushButton=$('#notifications');
const supported='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
let pushRegistration=null,pushBusy=false;
// Keep the original registration while it owns a live subscription, so installed
// iPhone apps retain their existing permission and endpoint during the move.
const registrationReady=supported?(async()=>{
 const registrations=await navigator.serviceWorker.getRegistrations();
 const canonical=registrations.find(r=>r.scope===location.origin+'/vovrema/');
 const legacy=registrations.find(r=>r.scope===location.origin+'/');
 // Register the common worker even when keeping an existing medication subscription.
 const root=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
 const keepCanonical=!(legacy&&await legacy.pushManager.getSubscription())&&canonical&&await canonical.pushManager.getSubscription();
 const reg=keepCanonical?await navigator.serviceWorker.register('/vovrema/sw.js',{scope:'/vovrema/'}):root;
 if(!reg.active){await new Promise((resolve,reject)=>{const worker=reg.installing||reg.waiting;if(!worker)return reject(Error('Service worker unavailable'));const timer=setTimeout(()=>reject(Error('Service worker timeout')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve()}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Service worker failed'))}})})}
 return pushRegistration=reg;
})().catch(()=>null):Promise.resolve(null);
function pushUI(enabled,zone){window.pushEnabled=enabled;pushButton.textContent=enabled?'Отключить на этом устройстве':'Включить уведомления';$('#push-test').hidden=!enabled;pushStatus.textContent=enabled?`Включены, даже когда сайт закрыт. Часовой пояс: ${zone}. При смене часового пояса открой сайт, чтобы обновить его. Уведомления продолжат приходить после выхода из аккаунта, пока ты их не отключишь.`:ios&&!standalone?'На iPhone: Safari → Поделиться → На экран «Домой». Открой сайт через новую иконку, войди и включи уведомления.':!supported?'Этот браузер не поддерживает Web Push. Открой сайт в Safari на iPhone через иконку на главном экране.':'Разреши уведомления на этом устройстве. Сервер будет отправлять их даже при закрытом сайте. Для доставки нужен интернет.'}
window.pushRefresh=async()=>{if(!authenticated||pushBusy)return;try{const reg=await registrationReady;if(!reg){pushUI(false);return}const sub=await reg.pushManager.getSubscription();if(!sub||Notification.permission!=='granted'){pushUI(false);return}const status=await api('push/status',{endpoint:sub.endpoint});if(status.enabled){const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(zone!==status.timezone)await api('push/subscribe',{subscription:sub.toJSON(),timezone:zone});pushUI(true,zone)}else pushUI(false)}catch{pushStatus.textContent='Не удалось проверить подписку. Проверь подключение и обнови страницу.'}};
pushButton.onclick=async()=>{
 if(pushBusy||!authenticated)return;
 if(ios&&!standalone){pushUI(false);return}
 if(!supported){pushUI(false);return}
 pushBusy=true;pushButton.disabled=true;
 try{
  if(window.pushEnabled){const reg=await registrationReady;const sub=await reg.pushManager.getSubscription();if(sub){await api('push/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe()}pushUI(false);return}
  const permission=await Notification.requestPermission();
  if(permission!=='granted'){pushStatus.textContent='Уведомления не разрешены. Разреши их для установленного приложения в настройках уведомлений устройства.';return}
  const reg=await registrationReady;if(!reg)throw Error('Не удалось подготовить уведомления. Обнови страницу.');
  const {publicKey}=await api('push/key');
  const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-publicKey.length%4)%4));
  const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  await api('push/subscribe',{subscription:sub.toJSON(),timezone:zone});pushUI(true,zone);
 }catch(e){pushStatus.textContent=e.message||'Не удалось включить уведомления. Попробуй снова.'}finally{pushBusy=false;pushButton.disabled=false}
};
$('#push-test').onclick=async()=>{const button=$('#push-test');button.disabled=true;try{const reg=await registrationReady;const sub=await reg?.pushManager.getSubscription();if(!sub)throw Error('Сначала включи уведомления');await api('push/test',{endpoint:sub.endpoint});toast('Служба доставки приняла тестовое уведомление. Проверь экран уведомлений.')}catch(e){toast(e.message||'Не удалось отправить тест')}finally{button.disabled=false}};
pushUI(false);if(authenticated)window.pushRefresh();window.addEventListener('focus',()=>window.pushRefresh());
