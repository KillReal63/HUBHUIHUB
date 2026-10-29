"""Temporary local API at preview-local.py --port 4188. No real data or push."""
import uuid
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:4188'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/shopping/');expect(page.locator('main')).to_be_visible()
    expect(page.locator('.sync-status')).to_be_hidden()
    page.locator('#shopping-name').fill('Губки <img src=x>')
    page.locator('#shopping-form button').click();expect(page.locator('.shopping-item')).to_have_count(1)
    expect(page.locator('#shopping-name')).to_have_value('');assert page.locator('.shopping-item img').count()==0
    page.locator('#shopping-name').fill('Тряпки');page.locator('#shopping-form button').click()
    expect(page.locator('.shopping-item')).to_have_count(2)
    page.locator('[data-check]').first.click();expect(page.locator('[data-check]').first).to_be_checked()
    page.once('dialog',lambda dialog:dialog.accept());page.locator('#finish-trip').click()
    expect(page.locator('.shopping-item')).to_have_count(0);expect(page.locator('.trip-card')).to_have_count(1)
    expect(page.locator('.trip-card')).to_contain_text('1 из 2 куплено')
    page.locator('[data-repeat-item]').first.click();expect(page.locator('.shopping-item')).to_have_count(1)
    page.locator('[data-repeat-trip]').click();expect(page.locator('.shopping-item')).to_have_count(2)
    # Another device updates the list; the stale request must preserve its text.
    current=context.request.get(BASE+'/api/food').json()
    assert context.request.post(BASE+'/api/food',headers={'Origin':BASE},data={'version':current['version'],'operation':str(uuid.uuid4()),'command':'shopping-add','name':'Пакеты'}).status==200
    page.locator('#shopping-name').fill('Салфетки');page.locator('#shopping-form button').click()
    expect(page.locator('.sync-status')).to_be_visible();expect(page.locator('.sync-status')).to_contain_text('Изменение не сохранено')
    expect(page.locator('#shopping-name')).to_have_value('Салфетки')
    page.locator('#shopping-form button').click();expect(page.locator('.shopping-item')).to_have_count(4)
    expect(page.locator('.sync-status')).to_be_hidden()
    backup=context.request.get(BASE+'/api/data/export').json()
    assert len(backup['modules']['food']['state']['manualShopping'])==4
    assert len(backup['modules']['food']['state']['shoppingTrips'])==1
    assert backup['modules']['food']['state']['stocks']==[] and backup['modules']['tasks']['state']['tasks']==[]
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        page.evaluate("document.documentElement.style.fontSize='130%'")
        for theme in ['air','garden','tiles','night']:
            page.evaluate('(theme)=>document.documentElement.dataset.commonTheme=theme',theme)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme)
    page.once('dialog',lambda dialog:dialog.accept());page.locator('#clear-history').click();expect(page.locator('.trip-card')).to_have_count(0)
    assert not errors,errors
    browser.close()
    print('PASS: separate shopping app, active trip, history/repeat, conflict/retry, export, common themes and mobile width')
