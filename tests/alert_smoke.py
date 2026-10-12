"""Run with both development servers running; edits use isolated demo state."""
from playwright.sync_api import sync_playwright, expect
import json
import os


with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
        args=["--no-sandbox", "--enable-unsafe-swiftshader"],
    )
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors, writes = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: writes.append(request.url)
            if "/api/alerts" in request.url and request.method != "GET" else None)
    page.goto("http://127.0.0.1:5173", wait_until="networkidle")
    page.get_by_role("button", name="Jelajahi demo", exact=True).click()
    page.locator(".main-nav").get_by_role("link", name="Pasar & chart").click()
    page.get_by_role("button", name="Tambah alert", exact=True).click()
    page.get_by_label("Level harga", exact=True).fill("67500")
    page.get_by_role("button", name="Buat alert", exact=True).click()
    row = page.locator(".alert-row")
    expect(row).to_have_count(1)
    expect(row.locator("b")).to_have_text("$67,500.00")
    handle = page.locator(".alert-line-handle")
    expect(handle).to_have_count(1)
    original_id = handle.get_attribute("data-alert-id")

    # Numeric edit preserves identity; invalid input cannot change the price.
    row.get_by_role("button", name="Ubah alert", exact=True).click()
    page.get_by_label("Level harga", exact=True).fill("0")
    page.get_by_role("button", name="Simpan alert", exact=True).click()
    expect(page.locator("dialog")).to_be_visible()
    expect(row.locator("b")).to_have_text("$67,500.00")
    page.get_by_label("Level harga", exact=True).fill("67525")
    page.get_by_role("button", name="Simpan alert", exact=True).click()
    expect(row.locator("b")).to_have_text("$67,525.00")
    expect(handle).to_have_attribute("data-alert-id", original_id)

    def drag_handle():
        handle.scroll_into_view_if_needed()
        box = handle.bounding_box()
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, y - 40, steps=8)
        page.mouse.up()
        expect(page.locator("dialog")).to_be_visible()
        return float(page.get_by_label("Level harga", exact=True).input_value())

    # Drag proposes a level; cancelling leaves the saved line unchanged.
    proposed = drag_handle()
    assert proposed != 67525
    expect(row.locator("b")).to_have_text("$67,525.00")
    page.locator("dialog").get_by_role("button", name="Tutup", exact=True).click()
    expect(handle).to_contain_text("67,525.00")
    proposed = drag_handle()
    page.get_by_role("button", name="Simpan alert", exact=True).click()
    expect(row.locator("b")).to_have_text(f"${proposed:,.2f}")
    expect(handle).to_have_attribute("data-alert-id", original_id)

    # Keyboard users get the same editor, including when indicators rebuild.
    page.get_by_role("button", name="RSI", exact=True).click()
    expect(handle).to_have_count(1)
    page.get_by_role("button", name="Alert harga", exact=True).click()
    chart = page.locator(".market-chart")
    chart.scroll_into_view_if_needed()
    chart.click(position={"x": 120, "y": 100})
    expect(page.locator("dialog")).to_be_visible()
    assert float(page.get_by_label("Level harga", exact=True).input_value()) > 0
    page.locator("dialog").get_by_role("button", name="Tutup", exact=True).click()
    expect(row).to_have_count(1)
    handle.focus()
    handle.press("Enter")
    assert float(page.get_by_label("Level harga", exact=True).input_value()) == proposed
    page.locator("dialog").get_by_role("button", name="Tutup", exact=True).click()
    page.get_by_role("button", name="XAUUSD", exact=True).click()
    expect(handle).to_have_count(0)
    expect(row).to_have_count(0)
    page.get_by_role("button", name="BTCUSDT", exact=True).click()
    expect(row).to_have_count(1)
    page.get_by_role("button", name="Ganti bahasa", exact=True).click()
    row.get_by_role("button", name="Edit alert", exact=True).click()
    expect(page.get_by_role("heading", name="Edit price alert")).to_be_visible()
    expect(page.get_by_label("Price level", exact=True)).to_be_visible()
    page.locator("dialog").get_by_role("button", name="Close", exact=True).click()
    row.get_by_role("button", name="Delete alert", exact=True).click()
    expect(row).to_have_count(0)
    expect(handle).to_have_count(0)
    assert not writes, f"Demo sent private alert writes: {writes}"

    # Touch dragging uses real browser touch input on a narrow viewport.
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mobile.on("pageerror", lambda error: errors.append(str(error)))
    mobile.goto("http://127.0.0.1:5173", wait_until="networkidle")
    mobile.get_by_role("button", name="Jelajahi demo", exact=True).click()
    mobile.get_by_role("button", name="Buka menu", exact=True).click()
    mobile.locator(".main-nav").get_by_role("link", name="Pasar & chart").click()
    mobile.get_by_role("button", name="Tambah alert", exact=True).click()
    mobile.get_by_label("Level harga", exact=True).fill("67500")
    mobile.get_by_role("button", name="Buat alert", exact=True).click()
    mobile_handle = mobile.locator(".alert-line-handle")
    expect(mobile_handle).to_have_count(1)
    mobile_handle.scroll_into_view_if_needed()
    box = mobile_handle.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    cdp = mobile.context.new_cdp_session(mobile)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for offset in [10, 20, 30, 40]:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - offset}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    expect(mobile.locator("dialog")).to_be_visible()
    mobile_price = float(mobile.get_by_label("Level harga", exact=True).input_value())
    assert mobile_price != 67500
    mobile.get_by_role("button", name="Simpan alert", exact=True).click()
    expect(mobile.locator(".alert-row b")).to_have_text(f"${mobile_price:,.2f}")
    assert mobile.evaluate("document.body.scrollWidth") == 390
    assert not errors, errors
    print(json.dumps({"browser_errors": errors, "checks": "numeric edit, invalid price, drag confirmation/cancel, keyboard, indicator rebuild, symbol isolation, English labels, delete, demo without API writes, mobile touch drag"}))
    browser.close()
