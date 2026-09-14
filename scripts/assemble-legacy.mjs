import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const publicDir = path.join(process.cwd(), 'public');
const outputPath = path.join(publicDir, 'legacy-v15.html.gz.b64');
const partPattern = /^legacy-v15\.part-(\d{2})\.txt$/;

const entries = await readdir(publicDir);
const parts = entries
  .map((name) => {
    const match = name.match(partPattern);
    return match ? { name, index: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.index - b.index);

if (parts.length === 0) {
  throw new Error('No legacy WEB BOQ payload parts were found in public/');
}

for (let index = 0; index < parts.length; index += 1) {
  if (parts[index].index !== index) {
    throw new Error(
      `Legacy WEB BOQ payload parts are not contiguous: expected part-${String(index).padStart(2, '0')}, found ${parts[index].name}`,
    );
  }
}

const chunks = await Promise.all(
  parts.map(async ({ name }) => (await readFile(path.join(publicDir, name), 'utf8')).trim()),
);

for (const [index, chunk] of chunks.entries()) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk)) {
    throw new Error(`Legacy WEB BOQ payload part contains invalid base64 characters: ${parts[index].name}`);
  }
}

let encoded = '';
let html = null;
let usedPartCount = 0;
let lastError = null;

for (let index = 0; index < chunks.length; index += 1) {
  encoded += chunks[index];

  if (encoded.length % 4 !== 0) {
    console.warn(`prefix 00-${String(index).padStart(2, '0')}: skipped because base64 length is not divisible by 4`);
    continue;
  }

  const compressed = Buffer.from(encoded, 'base64');

  if (index === 0 && (compressed[0] !== 0x1f || compressed[1] !== 0x8b)) {
    throw new Error('Legacy WEB BOQ payload does not have a valid gzip header');
  }

  try {
    const candidate = gunzipSync(compressed).toString('utf8');

    if (
      candidate.startsWith('<!doctype html>') &&
      candidate.includes('WEB BOQ • v15') &&
      candidate.includes('syncGeneratedBoq')
    ) {
      html = candidate;
      usedPartCount = index + 1;
      break;
    }

    console.warn(
      `prefix 00-${String(index).padStart(2, '0')}: gzip decoded but required WEB BOQ markers were not all present`,
    );
  } catch (error) {
    lastError = error;
    const code = error && typeof error === 'object' && 'code' in error ? error.code : 'UNKNOWN';
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`prefix 00-${String(index).padStart(2, '0')}: ${code} ${message}`);
  }
}

if (html === null) {
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`No complete legacy WEB BOQ gzip payload could be reconstructed from the available parts${suffix}`);
}

const selectedEncoded = chunks.slice(0, usedPartCount).join('');
await writeFile(outputPath, `${selectedEncoded}\n`, 'utf8');

if (usedPartCount < parts.length) {
  const ignored = parts.slice(usedPartCount).map(({ name }) => name).join(', ');
  console.warn(`Ignored trailing legacy payload parts after the complete gzip stream: ${ignored}`);
}

console.log(
  `Legacy WEB BOQ assembled from ${usedPartCount}/${parts.length} parts: ${selectedEncoded.length.toLocaleString()} base64 characters, ${html.length.toLocaleString()} HTML characters`,
);
