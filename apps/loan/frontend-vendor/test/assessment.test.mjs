import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import jsdom from 'jsdom';
const {JSDOM, requestInterceptor} = jsdom;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, '../static/vendor');

function browser(t) {
  const requests = [];
  const dom = new JSDOM('<!doctype html><div id="assessment"></div>', {
    url: 'https://booth.example.invalid/loans/',
    runScripts: 'dangerously',
    resources: {interceptors: [requestInterceptor(request => {
      requests.push(request.url);
      return new Response(null, {status: 403});
    })]},
  });
  t.after(() => dom.window.close());
  for (const name of ['marked.umd.js', 'purify.min.js', 'assessment-renderer.js']) {
    dom.window.eval(readFileSync(join(assets, name), 'utf8'));
  }
  const target = dom.window.document.getElementById('assessment');
  return {window: dom.window, target, requests, render: text => dom.window.LoanAssessment.render(target, text)};
}

test('real vendored browser bundles preserve markdown headings, emphasis, code, tables, and safe links', t => {
  const {target, requests, render} = browser(t);
  render('# Loan assessment\n\n**Income verified** and `credit_check`.\n\n| Check | Result |\n| --- | --- |\n| DTI | Passed |\n\n[Policy](https://example.invalid/policy)');
  assert.equal(target.querySelector('h1').textContent, 'Loan assessment');
  assert.equal(target.querySelector('strong').textContent, 'Income verified');
  assert.equal(target.querySelector('code').textContent, 'credit_check');
  assert.equal(target.querySelectorAll('table tbody tr').length, 1);
  assert.equal(target.querySelector('td').textContent, 'DTI');
  const link = target.querySelector('a');
  assert.equal(link.href, 'https://example.invalid/policy');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.deepEqual(requests, []);
});

test('model HTML cannot insert scripts, embeds, remote images, event handlers, or javascript URLs', t => {
  const {window, target, requests, render} = browser(t);
  render(`## Decision
<script>window.__loanXss = 1</script>
<img src="https://remote.invalid/pixel" onerror="window.__loanXss = 2">
<iframe src="https://remote.invalid/frame"></iframe>
<svg onload="window.__loanXss=3"><a xlink:href="javascript:alert(1)">svg</a></svg>
<math><mi>x</mi></math>
<style>body { display:none }</style>
<p style="color:red" onmouseover="window.__loanXss=4">Safe text</p>
<a href="java&#x73;cript:window.__loanXss=5" onclick="window.__loanXss=6">bad link</a>
[data link](data:text/html;base64,PHNjcmlwdD4=)
![remote markdown image](https://remote.invalid/markdown.png)`);
  assert.equal(target.querySelector('h2').textContent, 'Decision');
  assert.equal(target.querySelectorAll('script,img,iframe,svg,math,style,object,embed,link,form,input').length, 0);
  for (const element of target.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      assert.ok(!/^on/i.test(attribute.name), attribute.name);
      assert.notEqual(attribute.name, 'style');
      assert.notEqual(attribute.name, 'src');
    }
    element.dispatchEvent(new window.Event('mouseover'));
    element.dispatchEvent(new window.Event('error'));
  }
  for (const link of target.querySelectorAll('a[href]')) {
    assert.ok(['http:', 'https:', 'mailto:'].includes(new window.URL(link.href).protocol));
  }
  assert.equal(window.__loanXss, undefined);
  assert.deepEqual(requests, []);
});

test('unsupported parser or sanitizer fails closed to plain text', t => {
  const {window, target, render} = browser(t);
  window.DOMPurify.isSupported = false;
  const text = '**Assessment** <script>window.__loanXss=1</script>';
  render(text);
  assert.equal(target.textContent, text);
  assert.equal(target.children.length, 0);
  assert.equal(window.__loanXss, undefined);
});

test('verification rejects stale browser assets instead of accepting a lockfile-only update', t => {
  const tempBase = join(root, 'tmp');
  mkdirSync(tempBase, {recursive: true});
  const output = mkdtempSync(join(tempBase, 'vendor-test-'));
  t.after(() => rmSync(output, {recursive: true, force: true}));
  execFileSync(process.execPath, [join(root, 'vendor.mjs'), '--out', output]);
  execFileSync(process.execPath, [join(root, 'vendor.mjs'), '--check', '--out', output]);
  writeFileSync(join(output, 'marked.umd.js'), 'stale bundle');
  const result = spawnSync(process.execPath, [join(root, 'vendor.mjs'), '--check', '--out', output], {encoding:'utf8'});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Stale Loan browser assets: marked\.umd\.js/);
});
