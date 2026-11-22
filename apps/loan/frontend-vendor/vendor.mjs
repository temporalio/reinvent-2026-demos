import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const check = process.argv.includes('--check');
const outIndex = process.argv.indexOf('--out');
const output = outIndex === -1 ? resolve(root, '../static/vendor') : resolve(process.argv[outIndex + 1]);
const read = name => readFile(resolve(root, name));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const lockBytes = await read('package-lock.json');
const lock = JSON.parse(lockBytes);
const manifest = JSON.parse(await read('package.json'));
const dependencies = {};

for (const name of ['marked', 'dompurify']) {
  const installed = JSON.parse(await read(`node_modules/${name}/package.json`));
  const locked = lock.packages[`node_modules/${name}`];
  if (installed.version !== locked.version || installed.version !== manifest.dependencies[name]) {
    throw new Error(`${name}: installed, locked, and declared versions must agree`);
  }
  dependencies[name] = {
    version: installed.version,
    license: installed.license,
    resolved: locked.resolved,
    integrity: locked.integrity,
  };
}

const copies = [
  ['node_modules/marked/lib/marked.umd.js', 'marked.umd.js'],
  ['node_modules/marked/lib/marked.umd.js.map', 'marked.umd.js.map'],
  ['node_modules/marked/LICENSE', 'marked.LICENSE'],
  ['node_modules/dompurify/dist/purify.min.js', 'purify.min.js'],
  ['node_modules/dompurify/dist/purify.min.js.map', 'purify.min.js.map'],
  ['node_modules/dompurify/LICENSE', 'dompurify.LICENSE'],
  ['node_modules/dompurify/LICENSE-MPL', 'dompurify.LICENSE-MPL'],
  ['assessment-renderer.js', 'assessment-renderer.js'],
];
const files = new Map();
for (const [source, name] of copies) files.set(name, await read(source));
const provenance = {
  lockfileSha256: sha256(lockBytes),
  dependencies,
  files: Object.fromEntries([...files].map(([name, bytes]) => [name, {sha256: sha256(bytes)}])),
};
files.set('PROVENANCE.json', Buffer.from(JSON.stringify(provenance, null, 2) + '\n'));

if (!check) await mkdir(output, {recursive: true});
const stale = [];
for (const [name, bytes] of files) {
  const path = resolve(output, name);
  if (check) {
    let current;
    try { current = await readFile(path); } catch { /* Missing files are stale too. */ }
    if (!current?.equals(bytes)) stale.push(name);
  } else {
    await writeFile(path, bytes);
  }
}
if (stale.length) {
  console.error(`Stale Loan browser assets: ${stale.join(', ')}. Run npm run build and commit static/vendor/.`);
  process.exitCode = 1;
} else {
  console.log(`${check ? 'Verified' : 'Generated'} ${files.size} local Loan browser assets.`);
}
