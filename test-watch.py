"""Run with preview-local.py --port 4187. Temporary records, no external requests."""
import os
import uuid
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:4187'
with sync_playwright() as p:
    launch={'headless':True}
    if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
    browser=p.chromium.launch(**launch)
    anonymous=p.request.new_context()
    assert anonymous.get(BASE+'/api/watch').status==401
    assert anonymous.post(BASE+'/api/watch',data={},headers={'Origin':BASE}).status==401
    anonymous.dispose()
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/');page.wait_for_load_state('networkidle')
    page.locator('a.app[href="/watch/"]').click();expect(page.locator('#add')).to_be_enabled()
    page.locator('#add').click()
    page.locator('#title').fill('Фильм <img src=x onerror=alert(1)>')
    page.locator('#kind').select_option('film');page.locator('#note').fill('Совет друзей. Посмотреть в свободный вечер.')
    page.locator('#url').fill('https://example.com/movie')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#editor')).not_to_be_visible()
    expect(page.locator('.watch-card')).to_have_count(1);assert page.locator('.watch-card img').count()==0
    assert page.locator('.watch-link').get_attribute('rel')=='noopener noreferrer'
    page.reload();expect(page.locator('.watch-card')).to_have_count(1)
    page.locator('.toggle').click();expect(page.locator('.watch-card')).to_have_count(0)
    page.locator('[data-filter=watched]').click();expect(page.locator('.watch-card')).to_have_count(1)
    page.locator('.toggle').click();expect(page.locator('.watch-card')).to_have_count(0)
    page.locator('[data-filter=planned]').click();expect(page.locator('.watch-card')).to_have_count(1)
    page.get_by_role('button',name='Изменить',exact=True).click()
    page.locator('#kind').select_option('series');page.locator('#title').fill('Сериал на вечер')
    current=context.request.get(BASE+'/api/watch').json()
    current['state']['items'].append({'id':'other-device','title':'С другого устройства','kind':'other','note':'','url':'','watched':False})
    assert context.request.post(BASE+'/api/watch',data={**current,'operation':str(uuid.uuid4())},headers={'Origin':BASE}).status==200
    page.get_by_role('button',name='Сохранить',exact=True).click()
    expect(page.locator('.sync-dialog-status')).to_contain_text('Изменение не сохранено')
    expect(page.locator('#editor')).to_be_visible()
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#editor')).not_to_be_visible()
    expect(page.locator('.watch-card')).to_have_count(2)
    expect(page.locator('.watch-card').first.locator('.watch-kind')).to_have_text('Сериал')

    # Lose the response after the actual write; retry must not duplicate the record.
    lost=[False]
    def lose_once(route):
        if route.request.method=='POST' and not lost[0]:
            lost[0]=True;route.fetch();route.abort()
        else:route.continue_()
    page.route('**/api/watch',lose_once)
    page.locator('#add').click();page.locator('#title').fill('Документальный выпуск');page.locator('#kind').select_option('other')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#editor')).not_to_be_visible()
    expect(page.locator('.watch-card')).to_have_count(3);assert lost[0]
    page.unroute('**/api/watch',lose_once)
    page.once('dialog',lambda d:d.dismiss());page.locator('.remove').first.click();expect(page.locator('.watch-card')).to_have_count(3)
    page.once('dialog',lambda d:d.accept());page.locator('.remove').first.click();expect(page.locator('.watch-card')).to_have_count(2)
    backup=context.request.get(BASE+'/api/data/export').json();assert len(backup['modules']['watch']['state']['items'])==2
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        for scale in ['100%','130%']:
            page.evaluate('(size)=>document.documentElement.style.fontSize=size',scale)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,scale)
            for card in page.locator('.watch-card').all():assert card.evaluate('e=>e.scrollWidth<=e.clientWidth')
            page.locator('#add').click()
            assert page.locator('#editor').evaluate('e=>e.scrollWidth<=e.clientWidth')
            for field in page.locator('#editor input, #editor select, #editor textarea').all():
                assert field.evaluate('e=>e.getBoundingClientRect().right<=innerWidth')
            page.locator('#close-editor').click()
    page.get_by_role('button',name='Настройки',exact=True).click()
    page.once('dialog',lambda d:d.dismiss());page.get_by_role('button',name='Сбросить записи',exact=True).click()
    assert len(context.request.get(BASE+'/api/watch').json()['state']['items'])==2
    page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Сбросить записи',exact=True).click()
    expect(page.locator('.app-reset-records [role=status]')).to_have_text('Записи сброшены.')
    assert context.request.get(BASE+'/api/watch').json()['state']['items']==[]
    assert context.request.post(BASE+'/api/watch',data={},headers={'Origin':'https://evil.test'}).status==403
    assert not errors,errors
    browser.close()
    print('PASS: shared login, CRUD/statuses, escaping/links, server persistence, conflict, lost response retry, export, reset, 320/390px and enlarged text')
