self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function notificationTarget(value){
  try{const url=new URL(value,self.location.origin);if(url.origin===self.location.origin&&(url.pathname==='/tasks/'||url.pathname==='/vovrema/'||url.pathname==='/'))return url.pathname+url.search}catch{}
  return '/vovrema/';
}
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch{}
  event.waitUntil(self.registration.showNotification(data.title||'Вовремя',{
    body:data.body||'Открой расписание приёма лекарств.',
    icon:'/vovrema/icon-192.png',badge:'/vovrema/icon-192.png',tag:data.tag||'vovremya',data:{url:notificationTarget(data.url)},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=notificationTarget(event.notification.data?.url);
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const appWindows=windows.filter(client=>{const url=new URL(client.url);return url.origin===self.location.origin&&(url.pathname.startsWith('/vovrema/')||url.pathname.startsWith('/tasks/')||url.pathname.startsWith('/gym/')||url.pathname==='/')});
    const client=appWindows.find(client=>new URL(client.url).pathname===new URL(target,self.location.origin).pathname)||appWindows[0];
    if(client){if(client.url!==self.location.origin+target)await client.navigate(target);await client.focus();return}
    await self.clients.openWindow(target);
  })());
});
