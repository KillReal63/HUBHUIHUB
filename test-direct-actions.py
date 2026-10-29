from pathlib import Path
import json,mimetypes,datetime
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent
DAY='2026-10-14'
state={'meds':[],'taken':{},'skipped':{},'fixed':{}}
module_states={'food':{'meals':[],'stocks':[],'recipes':[],'plans':[],'movements':[],'demo':False},'gym':{'version':1,'selected':None,'done':{},'days':[]}}
def route(r):
 global state,tasks
 from urllib.parse import urlsplit,unquote
 url=urlsplit(r.request.url);path=unquote(url.path)
 if url.hostname not in ('127.0.0.1','localhost'):
  return r.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#eee"/><text x="30" y="150">Test photo</text></svg>')
 if '/api/' in path:
  endpoint=path.split('/api/')[1];data=r.request.post_data_json if r.request.method=='POST' else None
  if endpoint=='session':body={'authenticated':True,'setupRequired':False}
  elif endpoint=='tasks':
   if data:tasks=data['state']
   body={'state':tasks,'version':1}
  elif endpoint=='state':
   if data:state=data['state']
   body={'state':state,'version':1}
  elif endpoint in module_states:
   if data and fail_save:return r.fulfill(status=400,content_type='application/json',body=json.dumps({'error':'Test failure'}))
   if data:module_states[endpoint]=data['state']
   body={'state':module_states[endpoint],'version':1,'shopping':[]}
  else:body={'enabled':False}
  return r.fulfill(status=200,content_type='application/json',body=json.dumps(body))
 if path.startswith('/gym/') or path=='/gym':
  rel=path.removeprefix('/gym').lstrip('/');file=ROOT/'gym-prototype/dist'/('index.html' if rel in ('','program','catalog') else rel)
 elif path.startswith('/vovrema/'):
  rel=path.removeprefix('/vovrema/');file=ROOT/'dist'/(rel or 'index.html')
 else:
  file=ROOT/'dist'/('hub/index.html' if path=='/' else path.lstrip('/'))
  if file.is_dir():file=file/'index.html'
 if file.exists() and file.is_file():return r.fulfill(status=200,content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream',body=file.read_bytes())
 return r.fulfill(status=404,body='')

fail_save=False
module_states['watch']={'items':[]}
tasks={'tasks':[],'done':{}}

with sync_playwright() as p:
 import os
 browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_EXECUTABLE']} if os.environ.get('CHROMIUM_EXECUTABLE') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},timezone_id='Asia/Dubai',service_workers='block')
 context.route('**/*',route)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 def go(path):
  page.goto('http://127.0.0.1:4177'+path);page.wait_for_load_state('networkidle')
 def fits():assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.url
 go('/gym/')
 page.get_by_role('button',name='Составить программу',exact=True).click()
 expect(page.locator('#day-form')).to_be_visible()
 page.locator('#close-day').click()
 assert not module_states['gym']['days']
 page.get_by_role('button',name='Составить программу',exact=True).click()
 page.locator('#day-form [name=name]').fill('Первый день')
 page.get_by_role('button',name='Сохранить день').click()
 page.get_by_role('button',name='Добавить упражнения',exact=True).click()
 expect(page.locator('#exercise-form')).to_be_visible()
 expect(page.locator('#exercise-form [name=name]')).to_be_focused()
 page.locator('#exercise-form [name=name]').fill('Проверочное упражнение')
 page.locator('[data-action=cancel-exercise]').click()
 expect(page.locator('dialog[open]')).to_contain_text('Не сохранять изменения?')
 page.locator('#cancel').click()
 expect(page.locator('#exercise-form [name=name]')).to_have_value('Проверочное упражнение')
 page.get_by_role('button',name='Сохранить упражнение',exact=True).click()
 expect(page.locator('.edit-row')).to_have_count(1)
 assert module_states['gym']['days'][0]['exercises'][0]['name']=='Проверочное упражнение'
 # Empty catalog flow retains the chosen exercise through day creation.
 module_states['gym']={'version':1,'selected':None,'days':[],'done':{}}
 go('/gym/catalog')
 page.locator('[data-catalog-open]').first.click()
 title=page.locator('#catalog-detail-title').inner_text()
 page.locator('[data-catalog-create-day]').click()
 expect(page.locator('#day-form')).to_be_visible()
 page.locator('#day-form [name=name]').fill('День из каталога')
 fail_save=True
 page.get_by_role('button',name='Сохранить день').click()
 expect(page.locator('#notice')).to_contain_text('не подтверждено')
 expect(page.locator('#day-form')).to_be_visible()
 assert not module_states['gym']['days']
 fail_save=False
 page.get_by_role('button',name='Сохранить день').click()
 expect(page.locator('#catalog-detail-title')).to_have_text(title)
 expect(page.locator('#catalog-add-form')).to_be_visible()
 assert len(module_states['gym']['days'])==1
 page.locator('#catalog-add-form button[type=submit]').click()
 expect(page.locator('.edit-row')).to_have_count(1)
 assert module_states['gym']['days'][0]['exercises'][0]['name']==title
 # A new recipe continues planning on the originally selected date.
 go('/food/')
 page.locator('[data-tab=menu]').click()
 day=page.locator('[data-plan-day]').nth(4).get_attribute('data-plan-day')
 page.locator('[data-plan-day]').nth(4).click()
 expect(page.locator('#recipe-editor')).to_be_visible()
 page.locator('[data-close-extra=recipe-editor]').click()
 page.locator('[data-tab=diary]').click()
 page.locator('#recipe-add').click()
 page.locator('#recipe-form [name=name]').fill('Отдельное блюдо')
 page.locator('#recipe-form button[type=submit], #recipe-form button.primary').click()
 expect(page.locator('#recipe-editor')).not_to_be_visible()
 expect(page.locator('#plan-editor')).not_to_be_visible()
 module_states['food']['recipes']=[]
 go('/food/');page.locator('[data-tab=menu]').click()
 page.locator('[data-plan-day]').nth(4).click()
 page.locator('#recipe-form [name=name]').fill('Блюдо для меню')
 fail_save=True
 page.locator('#recipe-form button.primary').click()
 expect(page.locator('#recipe-editor .sync-dialog-status')).to_contain_text('Изменение не сохранено')
 expect(page.locator('#recipe-editor')).to_be_visible()
 expect(page.locator('#plan-editor')).not_to_be_visible()
 fail_save=False
 page.locator('#recipe-form button.primary').click()
 expect(page.locator('#plan-editor')).to_be_visible()
 expect(page.locator('#plan-form [name=date]')).to_have_value(day)
 expect(page.locator('#plan-form [name=recipe] option:checked')).to_have_text('Блюдо для меню')
 page.locator('#plan-form button.primary').click()
 expect(page.locator('#plan-editor')).not_to_be_visible()
 assert module_states['food']['plans'][0]['date']==day
 for width in [320,390]:
  page.set_viewport_size({'width':width,'height':844})
  fits()
  go('/gym/program');page.locator('[data-action=add-exercise]').click();expect(page.locator('#exercise-form')).to_be_visible();fits()
  go('/tasks/');page.locator('.empty').get_by_role('button',name='Добавить дело',exact=True).click();expect(page.locator('#editor')).to_be_visible();fits()
  go('/watch/');page.get_by_role('button',name='Добавить первую запись',exact=True).click();expect(page.locator('#editor')).to_be_visible();fits()
  go('/vovrema/');page.locator('#focus-hero [data-add]').click();expect(page.locator('#editor')).to_be_visible();fits()
 assert not errors,errors
 browser.close()
 print('PASS: direct creation, catalog context, menu date, cancellation, save failures, other app entry points, 320/390px')

