import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifestPath = path.join(root, 'assets/v2-assets.json');
const assetPattern = /["'`](\/[A-Za-z0-9_./ -]+\.(?:glb|gltf|png|jpe?g|webp|svg|mp3|wav|ogg|mp4|woff2?))(?:[?#][^"'`]*)?["'`]/gi;
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);

const fail = (message) => {
  throw new Error(`[v2-assets] ${message}`);
};

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
};

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) fail('unsupported or malformed manifest');

const paths = new Set();
const sources = new Set();
for (const asset of manifest.assets) {
  if (typeof asset.runtimePath !== 'string' || !asset.runtimePath.startsWith('/')) {
    fail('every runtimePath must be root-relative');
  }
  if (typeof asset.sourcePath !== 'string' || !asset.sourcePath.startsWith('public-v2/')) {
    fail(`${asset.runtimePath} must resolve from public-v2/`);
  }
  if (paths.has(asset.runtimePath)) fail(`duplicate runtime path ${asset.runtimePath}`);
  if (sources.has(asset.sourcePath)) fail(`duplicate source path ${asset.sourcePath}`);
  paths.add(asset.runtimePath);
  sources.add(asset.sourcePath);

  const absolute = path.resolve(root, asset.sourcePath);
  if (!absolute.startsWith(`${path.resolve(root, 'public-v2')}${path.sep}`)) fail(`unsafe path ${asset.sourcePath}`);
  const metadata = await stat(absolute).catch(() => null);
  if (!metadata?.isFile()) fail(`missing asset ${asset.sourcePath}`);
  if (metadata.size !== asset.bytes) fail(`${asset.sourcePath} size changed: expected ${asset.bytes}, found ${metadata.size}`);
  const digest = createHash('sha256').update(await readFile(absolute)).digest('hex');
  if (digest !== asset.sha256) fail(`${asset.sourcePath} hash changed; review provenance and update the manifest`);
  if (!asset.provenance || !['approved', 'required'].includes(asset.rightsReview)) {
    fail(`${asset.sourcePath} is missing provenance or rights-review status`);
  }
}

const scannedFiles = [path.join(root, 'index.html'), ...(await walk(path.join(root, 'src/v2')))];
const referenced = new Set();
for (const file of scannedFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(assetPattern)) referenced.add(match[1]);
}

for (const runtimePath of referenced) {
  if (!paths.has(runtimePath)) fail(`${runtimePath} is referenced by v2 but absent from assets/v2-assets.json`);
}

console.log(`[v2-assets] verified ${manifest.assets.length} manifested assets and ${referenced.size} runtime references`);
