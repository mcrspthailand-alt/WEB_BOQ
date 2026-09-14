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
const encoded = chunks.join('');

if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
  throw new Error('Legacy WEB BOQ payload parts do not form valid base64 data');
}

const compressed = Buffer.from(encoded, 'base64');
if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
  throw new Error('Legacy WEB BOQ payload does not have a valid gzip header');
}

let html;
try {
  html = gunzipSync(compressed).toString('utf8');
} catch (error) {
  throw new Error(`Legacy WEB BOQ payload cannot be decompressed: ${error.message}`, {
    cause: error,
  });
}

if (!html.startsWith('<!doctype html>')) {
  throw new Error('Legacy WEB BOQ payload is not a valid HTML document');
}

if (!html.includes('WEB BOQ • v15')) {
  throw new Error('Legacy WEB BOQ payload is not v15');
}

if (!html.includes('syncGeneratedBoq')) {
  throw new Error('Legacy WEB BOQ payload is missing v15 BOQ synchronization logic');
}

await writeFile(outputPath, `${encoded}\n`, 'utf8');

console.log(
  `Legacy WEB BOQ assembled from ${parts.length} parts: ${encoded.length.toLocaleString()} base64 characters, ${html.length.toLocaleString()} HTML characters`,
);
