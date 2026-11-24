"""Real-browser test: runs extension/content_script.js inside real Chrome against live DOM fixtures.

chrome.* APIs are stubbed just enough to capture the content script's message handler; the DOM,
JSON-LD parsing, layout and the extraction code itself are all real. Skipped if Chrome/Playwright
are unavailable.
"""
import json
import os
import pathlib

import pytest

pw = pytest.importorskip("playwright.sync_api")

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / "extension" / "content_script.js").read_text(encoding="utf-8")
STUB = """
window.__handlers = [];
window.chrome = { runtime: { onMessage: { addListener: f => window.__handlers.push(f) },
  sendMessage: () => Promise.resolve(), getURL: p => p, lastError: null },
  storage: { local: { get: (k, cb) => cb && cb({}), set: () => {} } } };
"""
CHROME = next((p for p in (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium") if os.path.exists(p)), None)

PRODUCTS = """<html><head><title>Shop</title><script type="application/ld+json">
%s</script></head><body><h1>Shop</h1></body></html>""" % json.dumps({
    "@context": "https://schema.org", "@graph": [
        {"@type": "Product", "name": "Acme Phone X", "brand": {"name": "Acme"},
         "offers": {"price": "19999", "priceCurrency": "INR"}, "url": "https://shop.test/p/x",
         "aggregateRating": {"ratingValue": 4.4}},
        {"@type": "Product", "name": "Acme Phone X", "url": "https://shop.test/p/x"},  # duplicate
        {"@type": "Product", "name": "Beta Phone", "offers": {"price": "15000", "priceCurrency": "INR"},
         "url": "https://shop.test/p/b"}]})

NEWS = """<html><body>
<article><h2><a href="https://n.test/old">Older story about markets</a></h2><time datetime="2026-01-01T10:00:00Z"></time><p>old</p></article>
<article><h2><a href="https://n.test/new">Newest story about markets</a></h2><time datetime="2026-01-09T10:00:00Z"></time><p>new</p></article>
</body></html>"""


@pytest.fixture(scope="module")
def browser():
    if not CHROME:
        pytest.skip("No Chrome/Edge installed")
    with pw.sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True)
        yield b
        b.close()


def extract(browser, html, url):
    page = browser.new_page()
    page.route("**/*", lambda r: r.fulfill(status=200, content_type="text/html", body=html))
    page.add_init_script(STUB)
    page.goto(url)
    page.add_script_tag(content=SCRIPT)
    result = page.evaluate("""() => new Promise(res => {
        const msg = {type: 'EXECUTE_ACTION', action: 'extract', params: {fields: ['title','price']}};
        for (const h of window.__handlers) { if (h(msg, {}, r => res(r)) === true) return; }
        setTimeout(() => res({error: 'no handler responded'}), 8000);
    })""")
    page.close()
    return result


def _records(res):
    inner = res.get("result", res)
    return inner.get("data", [])


def test_jsonld_products_extracted_deduped_with_source_url(browser):
    recs = _records(extract(browser, PRODUCTS, "https://shop.test/list"))
    names = [r["title"] for r in recs]
    assert names == ["Acme Phone X", "Beta Phone"]
    assert recs[0]["price"].endswith("19999") and recs[0]["brand"] == "Acme"
    assert all(r["source_url"].startswith("https://shop.test/") for r in recs)


def test_timed_articles_extracted_with_publish_time(browser):
    recs = _records(extract(browser, NEWS, "https://n.test/"))
    assert {r["title"] for r in recs} == {"Older story about markets", "Newest story about markets"}
    assert all(r["published_at"] for r in recs)
    from fastapi_backend.feed import build_feed
    ordered = build_feed(recs)["ranked_items"]
    assert ordered[0]["title"].startswith("Newest")


def test_no_data_returns_empty_not_invented(browser):
    assert _records(extract(browser, "<html><body><p>hi</p></body></html>", "https://e.test/")) == []
