"""Real local HTTP API + disposable SQLite; no external requests or push delivery."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import mimetypes
import os
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'backend'))
OUT=ROOT/'.hub-review/persistence';OUT.mkdir(parents=True,exist_ok=True)

with tempfile.TemporaryDirectory() as directory:
    os.environ['DATA_DIR']=directory
    import server
    server.initialize()
    with server.db() as c:
        c.execute('INSERT INTO sessions VALUES(?,?)',(hashlib.sha256(b'test-session').hexdigest(),time.time()+3600))
        c.execute('INSERT INTO account VALUES(1,?,?)',('test','test'))

    class Local(server.API):
        def do_GET(self):
            path=unquote(urlsplit(self.path).path)
            if path.startswith('/api/'): return super().do_GET()
            if path.startswith('/gym'):
                rel=path.removeprefix('/gym').strip('/')
                file=ROOT/'gym-prototype/dist'/('index.html' if rel in ('','program','catalog') else rel)
            elif path.startswith('/vovrema/'):
                file=ROOT/'dist'/(path.removeprefix('/vovrema/') or 'index.html')
            else:
                file=ROOT/'dist'/('hub/index.html' if path=='/' else path.lstrip('/'))
                if file.is_dir():file=file/'index.html'
            if not file.resolve().is_relative_to(ROOT) or not file.is_file():
                self.send_error(404);return
            data=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(str(file))[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

    http=server.ThreadingHTTPServer(('127.0.0.1',0),Local)
    base=f'http://127.0.0.1:{http.server_port}';server.ORIGIN=base
    thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':390,'height':844},timezone_id='Asia/Dubai',service_workers='block')
            context.add_cookies([{'name':'session','value':'test-session','url':base}])
            context.route('https://**/*',lambda r:r.abort())
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:d.accept())
            def go(path):
                page.goto(base+path);page.wait_for_load_state('networkidle')
            def synced():expect(page.locator('.sync-status')).to_contain_text('Сохранено на сервере')
            def no_overflow():assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.url
            go('/food/');synced()
            page.locator('[data-tab=pantry]').click();page.locator('#stock-add').click()
            form=page.locator('#stock-form');form.locator('[name=name]').fill('Яйца');form.locator('[name=quantity]').fill('10');form.locator('[name=unit]').select_option('шт');form.locator('[name=days]').fill('5');form.locator('button.primary').click();expect(page.locator('#stock-editor')).not_to_be_visible();synced()
            page.locator('[data-rule]').first.click();r=page.locator('#rule-form');r.locator('[name=enabled]').check();r.locator('[name=threshold]').fill('2');r.locator('button.primary').click();expect(page.locator('#rule-editor')).not_to_be_visible()
            page.locator('[data-portion]').click();form=page.locator('#meal-form');form.locator('[name=amount]').fill('8');form.locator('button.primary').click();expect(page.locator('#meal-editor')).not_to_be_visible();synced()
            page.locator('[data-tab=shopping]').click();expect(page.locator('#shopping')).to_contain_text('Купить 8 шт')
            page.screenshot(path=str(OUT/'food-shopping.png'),full_page=True);no_overflow()
            # A second browser context represents another device, without localStorage.
            second=browser.new_context(viewport={'width':390,'height':844},timezone_id='Asia/Dubai',service_workers='block')
            second.add_cookies([{'name':'session','value':'test-session','url':base}]);other=second.new_page();other.goto(base+'/food/');other.wait_for_load_state('networkidle');expect(other.locator('#stocks')).to_contain_text('Учтено 2 шт')
            page.locator('[data-buy]').click();page.locator('#stock-form [name=quantity]').fill('8');page.locator('#stock-form button.primary').click();expect(page.locator('#stock-editor')).not_to_be_visible();synced()
            # The second device still has an older version: its write must be rejected, not merged silently.
            other.locator('[data-tab=pantry]').click();other.locator('[data-portion]').click();other.locator('#meal-form [name=amount]').fill('1');other.locator('#meal-form button.primary').click()
            expect(other.locator('.sync-status')).to_contain_text('Изменение не сохранено');expect(other.locator('#stocks')).to_contain_text('Учтено 10 шт')
            other.locator('#meal-form [data-close]').click()
            go('/tasks/');page.locator('[data-period=any]').click();page.locator('[data-filter=done]').click();expect(page.locator('#list') if page.locator('#list').count() else page.locator('main')).to_contain_text('Купить Яйца')
            go('/food/');page.locator('[data-tab=pantry]').click();page.locator('[data-lots]').click();expect(page.locator('#inventory-editor')).to_contain_text('партии');page.screenshot(path=str(OUT/'food-lots.png'),full_page=True);no_overflow();page.locator('[data-inventory-close]').first.click()
            for width in (320,390):
                page.set_viewport_size({'width':width,'height':844})
                for theme in ('pistachio','berry','paper','evening'):
                    page.locator('#settings-open').click();page.locator(f'[name=theme][value={theme}]').check();page.locator('[data-close=settings]').click();no_overflow()
                page.locator('[data-rule]').first.click();no_overflow();page.locator('#rule-editor [data-inventory-close]').click()
            # Simulate both save responses being lost after the API has committed.
            def lose_response(route):
                if route.request.method=='POST':route.fetch();route.abort()
                else:route.continue_()
            page.route('**/api/food',lose_response)
            page.locator('[data-replenish]').click();page.locator('#stock-form [name=quantity]').fill('3');page.locator('#stock-form button.primary').click()
            expect(page.locator('.sync-status')).to_contain_text('Ответ не получен')
            page.unroute('**/api/food',lose_response);page.locator('#stock-editor').get_by_role('button',name='Повторить подключение').click();synced();expect(page.locator('#stock-editor')).not_to_be_visible();expect(page.locator('#stocks')).to_contain_text('Учтено 13 шт')
            # Actual browser data migration retains the local source and is not replayed on reload.
            local={'version':1,'selected':'local-day','done':{},'days':[{'id':'local-day','name':'Локальный день','weekday':None,'groups':[],'exercises':[]}]}
            page.evaluate('(s)=>localStorage.setItem("ritm-gym-prototype-v1",JSON.stringify(s))',local)
            go('/gym/program');page.get_by_role('button',name='Перенести записи этого браузера').click();expect(page.locator('.day')).to_have_count(1)
            assert page.evaluate('!!localStorage.getItem("ritm-gym-prototype-v1")')
            page.get_by_role('button',name='＋ День',exact=True).click();page.locator('#day-form [name=name]').fill('Новый день');page.get_by_role('button',name='Сохранить день',exact=True).click();expect(page.locator('.day')).to_have_count(2)
            page.get_by_role('button',name='＋ Своё упражнение',exact=True).click();page.locator('#exercise-form [name=name]').fill('Тестовое упражнение');page.get_by_role('button',name='Сохранить упражнение',exact=True).click();expect(page.locator('.edit-row')).to_have_count(1)
            go('/gym');page.locator('input[data-done]').check();synced();page.reload();page.wait_for_load_state('networkidle');expect(page.locator('input[data-done]')).to_be_checked();no_overflow()
            other.goto(base+'/gym/program');other.wait_for_load_state('networkidle');expect(other.locator('.day')).to_have_count(2)
            page.screenshot(path=str(OUT/'gym-synced.png'),full_page=True)
            go('/gym/catalog');page.locator('[data-catalog-open]').first.click();page.locator('#catalog-add-form button[type=submit]').click();expect(page.locator('.edit-row')).to_have_count(2);synced()
            # Export and restore through the visible controls.
            go('/');page.locator('#hub-settings-open').click()
            with page.expect_download() as download:page.locator('#data-export').click()
            backup_path=OUT/'synthetic-backup.json';download.value.save_as(backup_path)
            backup=json.loads(backup_path.read_text(encoding='utf-8'));assert len(backup['modules']['gym']['state']['days'])==2
            assert not any(k in backup for k in ('sessions','password','subscriptions'))
            page.locator('#data-file').set_input_files(backup_path);expect(page.locator('#data-restore')).to_be_visible();expect(page.locator('#data-preview')).to_contain_text('Дни тренировок: 2 → 2')
            with page.expect_download() as download:page.locator('#data-restore').click()
            expect(page.locator('#data-preview')).to_contain_text('Данные восстановлены')
            page.screenshot(path=str(OUT/'restore.png'),full_page=True);no_overflow()
            assert not errors,errors
            second.close();context.close();browser.close()
            print('PASS: real API food purchase/consume/rules/lots; two devices; gym import/edit/completion; export/preview/restore; mobile layout')
    finally:
        http.shutdown();http.server_close();thread.join()
