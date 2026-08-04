import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const scriptPath = path.join(root, 'facebook-simple-downloader.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

const errors = [];
const metadataMatch = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
if (!metadataMatch) errors.push('Userscript metadata block is missing.');

const metadata = new Map();
if (metadataMatch) {
  for (const line of metadataMatch[1].split(/\r?\n/)) {
    const match = line.match(/^\/\/\s+@(\S+)\s+(.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    const list = metadata.get(key) ?? [];
    list.push(value.trim());
    metadata.set(key, list);
  }
}

const requiredSingle = {
  name: 'Facebook Image Downloader - Verified Full Resolution',
  namespace: 'https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download',
  version: '1.0.4-beta.2',
  author: 'Bibek Chand Sah (original project); TWIISTED-STUDIOS contributors (maintained rewrite)',
  homepageURL: 'https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download',
  supportURL: 'https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/issues',
  downloadURL: 'https://raw.githubusercontent.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/main/facebook-simple-downloader.user.js',
  updateURL: 'https://raw.githubusercontent.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/main/facebook-simple-downloader.user.js',
  license: 'MIT'
};

for (const [key, expected] of Object.entries(requiredSingle)) {
  const actual = metadata.get(key)?.[0];
  if (actual !== expected) errors.push(`@${key} must be ${expected}; found ${actual ?? 'nothing'}.`);
}

const connects = metadata.get('connect') ?? [];
const allowedConnects = new Set(['facebook.com', 'fbcdn.net', 'fbsbx.com']);
if (connects.includes('*')) errors.push('@connect * is forbidden.');
for (const host of connects) {
  if (!allowedConnects.has(host)) errors.push(`Unexpected @connect host: ${host}`);
}
for (const host of allowedConnects) {
  if (!connects.includes(host)) errors.push(`Missing required @connect host: ${host}`);
}

if (/JSZip|jszip/i.test(source)) errors.push('JSZip must not be included in the maintained photo downloader.');
if (/OpenAI test build/i.test(source)) errors.push('Test-build author metadata remains in the script.');

const attributionFiles = {
  'README.md': ['bibekchandsah/fb-ig-image-auto-download', 'Bibek Chand Sah'],
  'AUTHORS.md': ['Bibek Chand Sah', 'TWIISTED-STUDIOS'],
  'NOTICE.md': ['Bibek Chand Sah', '@license MIT'],
  'LICENSE': ['Bibek Chand Sah', 'TWIISTED-STUDIOS']
};
for (const [relative, requiredText] of Object.entries(attributionFiles)) {
  const filePath = path.join(root, relative);
  if (!fs.existsSync(filePath)) {
    errors.push(`${relative} is missing.`);
    continue;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  for (const needle of requiredText) {
    if (!text.includes(needle)) errors.push(`${relative} must include: ${needle}`);
  }
}

const releaseTag = process.env.RELEASE_TAG?.trim();
if (releaseTag) {
  const expectedTag = `v${metadata.get('version')?.[0] ?? ''}`;
  if (releaseTag !== expectedTag) errors.push(`Release tag ${releaseTag} does not match userscript version ${expectedTag}.`);
}

try {
  new vm.Script(source, { filename: path.basename(scriptPath) });
} catch (error) {
  errors.push(`JavaScript syntax error: ${error.message}`);
}

if (errors.length) {
  console.error('Userscript validation failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Userscript validation passed.');
console.log(`Version: ${metadata.get('version')[0]}`);
console.log(`Author: ${metadata.get('author')[0]}`);
console.log(`Restricted hosts: ${connects.join(', ')}`);
if (releaseTag) console.log(`Release tag verified: ${releaseTag}`);
