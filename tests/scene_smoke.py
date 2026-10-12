"""Scene rendering, all staff in every quality, WebGL lifecycle and viewport pause."""
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import json,os
Path('test-results').mkdir(exist_ok=True)
errors=[];metrics={}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/api/auth/session',lambda route:route.fulfill(json={'authenticated':False}))
 page.route_web_socket('**/api/**stream*',lambda ws:None)
 page.goto('http://127.0.0.1:5173',wait_until='networkidle')
 expect(page.locator('.scene-area canvas')).to_be_visible()
 page.get_by_role('button',name='Jelajahi demo',exact=True).click()
 quality=page.get_by_label('Kualitas 3D',exact=True)
 def ready(profile):
  quality.select_option(profile)
  page.locator('.scene-area').scroll_into_view_if_needed()
  page.wait_for_function('(profile)=>{const e=document.querySelector(".render-stats");return e?.textContent.startsWith(profile.toUpperCase())&&Number(e.dataset.characters)===13&&Number(e.dataset.drawCalls)>0}',arg=profile,timeout=30000)
  expect(page.locator('.scene-area canvas')).to_be_visible()
  expect(page.locator('.scene-area .office-2d')).not_to_be_visible()
  return page.locator('.render-stats').evaluate('(e)=>({...e.dataset,text:e.textContent})')
 for profile in ['low','medium','high']:
  metrics[profile]=ready(profile)
  page.locator('.scene-area').screenshot(path=f'test-results/scene-{profile}-desktop.png')
 # Floor changes retain resources and character objects rather than rebuilding textures.
 ready('medium')
 baseline=int(page.locator('.render-stats').get_attribute('data-textures'))
 for floor in ['Lantai 1','Lantai 2','Semua lantai']:
  page.get_by_role('button',name=floor,exact=True).click()
  page.wait_for_timeout(350)
  page.locator('.scene-area').screenshot(path='test-results/scene-'+floor.replace(' ','-').lower()+'.png')
 page.get_by_role('button',name='Reset kamera',exact=True).click()
 page.wait_for_timeout(2300)
 assert int(page.locator('.render-stats').get_attribute('data-textures'))<=baseline+1,'Texture allocation grew on floor selection'
 page.set_viewport_size({'width':390,'height':844})
 metrics['low-mobile']=ready('low')
 assert page.evaluate('document.documentElement.scrollWidth')==390
 page.locator('.scene-area').screenshot(path='test-results/scene-mobile.png')
 # Draw work pauses when the office is scrolled out of view.
 page.evaluate('window.scrollTo(0,document.body.scrollHeight)')
 expect(page.get_by_label('Statistik render',exact=True)).to_contain_text('PAUSED')
 page.locator('.scene-area').scroll_into_view_if_needed()
 expect(page.get_by_label('Statistik render',exact=True)).not_to_contain_text('PAUSED')
 page.get_by_role('button',name='Perbesar kantor',exact=True).click()
 expect(page.locator('.office-expanded')).to_be_visible()
 page.locator('.scene-area').screenshot(path='test-results/scene-fullscreen-mobile.png')
 assert page.evaluate('document.body.style.overflow')=='hidden'
 page.keyboard.press('Escape')
 expect(page.locator('.office-expanded')).to_have_count(0)
 expect(page.get_by_role('button',name='Perbesar kantor',exact=True)).to_be_focused()
 assert page.evaluate('document.body.style.overflow')!='hidden'
 page.get_by_role('button',name='Keluar',exact=True).click()
 page.locator('.scene-area').scroll_into_view_if_needed()
 page.wait_for_timeout(1500)
 expect(page.locator('.scene-area canvas')).to_be_visible()
 expect(page.locator('.scene-area .office-2d')).not_to_be_visible()
 assert '$67,482' not in page.inner_text('body')
 reduced=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
 reduced.on('pageerror',lambda e:errors.append(str(e)))
 reduced.route('**/api/auth/session',lambda route:route.fulfill(json={'authenticated':False}))
 reduced.route_web_socket('**/api/**stream*',lambda ws:None)
 reduced.goto('http://127.0.0.1:5173',wait_until='networkidle');reduced.get_by_role('button',name='Jelajahi demo',exact=True).click()
 expect(reduced.get_by_label('Statistik render',exact=True)).to_contain_text('ON DEMAND')
 reduced.locator('.scene-area').scroll_into_view_if_needed()
 reduced.get_by_role('button',name='Lantai 2',exact=True).click()
 reduced.locator('.scene-area').screenshot(path='test-results/scene-reduced-motion.png')
 assert not errors,errors
 browser.close()
print(json.dumps({'browser_errors':errors,'metrics':metrics,'checks':['13 characters low/medium/high','rendered WebGL on login/logout','floor texture reuse','camera reset','offscreen pause/resume','390px low-quality scene','fullscreen controls','public data gate','reduced-motion on-demand']}))
