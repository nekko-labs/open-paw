import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const config = JSON.parse(read('vercel.json'));
const matchesHost = (rule, host) => rule.has?.some(
  (condition) => condition.type === 'host' && new RegExp(`^(?:${condition.value})$`).test(host),
);
const redirectFor = (host) => config.redirects.find((rule) => matchesHost(rule, host));

test('brand redirect host patterns are explicitly anchored', () => {
  for (const rule of config.redirects) {
    for (const condition of rule.has ?? []) {
      if (condition.type === 'host') {
        assert.ok(condition.value.startsWith('^'), condition.value);
        assert.ok(condition.value.endsWith('$'), condition.value);
      }
    }
  }
});

test('new alternate domains permanently redirect to the primary with a path capture', () => {
  for (const host of ['www.agentnekko.com', 'nekkoagent.com', 'www.nekkoagent.com']) {
    const rule = redirectFor(host);
    assert.equal(rule?.source, '/:path*');
    assert.equal(rule?.destination, 'https://agentnekko.com/:path*');
    assert.equal(rule?.permanent, true);
  }
});

test('the canonical host and unrelated/preview hosts never enter a brand redirect', () => {
  for (const host of ['agentnekko.com', 'localhost', 'preview.vercel.app', 'nekkoagent.com.example.com', 'notnekkoagent.com']) {
    assert.equal(redirectFor(host), undefined, host);
  }
});

test('old domains keep their live destination until the primary cutover is approved', () => {
  for (const host of ['www.kotrain.com', 'kotrain.app', 'nekkos.app', 'nekkos.dev']) {
    assert.equal(redirectFor(host)?.destination, 'https://kotrain.com/$1');
  }
});

test('workspace identity changes without switching unpublished package or update feeds', () => {
  assert.equal(JSON.parse(read('package.json')).name, 'agent-nekko-workspace');
  assert.equal(JSON.parse(read('apps/cli/package.json')).name, 'kotrain');
  assert.match(read('apps/desktop/electron-builder.yml'), /appId: dev\.nekkolabs\.kotrain/);
  assert.match(read('apps/desktop/electron-builder.yml'), /repo: kotrain/);
});

test('the assistant uses the Nekko identity and retains grounded execution guidance', () => {
  const prompt = read('packages/core/src/agent/prompt.ts');
  assert.match(prompt, /You are Nekko, the assistant inside Agent Nekko/);
  assert.match(prompt, /Use tools to ground your answers/);
  assert.match(prompt, /destructive commands/);
  assert.match(prompt, /End every turn with an honest wrap-up/);
});

test('packaged icon sources use the canonical MiniNekko head and current palette', () => {
  const source = read('apps/desktop/scripts/icon-art.cjs');
  const implementation = source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(implementation, /#(?:6d5efc|22d3ee|8b7dff|4c46c8|221f45|121222|090911|a9f3ff|e6fbff|7de6ff|101020|141428|0c0c16|07070d)\b/i);
  assert.doesNotMatch(implementation, /onOrbit|function trail|id="(?:space|nebula|nebula2|bloom|core)"/);
  for (const token of ['#101714', '#f2f1e9', '#a7c8ac', '#f0a35e', 'data-part="inner-ears"', 'data-mascot-accessory="sunglasses"', 'data-mascot-accessory="earpiece"', 'data-part="mouth"']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(source, /AI on your computer/);
  assert.doesNotMatch(implementation, /Local-first AI coding/);

  const installerSource = read('apps/desktop/scripts/gen-installer-art.mjs').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
  assert.match(installerSource, /rgbaToInt\(16, 23, 20, 255\)/);
  assert.match(installerSource, /rgbaToInt\(167, 200, 172, 255\)/);
  assert.match(installerSource, /AI on your computer/);
  assert.doesNotMatch(installerSource, /Local-first AI|coding & cowork/);
});

test('generated vector icons contain cat accessories without old orbit art', () => {
  for (const path of ['apps/desktop/build/icon.svg', 'apps/desktop/src/renderer/public/icon.svg']) {
    const svg = read(path);
    assert.match(svg, /<svg[^>]+viewBox="0 0 512 512"/);
    assert.match(svg, /fill="#101714"/i);
    assert.match(svg, /stroke="#f2f1e9"/i);
    assert.match(svg, /stroke="#a7c8ac"/i);
    assert.match(svg, /stroke="#f0a35e"/i);
    assert.match(svg, /data-mascot-accessory="sunglasses"/);
    assert.match(svg, /data-mascot-accessory="earpiece"/);
    assert.match(svg, /data-part="mouth"/);
    assert.doesNotMatch(svg, /#(?:6d5efc|22d3ee|8b7dff|4c46c8|221f45|121222|090911|a9f3ff|e6fbff|7de6ff|101020)\b/i);
    assert.doesNotMatch(svg, /id="(?:space|nebula|nebula2|bloom|core)"/);
  }
});

test('generated raster icons and installer art retain dimensions and exclude old accent pixels', async () => {
  const { Jimp } = await import('jimp');
  const binary = (path) => readFileSync(new URL(path, root));
  const expected = new Map([
    ['apps/desktop/build/icon.png', [512, 512]],
    ['apps/desktop/src/renderer/public/icon-512.png', [512, 512]],
    ['apps/desktop/build/installerHeader.bmp', [150, 57]],
    ['apps/desktop/build/installerSidebar.bmp', [164, 314]],
  ]);
  const forbidden = new Set(['109,94,252', '34,211,238', '139,125,255']);
  const current = new Set(['16,23,20', '242,241,233', '167,200,172', '240,163,94']);
  for (const [path, [width, height]] of expected) {
    const image = await Jimp.read(binary(path));
    const seen = new Set();
    assert.deepEqual([image.bitmap.width, image.bitmap.height], [width, height], path);
    for (let i = 0; i < image.bitmap.data.length; i += 4) {
      const pixel = `${image.bitmap.data[i]},${image.bitmap.data[i + 1]},${image.bitmap.data[i + 2]}`;
      assert.equal(forbidden.has(pixel), false, `${path}: ${pixel}`);
      if (current.has(pixel)) seen.add(pixel);
    }
    assert.equal(seen.has('16,23,20'), true, path);
    if (path.endsWith('.png')) {
      assert.equal(seen.has('242,241,233'), true, path);
    } else {
      assert.equal(seen.has('167,200,172'), true, path);
    }
  }

  const ico = binary('apps/desktop/build/icon.ico');
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16;
    const size = ico[offset] || 256;
    const length = ico.readUInt32LE(offset + 8);
    const dataOffset = ico.readUInt32LE(offset + 12);
    const image = await Jimp.read(ico.subarray(dataOffset, dataOffset + length));
    assert.deepEqual([image.bitmap.width, image.bitmap.height], [size, size]);
    sizes.push(size);
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
});
