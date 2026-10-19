/* Shared, server-confirmed saves. A retry always keeps its original operation ID. */
(function () {
  'use strict';
  window.HubStore = class {
    constructor(module, legacyKey, onState, isEditing = () => false) {
      this.module = module; this.legacyKey = legacyKey; this.onState = onState;
      this.isEditing = isEditing; this.version = null; this.busy = false; this.pending = null;
      this.bar = document.createElement('aside'); this.bar.className = 'sync-status';
      this.bar.setAttribute('aria-live', 'polite');
      document.querySelector('main').before(this.bar);
      try { this.pending = JSON.parse(sessionStorage.getItem('pending-' + module) || 'null'); } catch {}
      this.message('Подключаемся…');
      window.addEventListener('focus', () => this.refresh());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
      setInterval(() => this.refresh(), 30000);
    }
    message(value, retry = false) {
      this.bar.replaceChildren(document.createTextNode(value));
      if (retry) this.button('Повторить подключение', () => this.pending ? this.recover() : this.load());
      document.querySelectorAll('dialog[open]').forEach(dialog=>{
        let status=dialog.querySelector('.sync-dialog-status');
        if(!status){status=document.createElement('div');status.className='sync-dialog-status';status.setAttribute('role','status');dialog.append(status);}
        status.replaceChildren(document.createTextNode(value));
        if(retry){const button=document.createElement('button');button.type='button';button.textContent='Повторить подключение';button.onclick=()=>this.pending?this.recover():this.load();status.append(' ',button);}
      });
    }
    button(label, action) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.onclick = action; this.bar.append(' ', button);
    }
    async api(body) {
      const response = await fetch('/api/' + this.module, {method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: body ? {'Content-Type':'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
      const result = await response.json();
      if (!response.ok) { const error = new Error(result.error || 'Не удалось сохранить'); error.status = response.status; error.result = result; throw error; }
      return result;
    }
    accept(result) { this.version = result.version; this.onState(result.state, result); document.querySelector('main').hidden=false; }
    lock(value) { this.busy = value; document.querySelector('main').inert = value; document.querySelectorAll('dialog form').forEach(f => f.inert = value); }
    async load() {
      if (this.busy) return;
      if (this.pending) return this.recover();
      this.lock(true);
      try { const result = await this.api(); this.accept(result); this.message('Сохранено на сервере'); this.offerImport(); return result; }
      catch (error) { this.version=null; this.message(error.status === 401 ? 'Войди в хаб, чтобы открыть данные.' : 'Нет связи. Записи не загружены.', true); if(error.status===401)document.querySelector('main').hidden=true; }
      finally { this.lock(false); if (this.version === null) document.querySelector('main').inert = true; }
    }
    refresh() { if (!this.busy && !this.pending && !this.isEditing() && !document.hidden) this.load(); }
    async save(payload) {
      if (this.busy || this.pending || this.version === null) return null;
      const body = {...payload, version:this.version, operation:crypto.randomUUID()};
      this.pending = body;
      try { sessionStorage.setItem('pending-' + this.module, JSON.stringify(body)); }
      catch { this.pending = null; this.message('Браузер не может сохранить защиту от повторной отправки. Разреши хранилище.'); return null; }
      return this.send(body);
    }
    clearPending() { this.pending = null; try { sessionStorage.removeItem('pending-' + this.module); } catch {} }
    async recover() {
      const result=await this.send(this.pending);
      if(result){document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.dispatchEvent(new CustomEvent('hub-save-recovered',{detail:this.module}));}
      return result;
    }
    async send(body) {
      if (this.busy) return null;
      this.lock(true); this.message('Сохраняем…');
      try {
        let result;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { result = await this.api(body); break; }
          catch (error) { if (error.status || attempt) throw error; }
        }
        this.clearPending();
        if(body.command==='import'){try{localStorage.setItem(this.legacyKey+'-imported',JSON.stringify(body.state));}catch{}}
        this.accept(result); this.message('Сохранено на сервере'); this.offerImport(); return result;
      } catch (error) {
        if (error.status && error.status < 500) {
          this.clearPending();
          if (error.status === 409 && error.result.state) this.accept(error.result);
          this.message(error.message + ' Изменение не сохранено.');
        } else { this.message('Ответ не получен. Повтори отправку: операция не продублируется.', true); }
        return null;
      } finally { this.lock(false); if (this.pending || this.version === null) document.querySelector('main').inert = true; }
    }
    offerImport() {
      let legacy;
      try { legacy = JSON.parse(localStorage.getItem(this.legacyKey) || 'null'); if (localStorage.getItem(this.legacyKey + '-imported') === JSON.stringify(legacy)) return; }
      catch { return; }
      if (!legacy || !(legacy.days?.length || legacy.meals?.length || legacy.stocks?.length || legacy.recipes?.length || legacy.plans?.length)) return;
      this.button('Перенести записи этого браузера', async () => {
        if (!confirm('Добавить локальные записи к серверным? При расхождении записей перенос остановится. Исходная копия останется в браузере.')) return;
        const result = await this.save({command:'import', state:legacy, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
        if (result) { try { localStorage.setItem(this.legacyKey + '-imported', JSON.stringify(legacy)); } catch {} this.message('Локальные записи перенесены. Исходная копия сохранена.'); }
      });
      this.button('Скачать локальную копию', () => window.HubDownload(legacy, this.module + '-local.json'));
    }
  };
  window.HubDownload = (data, name) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
})();
