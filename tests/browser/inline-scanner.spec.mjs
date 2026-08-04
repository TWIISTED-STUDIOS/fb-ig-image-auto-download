import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const userscript = fs.readFileSync(path.join(root, 'facebook-simple-downloader.user.js'), 'utf8');
const startupMarker = '    loadRetainedImages();';
const noScanUserscript = userscript.replace(startupMarker, `    unsafeWindow.__fbfrNoScanFilename = img => {
        const item = itemFromImageElement(img);
        const prefix = cleanAccountNameCandidate(item?.accountName) || detectAccountName(item ? [item] : []);
        return { accountName: item?.accountName || '', filename: filenameBase(item, 1, 1, prefix) };
    };
${startupMarker}`);

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

function noScanFixtureHtml() {
  return `<!doctype html><html><head><title>(4) Facebook</title></head><body>
    <main role="main">
      <article role="article">
        <h2><a role="link" href="/feed.author">Feed Author</a></h2>
        <div role="button" tabindex="0" style="width:100px;height:24px">Reply</div>
        <div role="button" tabindex="0" style="width:100px;height:24px">See more</div>
        <a href="/feed.author/photos/123456789/">
          <img id="no-scan-photo" src="https://scontent.example.fbcdn.net/no-scan-photo.jpg"
               alt="No-scan feed photo" style="width:320px;height:220px">
        </a>
      </article>
    </main>
  </body></html>`;
}

function groupPostFixtureHtml() {
  return `<!doctype html><html><head><title>Facebook</title></head><body>
    <main role="main">
      <div class="unlabelled-group-post-wrapper">
        <div class="group-post-header">
          <h4 data-ad-rendering-role="profile_name">
            <a role="link" href="/groups/1679271875623926/">Doppelgänger Search</a>
          </h4>
          <div>
            <a role="link" href="/groups/1679271875623926/user/100029511827848/">
              <span>Zenechka Estes</span>
            </a>
            <span aria-hidden="true"> · </span><span>AI content</span>
          </div>
          <div role="button" aria-label="Actions for this post by Zenechka Estes"></div>
        </div>
        <a href="/photo.php?fbid=987654321">
          <img id="group-post-photo" src="https://scontent.example.fbcdn.net/group-post-photo.jpg"
               alt="Group post photo" style="width:320px;height:220px">
        </a>
      </div>
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

test('no-scan individual filename ignores post action controls', async ({ page }) => {
  await installUserscriptEnvironment(page);
  await page.route('https://www.facebook.com/', route => route.fulfill({
    contentType: 'text/html',
    body: noScanFixtureHtml()
  }));
  await page.route(/\.(?:jpg|png|webp)(?:\?|$)/, route => route.abort());
  await page.goto('https://www.facebook.com/');
  await page.addScriptTag({ content: noScanUserscript });
  await expect(page.locator('.fbfr-inline-download')).toHaveCount(1);

  const result = await page.evaluate(() => window.__fbfrNoScanFilename(document.querySelector('#no-scan-photo')));
  expect(result.accountName).toBe('Feed Author');
  expect(result.filename).toMatch(/^Feed Author-/);
  expect(result.filename).not.toMatch(/^(?:\(4\) Facebook|Facebook|Reply|See more|💾)-/);
});

test('no-scan group post filename uses the member author instead of the group', async ({ page }) => {
  await installUserscriptEnvironment(page);
  await page.route('https://www.facebook.com/groups/1679271875623926/', route => route.fulfill({
    contentType: 'text/html',
    body: groupPostFixtureHtml()
  }));
  await page.route(/\.(?:jpg|png|webp)(?:\?|$)/, route => route.abort());
  await page.goto('https://www.facebook.com/groups/1679271875623926/');
  await page.addScriptTag({ content: noScanUserscript });
  await expect(page.locator('.fbfr-inline-download')).toHaveCount(1);

  const result = await page.evaluate(() => window.__fbfrNoScanFilename(document.querySelector('#group-post-photo')));
  expect(result.accountName).toBe('Zenechka Estes');
  expect(result.filename).toMatch(/^Zenechka Estes-/);
  expect(result.filename).not.toMatch(/^(?:Doppelgänger Search|Facebook)-/);
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
      </section>
      <section id="check-ins-module">
        <h2><a href="/test.profile/map">Check-ins</a></h2>
        <a href="/pages/Test-Place/111111111">
          <img src="https://scontent.example.fbcdn.net/check-in-place.png"
               alt="Check-in place thumbnail" width="80" height="80">
        </a>
      </section>
      <section id="events-module">
        <h2><a href="/test.profile/events">Events</a></h2>
        <a href="/events/222222222/">
          <img src="https://scontent.example.fbcdn.net/event-card.jpg"
               alt="Event card thumbnail" width="116" height="80">
        </a>
      </section>
      <section id="reviews-module">
        <h2><a href="/test.profile/reviews_given">Reviews given</a></h2>
        <a href="/test.profile/posts/review-post">
          <img src="https://scontent.example.fbcdn.net/review-logo.jpg"
               alt="Review business logo" width="80" height="80">
        </a>
      </section>`;
  });

  await expect(page.locator('#fb-fullres-folder-scan-action .fbfr-menu-action-title'))
    .toContainText('1 found', { timeout: 8_000 });
  const retained = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(name => name.includes('fbfr-photo-window-v1.0.4-beta.4'));
    return key ? JSON.parse(sessionStorage.getItem(key)).items : [];
  });
  expect(retained).toHaveLength(1);
  expect(retained[0].description).toBe('Profile photo that should be retained');
  expect(retained.some(item => item.description === 'Feed photo that must not be retained')).toBe(false);
  expect(retained.some(item => /Check-in|Event card|Review business/.test(item.description))).toBe(false);
  expect(pageErrors).toEqual([]);
});
