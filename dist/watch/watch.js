(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),kinds={film:'Фильм',series:'Сериал',other:'Другое'};
  const loading=document.createElement('div');loading.className='app-skeleton';loading.setAttribute('role','status');loading.setAttribute('aria-label','Загружаем список');loading.innerHTML='<span class="app-skeleton-line short"></span><span class="app-skeleton-card"></span><span class="app-skeleton-card"></span>';document.querySelector('main').before(loading);
  let state={items:[]},filter='planned',editing=null;
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  class WatchStore extends HubStore {
    async api(body){
      try{return await super.api(body)}catch(error){
        if(error.status===401){state={items:[]};this.version=null;$('#editor').close();$('main').hidden=true;$('#add').disabled=true;location.replace('/?next=%2Fwatch%2F');}
        throw error;
      }
    }
    offerImport(){} // This app has no earlier browser-only data.
  }
  const store=new WatchStore('watch',null,result=>{state=result;loading.hidden=true;$('#add').disabled=false;render()},()=>!!document.querySelector('dialog[open]'));
  const blocked=()=>store.busy||store.pending||store.version===null;
  function safeUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null}catch{return null}}
  function render(){
    $('#planned-count').textContent=state.items.filter(item=>!item.watched).length;
    $('#watched-count').textContent=state.items.filter(item=>item.watched).length;
    document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
    const list=$('#list');list.replaceChildren();
    const items=state.items.filter(item=>item.watched===(filter==='watched'));
    for(const item of items){
      const card=node('article','watch-card');card.dataset.id=item.id;
      card.append(node('span','watch-kind',kinds[item.kind]),node('h2','',item.title));
      if(item.note)card.append(node('p','watch-note',item.note));
      const url=safeUrl(item.url);
      if(url){const link=node('a','watch-link','Открыть ссылку ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Открыть ссылку: '+item.title+' (в новой вкладке)');card.append(link)}
      const actions=node('div','watch-actions'),toggle=node('button','toggle',item.watched?'Вернуть в список':'Просмотрено'),edit=node('button','','Изменить'),remove=node('button','remove','Удалить');
      for(const button of [toggle,edit,remove])button.type='button';
      toggle.setAttribute('aria-label',(item.watched?'Вернуть в список: ':'Отметить просмотренным: ')+item.title);
      toggle.onclick=async()=>{if(blocked())return;const next=structuredClone(state),current=next.items.find(i=>i.id===item.id);if(current){current.watched=!current.watched;await store.save({state:next})}};
      edit.onclick=()=>openEditor(item.id);
      remove.onclick=async()=>{if(blocked()||!confirm('Удалить «'+item.title+'» вместе с заметкой?'))return;await store.save({state:{items:state.items.filter(i=>i.id!==item.id)}})};
      actions.append(toggle,edit,remove);card.append(actions);list.append(card);
    }
    if(!items.length){
      const empty=node('section','empty');empty.append(node('h2','',filter==='planned'?'Что оставим на вечер?':'Пока без просмотров'),node('p','',filter==='planned'?'Добавь фильм, сериал или что-то другое. Здесь останутся название, заметка и ссылка.':'Отмечай просмотренное — записи и заметки появятся здесь.'));
      if(filter==='planned'){const add=node('button','','Добавить первую запись');add.onclick=()=>openEditor();empty.append(add)}
      list.append(empty);
    }
  }
  function openEditor(id){
    if(blocked())return;const item=state.items.find(i=>i.id===id);editing=item?.id||null;$('#watch-form').reset();$('#form-error').textContent='';
    $('#editor-title').textContent=item?'Изменить запись':'Добавить в список';
    $('#title').value=item?.title||'';$('#kind').value=item?.kind||'film';$('#note').value=item?.note||'';$('#url').value=item?.url||'';
    $('#editor').querySelector('.sync-dialog-status')?.remove();$('#editor').showModal();$('#title').focus();
  }
  $('#add').onclick=()=>openEditor();
  $('#close-editor').onclick=()=>{if(!store.busy)$('#editor').close()};
  $('#editor').addEventListener('cancel',event=>{if(store.busy)event.preventDefault()});
  document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;render()});
  $('#watch-form').onsubmit=async event=>{
    event.preventDefault();if(blocked())return;$('#form-error').textContent='';
    const title=$('#title').value.trim(),url=$('#url').value.trim();
    if(!title){$('#form-error').textContent='Укажи название.';return}
    if(url&&!safeUrl(url)){$('#form-error').textContent='Укажи ссылку с https:// или http:// без логина и пароля.';return}
    const next=structuredClone(state),index=next.items.findIndex(i=>i.id===editing);
    if(editing&&index<0){$('#form-error').textContent='Запись удалена на другом устройстве. Закрой форму и добавь новую.';return}
    const item={id:editing||crypto.randomUUID(),title,kind:$('#kind').value,note:$('#note').value.trim(),url,watched:index>=0?next.items[index].watched:false};
    if(index>=0)next.items[index]=item;else next.items.unshift(item);
    if(await store.save({state:next})){$('#editor').close();if(!editing){filter='planned';render()}editing=null;}
  };
  window.resetAppRecords=async()=>{if(blocked())return false;const result=await store.save({state:{items:[]}});if(result){editing=null;$('#editor').close()}return !!result};
  store.load();
})();
