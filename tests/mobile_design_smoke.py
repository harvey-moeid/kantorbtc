"""Mobile-first navigation, cards, keyboard access and responsive layout acceptance."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json, os
Path('test-results').mkdir(exist_ok=True)
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173',wait_until='networkidle')
 dock=page.get_by_role('navigation',name='Navigasi utama',exact=True)
 expect(dock).to_be_visible()
 # Private pages stay gated when accessed through the new phone navigation.
 dock.get_by_role('link',name='Buka Sinyal trading',exact=True).click()
 expect(page.get_by_role('dialog')).to_be_visible()
 page.get_by_role('button',name='Tutup',exact=True).click()
 page.get_by_role('button',name='Jelajahi demo',exact=True).click()
 def fit():
  page.wait_for_function('(width)=>document.documentElement.scrollWidth<=width',arg=page.viewport_size['width'],timeout=5000)
  assert page.evaluate('document.documentElement.scrollWidth') <= page.viewport_size['width'], 'Document overflow at '+str(page.viewport_size)
 def screenshot(name):
  if page.locator('.toast').count(): page.locator('.toast button').click()
  page.screenshot(path='test-results/premium-'+name+'.png',full_page=page.viewport_size['width']>=761)
 fit();screenshot('office-mobile')
 for size in [320,360,390,430]:
  page.set_viewport_size({'width':size,'height':844});fit()
  for link in dock.get_by_role('link').all():
   assert link.bounding_box()['height']>=44
 page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='Buka menu',exact=True).click()
 expect(page.locator('.sidebar')).to_be_visible()
 expect(page.locator('.sidebar')).to_have_attribute('aria-modal','true')
 page.keyboard.press('Shift+Tab')
 assert page.evaluate('document.activeElement.closest(".sidebar") !== null'), 'Drawer focus escaped'
 page.keyboard.press('Escape')
 expect(page.get_by_role('button',name='Buka menu',exact=True)).to_be_focused()
 expect(page.get_by_role('button',name='Buka menu',exact=True)).to_have_attribute('aria-expanded','false')
 dock.get_by_role('link',name='Buka Sinyal trading',exact=True).click()
 expect(page.locator('tbody tr').first).to_be_visible()
 for size in [320,360,390,430]:
  page.set_viewport_size({'width':size,'height':844});fit()
  expect(page.locator('tbody tr').first).to_have_css('display','grid')
 page.set_viewport_size({'width':390,'height':844});screenshot('signals-mobile')
 page.locator('tbody tr').first.click()
 expect(page.get_by_role('dialog')).to_have_attribute('aria-labelledby',__import__('re').compile('.+'))
 assert page.evaluate('document.body.style.overflow')=='hidden'
 assert page.locator('dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
 screenshot('signal-detail-mobile')
 page.keyboard.press('Escape');expect(page.locator('dialog')).to_have_count(0)
 assert page.evaluate('document.body.style.overflow')!='hidden'
 dock.get_by_role('link',name='Buka Meeting AI',exact=True).click();expect(page.locator('.meeting-row').first).to_be_visible();fit();screenshot('meetings-mobile')
 dock.get_by_role('link',name='Buka Pengaturan',exact=True).click()
 for tab in ['Umum & tampilan','Scanner & risiko','Susunan AI','Koneksi API','Histori & backfill','Alert Discord']:
  page.get_by_role('button',name=tab,exact=True).click();fit()
 page.get_by_role('button',name='Susunan AI',exact=True).click();screenshot('settings-mobile')
 page.evaluate('window.scrollTo(0,400)')
 dock.get_by_role('link',name='Buka Pasar & chart',exact=True).click();expect(page.get_by_label('Chart candlestick interaktif',exact=True)).to_be_visible();fit();assert page.evaluate('scrollY')==0;screenshot('chart-mobile')
 page.set_viewport_size({'width':768,'height':1024});fit();expect(dock).not_to_be_visible()
 page.set_viewport_size({'width':1440,'height':1000});fit();screenshot('chart-desktop')
 page.locator('.main-nav').get_by_role('link',name='Sinyal trading',exact=True).click();fit()
 expect(page.locator('tbody tr').first).to_have_css('display','table-row')
 screenshot('signals-desktop')
 page.locator('.main-nav').get_by_role('link',name='Kantor 3D',exact=True).click();fit();screenshot('office-desktop')
 assert not errors,errors
 browser.close()
print(json.dumps({'browser_errors':errors,'checks':['mobile private-route gate','320/360/390/430px office/signals','44px bottom navigation','drawer focus trap/Escape/restore','signal cards and accessible modal','all six settings tabs','mobile chart/meeting','tablet and desktop table','no document overflow']}))
