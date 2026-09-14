import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, constants as zlibConstants } from 'node:zlib';

const publicDir = path.join(process.cwd(), 'public');
const names = (await readdir(publicDir))
  .filter((name) => /^legacy-v15\.part-\d{2}\.txt$/.test(name))
  .sort();

const chunks = new Map();
const decodedChunks = new Map();

for (const name of names) {
  const text = (await readFile(path.join(publicDir, name), 'utf8')).trim();
  chunks.set(name, text);
  const bytes = Buffer.from(text, 'base64');
  decodedChunks.set(name, bytes);
  const head = [...bytes.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const tail = [...bytes.subarray(-8)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  let mode = 'not independently decodable';
  try {
    const full = gunzipSync(bytes);
    mode = `complete gzip (${full.length} bytes)`;
  } catch {
    try {
      const partial = gunzipSync(bytes, { finishFlush: zlibConstants.Z_SYNC_FLUSH });
      if (partial.length > 0) mode = `gzip prefix (${partial.length} decoded bytes)`;
    } catch {}
  }
  console.log(`${name}: chars=${text.length} bytes=${bytes.length} head=[${head}] tail=[${tail}] ${mode}`);
}

const original = (await readFile(path.join(publicDir, 'legacy-v15.html.gz.b64'), 'utf8')).trim();
const part00 = chunks.get('legacy-v15.part-00.txt');
const part00Bytes = decodedChunks.get('legacy-v15.part-00.txt');

if (!part00 || !part00Bytes) {
  throw new Error('legacy-v15.part-00.txt is missing');
}

let mismatch = -1;
const compareLength = Math.min(original.length, part00.length);
for (let index = 0; index < compareLength; index += 1) {
  if (original[index] !== part00[index]) {
    mismatch = index;
    break;
  }
}
if (mismatch === -1 && original.length !== part00.length) mismatch = compareLength;

console.log(`original legacy-v15.html.gz.b64 chars=${original.length}`);
console.log(`part-00 chars=${part00.length}`);
console.log(`original vs part-00 first mismatch index=${mismatch}`);
console.log(`original startsWith(part-00)=${original.startsWith(part00)}`);
console.log(`part-00 startsWith(original)=${part00.startsWith(original)}`);

const originalSuffix = original.slice(part00.length);
console.log(`original suffix after part-00 chars=${originalSuffix.length} value=${JSON.stringify(originalSuffix)}`);
if (originalSuffix.length > 0) {
  for (const name of names.filter((name) => name !== 'legacy-v15.part-00.txt')) {
    const text = chunks.get(name);
    let shared = 0;
    while (shared < originalSuffix.length && shared < text.length && originalSuffix[shared] === text[shared]) {
      shared += 1;
    }
    if (shared > 0) {
      console.log(`original suffix matches ${name} prefix for ${shared} char(s)`);
    }
  }
}

const recoveredBuffer = gunzipSync(part00Bytes, {
  finishFlush: zlibConstants.Z_SYNC_FLUSH,
});
const recovered = recoveredBuffer.toString('utf8');

const markers = [
  '<!doctype html>',
  '<head',
  '</head>',
  '<body',
  '</body>',
  '<script',
  '</script>',
  'WEB BOQ • v15',
  'syncGeneratedBoq',
  'Factor F',
  'ปร.4',
  'ปร.5',
  'งานโครงสร้าง',
];

console.log(`recovered-prefix chars=${recovered.length}`);
for (const marker of markers) {
  console.log(`marker ${JSON.stringify(marker)}: ${recovered.includes(marker)}`);
}
console.log(`script-open count=${(recovered.match(/<script\b/gi) || []).length}`);
console.log(`script-close count=${(recovered.match(/<\/script>/gi) || []).length}`);
console.log(`style-open count=${(recovered.match(/<style\b/gi) || []).length}`);
console.log(`style-close count=${(recovered.match(/<\/style>/gi) || []).length}`);
console.log('RECOVERED_PREFIX_HEAD_BEGIN');
console.log(recovered.slice(0, 1500));
console.log('RECOVERED_PREFIX_HEAD_END');
console.log('RECOVERED_PREFIX_TAIL_BEGIN');
console.log(recovered.slice(-8000));
console.log('RECOVERED_PREFIX_TAIL_END');

console.log('CONTINUATION_CANDIDATES_BEGIN');
const fatalUtf8 = new TextDecoder('utf-8', { fatal: true });
for (const name of names.filter((name) => name !== 'legacy-v15.part-00.txt')) {
  const candidateBytes = decodedChunks.get(name);
  const joined = Buffer.concat([part00Bytes, candidateBytes]);
  try {
    const output = gunzipSync(joined, { finishFlush: zlibConstants.Z_SYNC_FLUSH });
    const preservesPrefix =
      output.length >= recoveredBuffer.length &&
      output.subarray(0, recoveredBuffer.length).equals(recoveredBuffer);
    const extension = preservesPrefix ? output.subarray(recoveredBuffer.length) : Buffer.alloc(0);
    let utf8Valid = false;
    let extensionText = '';
    try {
      extensionText = fatalUtf8.decode(extension);
      utf8Valid = true;
    } catch {
      extensionText = extension.toString('utf8');
    }
    const replacementCount = (extensionText.match(/\uFFFD/g) || []).length;
    const sample = extensionText.slice(0, 600);
    const tail = extensionText.slice(-300);
    console.log(
      `${name}: preservesPrefix=${preservesPrefix} extensionBytes=${extension.length} utf8Valid=${utf8Valid} replacementChars=${replacementCount}`,
    );
    console.log(`${name} EXTENSION_HEAD=${JSON.stringify(sample)}`);
    console.log(`${name} EXTENSION_TAIL=${JSON.stringify(tail)}`);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : 'UNKNOWN';
    const message = error instanceof Error ? error.message : String(error);
    console.log(`${name}: rejected (${code} ${message})`);
  }
}
console.log('CONTINUATION_CANDIDATES_END');
