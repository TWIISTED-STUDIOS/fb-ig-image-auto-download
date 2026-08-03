import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const scriptPath = path.join(root, 'facebook-simple-downloader.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function loadUserscriptHooks() {
  const startup = `    loadRetainedImages();
    addMainButton();
    startInlineDownloadMonitoring();
    new MutationObserver(addMainButton).observe(document.documentElement, {
        childList: true,
        subtree: true
    });`;
  const instrumented = source.replace(startup, `    Object.assign(globalThis.__fbfrTestHooks, {
        canonicalSourceKey,
        clampLauncherPosition,
        assertFacebookPageUrl,
        extractPhotoId,
        facebookPhotoId,
        findPhotoLink,
        filenameIdentifier,
        historyIdForItem,
        isFacebookPageUrl,
        matchingExistingFilename,
        readFolderInventory
    });`);
  assert.notEqual(instrumented, source, 'Userscript startup marker changed; update the test harness.');

  const hooks = {};
  const context = vm.createContext({
    URL,
    URLSearchParams,
    console,
    location: new URL('https://www.facebook.com/example/photos'),
    GM_addStyle() {},
    GM_getValue() { return null; },
    __fbfrTestHooks: hooks
  });
  new vm.Script(instrumented, { filename: path.basename(scriptPath) }).runInContext(context);
  return hooks;
}

const hooks = loadUserscriptHooks();

test('numeric owner and photo path segments use the photo ID', () => {
  const firstUrl = 'https://www.facebook.com/photos/123456789/987654321/';
  const secondUrl = 'https://www.facebook.com/photos/123456789/555555555/';
  const first = { sourceUrl: firstUrl, key: hooks.canonicalSourceKey(firstUrl) };
  const second = { sourceUrl: secondUrl, key: hooks.canonicalSourceKey(secondUrl) };

  assert.equal(hooks.extractPhotoId(firstUrl), '987654321');
  assert.equal(hooks.extractPhotoId(secondUrl), '555555555');
  assert.equal(hooks.facebookPhotoId(first), '987654321');
  assert.equal(hooks.facebookPhotoId(second), '555555555');
  assert.notEqual(hooks.filenameIdentifier(first, 1, 2), hooks.filenameIdentifier(second, 2, 2));
  assert.notEqual(hooks.historyIdForItem(first), hooks.historyIdForItem(second));
});

test('query-string and canonical-key photo IDs remain supported', () => {
  assert.equal(hooks.extractPhotoId('https://www.facebook.com/photo.php?fbid=987654321'), '987654321');
  assert.equal(hooks.extractPhotoId('photo:555555555'), '555555555');
});

test('photo links and viewer destinations are restricted to Facebook HTTPS pages', () => {
  const facebookAnchor = {
    href: 'https://www.facebook.com/photos/123456789/987654321/',
    parentElement: null
  };
  const externalAnchor = {
    href: 'https://example.com/photos/123456789/987654321/',
    parentElement: null
  };

  assert.equal(hooks.isFacebookPageUrl(facebookAnchor.href), true);
  assert.equal(hooks.isFacebookPageUrl('https://m.facebook.com/photo.php?fbid=987654321'), true);
  assert.equal(hooks.isFacebookPageUrl(externalAnchor.href), false);
  assert.equal(hooks.isFacebookPageUrl('http://www.facebook.com/photo.php?fbid=987654321'), false);
  assert.equal(hooks.findPhotoLink({ closest: () => facebookAnchor }), facebookAnchor.href);
  assert.equal(hooks.findPhotoLink({ closest: () => externalAnchor }), '');
  assert.equal(hooks.findPhotoLink({
    closest: () => ({ href: 'https://example.com/photo.php?fbid=987654321', parentElement: null })
  }), '');
  assert.throws(
    () => hooks.assertFacebookPageUrl(externalAnchor.href),
    /Blocked a non-Facebook photo-page URL/
  );
});

test('folder inventory preserves case for case-sensitive filesystems', async () => {
  const directoryHandle = {
    async *entries() {
      yield ['Photo-123.jpg', { kind: 'file' }];
      yield ['nested', { kind: 'directory' }];
    }
  };

  const inventory = await hooks.readFolderInventory(directoryHandle);
  assert.deepEqual([...inventory], ['Photo-123.jpg']);
  assert.equal(hooks.matchingExistingFilename(inventory, 'Photo-123'), 'Photo-123.jpg');
  assert.equal(hooks.matchingExistingFilename(inventory, 'photo-123'), '');
});

test('launcher positions are clamped inside the current viewport', () => {
  const assertPosition = (actual, left, top) => {
    assert.equal(actual.left, left);
    assert.equal(actual.top, top);
  };

  assertPosition(hooks.clampLauncherPosition(900, 700, 800, 600, 120, 80), 680, 520);
  assertPosition(hooks.clampLauncherPosition(-20, -30, 800, 600, 120, 80), 0, 0);
  assertPosition(hooks.clampLauncherPosition(100, 100, 80, 60, 120, 80), 0, 0);
});
