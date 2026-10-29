"""Real disposable API: run preview-local.py --port 4190 first. No real push."""
import os
import uuid
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:4190'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
    context=browser.new_context(viewport={'width':390,'height':844},timezone_id='Asia/Dubai',service_workers='block')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def go(path='/gym/'):
        page.goto(BASE+path);page.wait_for_load_state('networkidle')
    go()
    def state():return context.request.get(BASE+'/api/gym').json()
    def save(**payload):
        response=context.request.post(BASE+'/api/gym',headers={'Origin':BASE},data={'version':state()['version'],'operation':str(uuid.uuid4()),**payload})
        assert response.status==200,response.text()
    save(command='reset')
    data=state()['state']
    data['days']=[{'id':'day-one','name':'Спина и плечи','weekday':None,'groups':['back'],'exercises':[
        {'id':'exercise-one','name':'Тяга блока','group':'back','sets':2,'reps':12,'weight':20,'note':'Плавно'}]}]
    data['selected']='day-one';save(state=data);go()
    page.locator('[data-session-start]').click()
    expect(page.locator('#session-form')).to_be_visible()
    assert len(state()['state']['sessions'])==1
    page.locator('[data-set-weight]').first.fill('22.5')
    page.locator('[data-set-reps]').first.fill('10')
    page.locator('[data-set-done]').first.check()
    # Dirty navigation is guarded; cancellation keeps the typed result.
    page.get_by_role('link',name='История',exact=True).click()
    expect(page.locator('dialog[open]')).to_contain_text('Не сохранять изменения?')
    page.locator('#cancel').click()
    expect(page.locator('[data-set-weight]').first).to_have_value('22.5')
    page.get_by_role('button',name='Сохранить прогресс',exact=True).click()
    expect(page.locator('#notice')).to_have_text('Прогресс сохранён')
    # Four themes, two phone widths, enlarged text; every input remains in bounds.
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        for theme in ['original','logbook','studio','sport']:
            page.evaluate("theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.fontSize='130%'}",theme)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme)
            assert page.locator('#session-form').evaluate('(form)=>[...form.querySelectorAll("input")].every(e=>e.getBoundingClientRect().right<=innerWidth)'),(width,theme)
    # Timer survives refresh and measures elapsed time rather than counting ticks.
    page.locator('[data-rest="60"]').click()
    expect(page.locator('#rest-time')).to_contain_text('1:00')
    page.reload();page.wait_for_load_state('networkidle')
    assert page.locator('#rest-time').inner_text()!='Готов к подходу'
    page.clock.install();page.clock.fast_forward(61000)
    expect(page.locator('#rest-time')).to_have_text('Отдых окончен')
    page.clock.resume()
    # An independent browser resumes the confirmed progress from the server.
    other=browser.new_context(viewport={'width':390,'height':844},timezone_id='Asia/Dubai',service_workers='block')
    second=other.new_page();second.goto(BASE+'/gym/');second.wait_for_load_state('networkidle')
    expect(second.locator('[data-set-weight]').first).to_have_value('22.5')
    expect(second.locator('[data-set-done]').first).to_be_checked()
    # A competing save must reject the stale form, not overwrite another device.
    second.locator('[data-set-reps]').first.fill('11')
    second.get_by_role('button',name='Сохранить прогресс',exact=True).click()
    expect(second.locator('#notice')).to_have_text('Прогресс сохранён')
    page.locator('[data-set-reps]').first.fill('9')
    page.get_by_role('button',name='Сохранить прогресс',exact=True).click()
    expect(page.locator('.sync-status')).to_contain_text('другом устройстве')
    assert state()['state']['sessions'][0]['exercises'][0]['sets'][0]['reps']==11
    page.reload();page.wait_for_load_state('networkidle')
    page.locator('[data-session-add-set]').click()
    expect(page.locator('.session-set')).to_have_count(3)
    page.locator('[data-session-remove-set]').click()
    expect(page.locator('.session-set')).to_have_count(2)
    page.get_by_role('button',name='Завершить тренировку',exact=True).click()
    expect(page.locator('dialog[open]')).to_contain_text('Неотмеченные подходы')
    page.locator('#confirm').click()
    expect(page.locator('.session-record')).to_have_count(1)
    page.locator('.session-record summary').click()
    expect(page.locator('.session-result')).to_contain_text('11 повт. × 22.5 кг')
    original=state()['state']['sessions'][0]
    assert original['finishedAt']
    # Program edits leave old snapshots intact, and the next session shows the previous result.
    data=state()['state'];data['days'][0]['exercises'][0]['name']='Тяга переименована';save(state=data)
    go();page.locator('[data-session-start]').click()
    expect(page.locator('.session-exercise .helper')).to_contain_text('11 повт. × 22.5 кг')
    assert state()['state']['sessions'][0]==original
    page.locator('[data-session-discard]').click();page.locator('#cancel').click()
    expect(page.locator('#session-form')).to_be_visible()
    page.locator('[data-session-discard]').click();page.locator('#confirm').click()
    expect(page.locator('#session-form')).to_have_count(0)
    assert state()['state']['sessions']==[original]
    data=state()['state'];data['days']=[];data['selected']=None;data['done']={};save(state=data)
    go('/gym/#history');page.locator('.session-record summary').click()
    expect(page.locator('.session-result h3')).to_have_text('Тяга блока')
    backup=context.request.get(BASE+'/api/data/export').json()
    assert backup['modules']['gym']['state']['sessions']==[original]
    assert not errors,errors
    other.close();browser.close()
    print('PASS: real API, session snapshots, sets, resume on second device, conflicts, history, timer, export, mobile themes')
