"""Temporary local API at preview-local.py --port 4188. No real data or push."""
import uuid
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:4188'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/food/');expect(page.locator('main')).to_be_visible()
    expect(page.locator('.sync-status')).to_be_hidden();assert page.locator('.prototype').count()==0
    page.locator('[data-tab=shopping]').click()
    page.locator('#manual-name').fill('Губки <img src=x>')
    page.locator('#manual-form button').click();expect(page.locator('.manual-row')).to_have_count(1)
    expect(page.locator('#manual-name')).to_have_value('');assert page.locator('.manual-row img').count()==0
    page.locator('#manual-name').fill('Тряпки');page.locator('#manual-form button').click()
    expect(page.locator('.manual-row')).to_have_count(2)
    page.locator('[data-manual-check]').first.click();expect(page.locator('[data-manual-check]').first).to_be_checked()
    expect(page.locator('.sync-status')).to_be_hidden()
    page.reload();expect(page.locator('main')).to_be_visible();page.locator('[data-tab=shopping]').click()
    expect(page.locator('[data-manual-check]').first).to_be_checked()
    page.locator('[data-manual-check]').first.click();expect(page.locator('[data-manual-check]').first).not_to_be_checked()
    # Another device updates the list; the stale request must preserve its text.
    current=context.request.get(BASE+'/api/food').json()
    assert context.request.post(BASE+'/api/food',headers={'Origin':BASE},data={'version':current['version'],'operation':str(uuid.uuid4()),'command':'shopping-add','name':'Пакеты'}).status==200
    page.locator('#manual-name').fill('Салфетки');page.locator('#manual-form button').click()
    expect(page.locator('.sync-status')).to_be_visible();expect(page.locator('.sync-status')).to_contain_text('Изменение не сохранено')
    expect(page.locator('#manual-name')).to_have_value('Салфетки')
    page.locator('#manual-form button').click();expect(page.locator('.manual-row')).to_have_count(4)
    expect(page.locator('.sync-status')).to_be_hidden()
    page.locator('[data-manual-check]').first.click();expect(page.locator('[data-manual-check]').first).to_be_checked()
    page.once('dialog',lambda d:d.dismiss());page.locator('#manual-clear').click();expect(page.locator('.manual-row')).to_have_count(4)
    page.once('dialog',lambda d:d.accept());page.locator('#manual-clear').click();expect(page.locator('.manual-row')).to_have_count(3)
    page.once('dialog',lambda d:d.accept());page.locator('[data-manual-delete]').first.click();expect(page.locator('.manual-row')).to_have_count(2)
    backup=context.request.get(BASE+'/api/data/export').json()
    assert len(backup['modules']['food']['state']['manualShopping'])==2
    assert backup['modules']['food']['state']['stocks']==[] and backup['modules']['tasks']['state']['tasks']==[]
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        page.evaluate("document.documentElement.style.fontSize='130%'")
        for theme in ['pistachio','berry','paper','evening']:
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme)
            assert page.locator('.manual-shopping').evaluate('e=>e.scrollWidth<=e.clientWidth')
    for path in ['/gym/','/watch/']:
        page.goto(BASE+path);expect(page.locator('main')).to_be_visible();expect(page.locator('.sync-status')).to_be_hidden()
    # Connection errors and retry stay visible despite hiding the success message.
    page.route('**/api/watch',lambda route:route.fulfill(status=503,json={'error':'Временно недоступно'}))
    page.reload();expect(page.locator('.sync-status')).to_be_visible()
    expect(page.get_by_role('button',name='Повторить подключение')).to_be_visible()
    assert not errors,errors
    browser.close()
    print('PASS: shopping persistence, checks, conflict/retry, clear/delete, export/isolation, mobile themes, quiet success and visible errors in shared sync')
