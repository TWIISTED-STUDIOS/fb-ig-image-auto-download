import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const userscript = fs.readFileSync(path.join(root, 'facebook-simple-downloader.user.js'), 'utf8');

function fixtureHtml() {
  const images = Array.from({ length: 20 }, (_, index) => `
    <a href="/photos/123456789/${900000000 + index}/">
      <img src="https://scontent.example.fbcdn.net/photo-${index}.jpg"
           alt="Photo ${index}" style="width:140px;height:100px">
    </a>`).join('');

  return `<!doctype html>
    <html><head><title>Test Profile | Facebook</title>
      <style>
        #feed-card { position: relative; width: 240px; height: 160px; }
        .facebook-absolute-media { position: absolute; inset: 0; }
        .facebook-absolute-media img { width: 100%; height: 100%; }
      </style>
    </head>
    <body><main role="main">
      <h1>Test Profile</h1>
      <section id="grid">${images}</section>
      <a href="/photos/123456789/999999999/">
        <img id="lazy-photo" alt="Lazy photo" style="width:140px;height:100px">
      </a>
      <article id="feed-card">
        <a id="feed-media" class="facebook-absolute-media" href="/photos/123456789/777777777/">
          <img id="feed-photo" alt="Feed photo">
        </a>
      </article>
    </main></body></html>`;
}

function transitionFixtureHtml() {
  return `<!doctype html><html><head><title>Facebook</title></head><body>
    <main role="main" id="route-content">
      <h2>Home feed</h2>
      <a href="/photos/999999999/888888888/">
        <img src="https://scontent.example.fbcdn.net/feed-before-navigation.jpg"
             alt="Feed photo that must not be retained" style="width:320px;height:220px">
      </a>
    </main>
  </body></html>`;
}

async function installUserscriptEnvironment(page) {
  await page.addInitScript(() => {
    const metrics = { fullDocumentImageQueries: 0 };
    const originalQuerySelectorAll = Document.prototype.querySelectorAll;
    Document.prototype.querySelectorAll = function querySelectorAllWithMetrics(selector) {
      if (this === document && selector === 'img') metrics.fullDocumentImageQueries += 1;
      return originalQuerySelectorAll.call(this, selector);
    };
    window.__fbfrBrowserMetrics = metrics;
    window.unsafeWindow = window;
    window.GM_addStyle = css => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    };
    window.GM_getValue = (_key, fallback) => fallback;
    window.GM_setValue = () => {};
    window.GM_deleteValue = () => {};
    window.GM_download = () => Promise.resolve();
    window.GM_xmlhttpRequest = () => {};
    window.alert = () => {};
    window.confirm = () => true;
  });
}

test('processes lazy and rapid image mutations without periodic document sweeps', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installUserscriptEnvironment(page);
  await page.route('https://www.facebook.com/test.profile/photos', route => route.fulfill({
    contentType: 'text/html',
    body: fixtureHtml()
  }));
  await page.route(/\.(?:jpg|png|webp)(?:\?|$)/, route => route.abort());
  await page.goto('https://www.facebook.com/test.profile/photos');
  await page.addScriptTag({ content: userscript });

  await expect(page.locator('.fbfr-inline-download')).toHaveCount(20);

  await page.evaluate(async () => {
    const addBatch = (start, count) => {
      const grid = document.querySelector('#grid');
      for (let index = start; index < start + count; index += 1) {
        const anchor = document.createElement('a');
        anchor.href = `/photos/123456789/${800000000 + index}/`;
        const image = document.createElement('img');
        image.src = `https://scontent.example.fbcdn.net/dynamic-${index}.jpg`;
        image.alt = `Dynamic photo ${index}`;
        image.style.cssText = 'width:140px;height:100px';
        anchor.appendChild(image);
        grid.appendChild(anchor);
      }
    };

    addBatch(0, 5);
    await new Promise(resolve => setTimeout(resolve, 100));
    addBatch(5, 5);
    await new Promise(resolve => setTimeout(resolve, 100));
    document.querySelector('#lazy-photo').src = 'https://scontent.example.fbcdn.net/lazy-photo.jpg';
    document.querySelector('#feed-photo').src = 'https://scontent.example.fbcdn.net/feed-photo.jpg';
  });

  await expect(page.locator('.fbfr-inline-download')).toHaveCount(32);
  await expect(page.locator('#lazy-photo').locator('xpath=..').locator('.fbfr-inline-download')).toHaveCount(1);
  await expect(page.locator('#feed-photo')).toBeVisible();
  await expect(page.locator('#feed-media')).toHaveCSS('position', 'absolute');

  await page.locator('#fb-fullres-folder-scan-button').click();
  await expect(page.locator('#fb-fullres-folder-menu')).toBeVisible();

  await page.waitForTimeout(5_200);
  expect(await page.evaluate(() => window.__fbfrBrowserMetrics.fullDocumentImageQueries)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('waits for stale feed DOM to be replaced before scanning a profile Photos page', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installUserscriptEnvironment(page);
  await page.route('https://www.facebook.com/test.profile/photos', route => route.fulfill({
    contentType: 'text/html',
    body: transitionFixtureHtml()
  }));
  await page.route(/\.(?:jpg|png|webp)(?:\?|$)/, route => route.abort());
  await page.goto('https://www.facebook.com/test.profile/photos');
  await page.addScriptTag({ content: userscript });

  await page.locator('#fb-fullres-folder-scan-button').click();
  await page.locator('#fb-fullres-folder-scan-action').click();
  await page.waitForTimeout(1_700);
  await page.evaluate(() => {
    document.querySelector('#route-content').innerHTML = `
      <h1>Test Profile</h1>
      <section id="profile-photo-grid">
        <a href="/test.profile/photos/123456789/">
          <img src="https://scontent.example.fbcdn.net/profile-photo.jpg"
               alt="Profile photo that should be retained" style="width:320px;height:220px">
        </a>
      </section>`;
  });

  await expect(page.locator('#fb-fullres-folder-scan-action .fbfr-menu-action-title'))
    .toContainText('1 found', { timeout: 8_000 });
  const retained = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(name => name.includes('fbfr-photo-window-v1.0.4-beta.3'));
    return key ? JSON.parse(sessionStorage.getItem(key)).items : [];
  });
  expect(retained).toHaveLength(1);
  expect(retained[0].description).toBe('Profile photo that should be retained');
  expect(retained.some(item => item.description === 'Feed photo that must not be retained')).toBe(false);
  expect(pageErrors).toEqual([]);
});
