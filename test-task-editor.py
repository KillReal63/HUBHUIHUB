"""Task form checks against preview-local.py's disposable API. No real push."""
import datetime as dt
import os
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:4186'

with sync_playwright() as p:
    launch = {'headless': True}
    if os.environ.get('CHROMIUM_EXECUTABLE'):
        launch['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
    browser = p.chromium.launch(**launch)
    context = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Asia/Dubai', service_workers='block')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.clock.install(time=dt.datetime(2026, 10, 22, 8, tzinfo=dt.timezone.utc))
    page.goto(BASE+'/tasks/')
    page.wait_for_load_state('networkidle')
    page.locator('[data-period=any]').click()
    page.locator('#add').click()
    page.locator('#title').fill('Проверить фильтр и купить необходимые расходники')
    page.locator('#repeat').select_option('interval')
    expect(page.locator('#interval')).to_be_visible()
    page.locator('#interval').fill('3')
    page.locator('#date').fill('2099-01-01')
    page.locator('#time').fill('09:00')
    expect(page.locator('#reminder-minutes')).to_have_value('0')
    page.locator('#reminder-minutes').select_option('30')
    page.locator('#add-subtask').click()
    page.get_by_role('textbox', name='Подзадача 1', exact=True).fill('Паспорт')
    page.locator('#add-subtask').click()
    page.get_by_role('textbox', name='Подзадача 2', exact=True).fill('Анкета')
    page.locator('#save').click()
    expect(page.locator('#editor')).not_to_be_visible()
    expect(page.locator('.task-row')).to_have_count(1)
    expect(page.locator('.task-meta').first).to_contain_text('Каждые 3 дн.')
    expect(page.locator('.task-row')).to_contain_text('Ещё до 3 напоминаний · каждые 30 мин')
    page.locator('.task-checklist input').first.click()
    expect(page.locator('.task-checklist legend')).to_have_text('Подзадачи · 1 из 2')
    current = context.request.get(BASE+'/api/tasks').json()
    first_subtask = current['state']['tasks'][0]['subtasks'][0]['id']
    assert current['state']['tasks'][0]['subtaskDone'] == {'2099-01-01': [first_subtask]}
    assert current['state']['tasks'][0]['reminderMinutes'] == 30

    page.locator('.row-move').click()
    page.locator('#move-date').fill('2099-01-02')
    page.locator('#move-time').fill('10:30')
    page.locator('#move-save').click()
    expect(page.locator('#move-dialog')).not_to_be_visible()
    expect(page.locator('.task-row')).to_have_count(2)
    expect(page.locator('.task-row').first).to_contain_text('10:30')
    expect(page.locator('.task-row').last).to_contain_text('4 янв.')
    expect(page.locator('.task-row').first.locator('input').first).to_be_checked()
    expect(page.locator('.task-row').last.locator('input').first).not_to_be_checked()
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('[data-period=any]').click()
    expect(page.locator('.task-row')).to_have_count(2)
    page.locator('.task-body').first.click()
    expect(page.locator('#reminder-minutes')).to_have_value('30')
    page.locator('#note').fill('Заметка после переноса')
    page.get_by_role('textbox', name='Подзадача 1', exact=True).fill('Загранпаспорт')
    page.get_by_role('button', name='Удалить подзадачу 2', exact=True).click()
    page.locator('#add-subtask').click()
    page.get_by_role('textbox', name='Подзадача 2', exact=True).fill('Копии документов')
    page.locator('#save').click()
    expect(page.locator('#editor')).not_to_be_visible()
    expect(page.locator('.task-row').first).to_contain_text('Перенесено с')
    expect(page.locator('.task-row').first.locator('input').first).to_be_checked()
    current = context.request.get(BASE+'/api/tasks').json()
    assert current['state']['tasks'][0]['subtasks'][0]['id'] == first_subtask

    # A rejected checklist update must not appear saved or overwrite another device.
    current['state']['tasks'][0]['note'] = 'Заметка с другого устройства'
    assert context.request.post(BASE+'/api/tasks', data=current, headers={'Origin': BASE}).status == 200
    page.locator('.task-row').first.locator('input').last.click()
    expect(page.locator('#toast')).to_contain_text('другом устройстве')
    expect(page.locator('.task-row').first.locator('input').last).not_to_be_checked()
    page.locator('.task-row').first.locator('input').last.click()
    expect(page.locator('.task-row').first.locator('legend')).to_have_text('Подзадачи · 2 из 2')
    expect(page.locator('.task-row')).to_have_count(2)  # Still requires explicit completion.

    # A concurrent update must survive a stale move, and retry uses the new version.
    page.locator('.row-move').first.click()
    page.locator('#move-date').fill('2099-01-03')
    current = context.request.get(BASE+'/api/tasks').json()
    current['state']['tasks'][0]['title'] = 'Изменено на другом устройстве'
    response = context.request.post(BASE+'/api/tasks', data=current, headers={'Origin': BASE})
    assert response.status == 200
    page.locator('#move-save').click()
    expect(page.locator('#move-error')).to_contain_text('другом устройстве')
    expect(page.locator('#move-dialog')).to_be_visible()
    current = context.request.get(BASE+'/api/tasks').json()
    assert current['state']['tasks'][0]['shifts']['2099-01-01']['date'] == '2099-01-02'
    assert current['state']['tasks'][0]['reminderMinutes'] == 30
    page.locator('#move-save').click()
    expect(page.locator('#move-dialog')).not_to_be_visible()
    expect(page.locator('.task-row').first).to_contain_text('Изменено на другом устройстве')
    page.locator('.complete').first.click()
    expect(page.locator('.task-row')).to_have_count(1)
    page.locator('[data-filter=done]').click()
    expect(page.locator('.task-row')).to_have_count(1)
    expect(page.locator('.task-row')).to_contain_text('3 янв.')
    expect(page.locator('.task-checklist input').first).to_be_disabled()
    expect(page.locator('.task-checklist input').first).to_be_checked()
    current = context.request.get(BASE+'/api/tasks').json()
    tid = current['state']['tasks'][0]['id']
    assert tid+'|2099-01-01' in current['state']['done']
    page.locator('.complete').click()
    page.locator('[data-filter=active]').click()
    expect(page.locator('.task-row')).to_have_count(2)
    expect(page.locator('.task-row').first.locator('input').first).to_be_checked()
    expect(page.locator('.task-row').first.locator('input').first).to_be_enabled()
    expect(page.locator('.task-row').last.locator('legend')).to_have_text('Подзадачи · 0 из 2')

    # Inspect card and form geometry without screenshots or real user records.
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 844})
        for theme in ['air', 'sage', 'iris', 'graphite']:
            page.locator('#open-settings').click()
            page.locator(f'[name=tasks-theme][value={theme}]').check()
            page.locator('#close-settings').click()
            for scale in ['100%', '130%']:
                page.evaluate('(size)=>document.documentElement.style.fontSize=size', scale)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width, theme, scale)
                for row in page.locator('.task-row').all():
                    assert row.evaluate('e=>e.scrollWidth<=e.clientWidth'), (width, theme, scale, 'card overflow')
                    assert row.evaluate('e=>parseFloat(getComputedStyle(e).paddingLeft)>=16')
                    assert row.locator('.task-body').evaluate('e=>e.getBoundingClientRect().right<=e.nextElementSibling.getBoundingClientRect().left')
                page.locator('.row-move').first.click()
                assert page.locator('#move-dialog').evaluate('e=>e.scrollWidth<=e.clientWidth')
                page.locator('#close-move').click()
                page.locator('.task-body').first.click()
                assert page.locator('#editor').evaluate('e=>e.scrollWidth<=e.clientWidth')
                page.locator('#close-editor').click()
    page.locator('.task-body').first.click()
    page.locator('#reminder-minutes').select_option('60')
    page.locator('#save').click();expect(page.locator('#editor')).not_to_be_visible()
    assert context.request.get(BASE+'/api/tasks').json()['state']['tasks'][0]['reminderMinutes']==60
    page.locator('.task-body').first.click()
    page.locator('#reminder-minutes').select_option('10')
    page.locator('#save').click();expect(page.locator('#editor')).not_to_be_visible()
    assert context.request.get(BASE+'/api/tasks').json()['state']['tasks'][0]['reminderMinutes']==10
    page.locator('.task-body').first.click()
    page.locator('#reminder-minutes').select_option('0')
    page.locator('#save').click();expect(page.locator('#editor')).not_to_be_visible()
    assert context.request.get(BASE+'/api/tasks').json()['state']['tasks'][0]['reminderMinutes']==0
    assert not errors, errors
    browser.close()
    print('PASS: real API create/edit/move, per-date checklists, rename/remove, persistence, conflict/retry, completion/undo, four themes at 320/390px and enlarged text')
