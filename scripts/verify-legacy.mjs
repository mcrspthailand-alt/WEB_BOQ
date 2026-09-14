import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const file = new URL('../public/legacy-v15.html.gz.b64', import.meta.url);
const encoded = (await readFile(file, 'utf8')).trim();
const decoded = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');

if (!decoded.startsWith('<!doctype html>')) {
  throw new Error('Legacy WEB BOQ payload is not a valid HTML document');
}

if (!decoded.includes('WEB BOQ • v15')) {
  throw new Error('Legacy WEB BOQ payload is not v15');
}

if (!decoded.includes('syncGeneratedBoq')) {
  throw new Error('Legacy WEB BOQ payload is missing v15 BOQ synchronization logic');
}

console.log(`Legacy WEB BOQ verified: ${decoded.length.toLocaleString()} characters`);
