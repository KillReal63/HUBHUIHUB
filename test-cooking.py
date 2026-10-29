"""Disposable preview on port 4189; no production data or real push."""
import datetime as dt
import os
import uuid
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:4189'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
    context=browser.new_context(viewport={'width':390,'height':844},timezone_id='Asia/Dubai',service_workers='block')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/food/');page.wait_for_load_state('networkidle')
    def state():return context.request.get(BASE+'/api/food').json()
    def save(**payload):
        response=context.request.post(BASE+'/api/food',headers={'Origin':BASE},data={'version':state()['version'],'operation':str(uuid.uuid4()),**payload})
        assert response.status==200,response.text()
        return response.json()
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=4))).date().isoformat()
    for name,quantity,unit in [('Яйца',5,'шт'),('Молоко',500,'мл')]:
        save(command='stock',value={'name':name,'quantity':quantity,'unit':unit,'days':5,'date':today,'expiry':'','timezone':'Asia/Dubai'})
    data=state()['state'];data['recipes']=[{'id':'omelet','name':'Омлет с молоком','kind':'Завтрак','note':'','kcal':200,'ingredients':[{'name':'Яйца','quantity':2,'unit':'шт'},{'name':'Молоко','quantity':100,'unit':'мл'}]}]
    save(state=data);page.reload();page.wait_for_load_state('networkidle')
    page.locator('[data-cook-recipe]').click()
    servings=page.locator('#cook-form [name=servings]')
    servings.fill('3');expect(page.locator('#cook-preview')).to_contain_text('Не хватает 1 шт');expect(page.locator('#cook-submit')).to_be_disabled()
    servings.fill('2');expect(page.locator('#cook-submit')).to_be_enabled()
    themes=page.locator('[name=theme]').evaluate_all('(nodes)=>nodes.map(n=>n.value)') or ['pistachio']
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        for theme in themes:
            page.evaluate('theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.fontSize="130%"}',theme)
            assert page.locator('#cook-editor').evaluate('(d)=>d.scrollWidth<=d.clientWidth+1')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # A competing change must not silently cook against a stale version.
    save(state=state()['state']);page.locator('#cook-submit').click()
    expect(page.locator('#cook-editor .sync-dialog-status')).to_contain_text('Данные изменились')
    assert not state()['state']['meals']
    page.locator('#cook-submit').click();expect(page.locator('#cook-editor')).not_to_be_visible()
    data=state()['state'];assert [s['quantity'] for s in data['stocks']]==[1,300]
    assert len(data['meals'])==1 and data['meals'][0]['kcal']==400
    expect(page.locator('#meals')).to_contain_text('Приготовлено: 2 порции')
    page.reload();page.wait_for_load_state('networkidle');expect(page.locator('#meals')).to_contain_text('ингредиенты списаны')
    export=context.request.get(BASE+'/api/data/export').json()
    assert len(export['modules']['food']['state']['meals'][0]['consumptions'])==2
    page.locator('[data-remove-meal]').click();expect(page.locator('[data-remove-meal]')).to_have_count(0)
    assert [s['quantity'] for s in state()['state']['stocks']]==[5,500]
    assert not errors,errors
    browser.close()
print('PASS: recipe shortage preview, servings, atomic cook, conflict/retry, reload, export, exact undo and mobile geometry')
