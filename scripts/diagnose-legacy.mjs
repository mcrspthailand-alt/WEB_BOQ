import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, constants as zlibConstants } from 'node:zlib';

const publicDir = path.join(process.cwd(), 'public');
const names = (await readdir(publicDir))
  .filter((name) => /^legacy-v15\.part-\d{2}\.txt$/.test(name))
  .sort();

for (const name of names) {
  const text = (await readFile(path.join(publicDir, name), 'utf8')).trim();
  const bytes = Buffer.from(text, 'base64');
  const head = [...bytes.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const tail = [...bytes.subarray(-8)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  let mode = 'not independently decodable';
  let partialLength = 0;
  try {
    const full = gunzipSync(bytes);
    mode = `complete gzip (${full.length} bytes)`;
  } catch {
    try {
      const partial = gunzipSync(bytes, { finishFlush: zlibConstants.Z_SYNC_FLUSH });
      partialLength = partial.length;
      if (partial.length > 0) mode = `gzip prefix (${partial.length} decoded bytes)`;
    } catch {}
  }
  console.log(`${name}: chars=${text.length} bytes=${bytes.length} head=[${head}] tail=[${tail}] ${mode}${partialLength ? '' : ''}`);
}
