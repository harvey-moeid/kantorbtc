from playwright.sync_api import sync_playwright, expect
import json, os
from pathlib import Path
Path('test-results').mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173',wait_until='networkidle')
 assert '$67,482' not in page.inner_text('body'), 'Public price leak'
 page.get_by_role('button',name='Jelajahi demo',exact=True).click()
 page.get_by_role('button',name='Lantai 2',exact=True).click()
 page.get_by_role('button',name='Semua lantai',exact=True).click()
 page.get_by_role('button',name='Simulasi rapat',exact=True).click()
 page.locator('.team-panel .team-list button').filter(has_text='Arka').click()
 assert page.locator('dialog').is_visible()
 page.locator('dialog').get_by_role('button',name='Tutup',exact=True).click()
 page.locator('.main-nav').get_by_role('link',name='Pasar & chart').click()
 page.get_by_role('button',name='15m',exact=True).click()
 page.get_by_role('button',name='RSI',exact=True).click()
 page.get_by_role('button',name='BB',exact=True).click()
 page.get_by_role('button',name='Tambah alert',exact=True).click()
 page.locator('dialog input').fill('67500')
 page.get_by_role('button',name='Buat alert',exact=True).click()
 assert page.locator('.alert-row').count()==1
 page.screenshot(path='test-results/chart.png',full_page=True)
 page.get_by_role('button',name='XAUUSD',exact=True).click()
 page.locator('.main-nav').get_by_role('link',name='Sinyal trading').click()
 page.get_by_role('button',name='XAUUSD',exact=True).click()
 expect(page.locator('tbody tr')).to_have_count(1)
 page.locator('tbody tr').first.click()
 assert page.locator('dialog').is_visible()
 page.locator('dialog').get_by_role('button',name='Tutup',exact=True).click()
 page.locator('.main-nav').get_by_role('link',name='Meeting AI').click()
 page.locator('.meeting-row').first.click()
 assert page.locator('dialog .presentation').count()==4
 page.locator('dialog').get_by_role('button',name='Tutup',exact=True).click()
 page.get_by_role('link',name='Pengaturan',exact=True).click()
 for tab in ['Scanner & risiko','Susunan AI','Koneksi API','Histori & backfill','Alert Discord','Umum & tampilan']:
  page.get_by_role('button',name=tab,exact=True).click()
 page.get_by_role('button',name='Susunan AI',exact=True).click()
 slot=page.locator('.ai-slot').first
 slot.get_by_role('button',name='Tambah provider cadangan',exact=True).click()
 requested_providers=['Groq','NVIDIA','Cohere','Hugging Face','Mistral','Gemini']
 primary=page.get_by_role('combobox',name='Provider slot 1',exact=True)
 fallback=page.get_by_role('combobox',name='Fallback provider slot 1 1',exact=True)
 for provider in requested_providers:
  primary.select_option(provider);expect(primary).to_have_value(provider)
  fallback.select_option(provider);expect(fallback).to_have_value(provider)
 primary.select_option('Workers AI');fallback.select_option('Groq')
 page.get_by_role('textbox',name='Fallback model slot 1 1',exact=True).fill('fallback-model')
 slot.get_by_role('button',name='Tambah provider cadangan',exact=True).click()
 assert slot.get_by_role('button',name='Tambah provider cadangan',exact=True).count()==0
 expect(slot.get_by_role('button',name='Hapus cadangan',exact=True)).to_have_count(2)
 slot.get_by_role('button',name='Hapus cadangan',exact=True).first.click()
 expect(slot.get_by_role('button',name='Hapus cadangan',exact=True)).to_have_count(1)
 page.get_by_role('button',name='Koneksi API',exact=True).click()
 for provider in requested_providers:
  expect(page.locator('.provider-list').get_by_text(provider,exact=True)).to_be_visible()
 page.get_by_role('button',name='Umum & tampilan',exact=True).click()
 page.get_by_role('button',name='Simpan pengaturan',exact=True).click()
 assert page.locator('[role=status]').is_visible()
 page.get_by_role('button',name='Ganti bahasa',exact=True).click()
 assert page.get_by_role('link',name='3D office',exact=True).is_visible()
 page.get_by_role('button',name='Ganti bahasa',exact=True).click()
 mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
 mobile.on('pageerror',lambda e:errors.append(str(e)))
 mobile.goto('http://127.0.0.1:5173',wait_until='networkidle')
 mobile.get_by_role('button',name='Jelajahi demo',exact=True).click()
 mobile.wait_for_timeout(2000)
 assert mobile.evaluate('document.body.scrollWidth')==390, 'Mobile overflow'
 mobile.screenshot(path='test-results/mobile.png',full_page=True)
 mobile.get_by_role('button',name='Buka menu',exact=True).click()
 mobile.locator('.main-nav').get_by_role('link',name='Pasar & chart').click()
 mobile.get_by_role('button',name='D1',exact=True).click()
 mobile.wait_for_timeout(1000)
 assert mobile.evaluate('document.body.scrollWidth')==390, 'Mobile chart overflow'
 mobile.screenshot(path='test-results/mobile-chart.png',full_page=True)
 print(json.dumps({'browser_errors':errors,'checks':'public privacy, 3D floor controls, replay, staff modal, chart timeframes/indicators, alerts, filters, signal modal, AI meeting, settings tabs/save, language, mobile office/chart/menu'}))
 assert not errors
 browser.close()
