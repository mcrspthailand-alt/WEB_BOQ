import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const publicDir = path.join(process.cwd(), 'public');
const outputPath = path.join(publicDir, 'legacy-v15.html.gz.b64');
const partPattern = /^legacy-v15\.part-(\d{2})\.txt$/;
const maxSearchAttempts = 5000;

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

const encodedChunks = await Promise.all(
  parts.map(async ({ name }) => (await readFile(path.join(publicDir, name), 'utf8')).trim()),
);

const binaryChunks = encodedChunks.map((chunk, index) => {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk)) {
    throw new Error(`Legacy WEB BOQ payload part contains invalid base64 characters: ${parts[index].name}`);
  }
  if (chunk.length % 4 !== 0) {
    throw new Error(`Legacy WEB BOQ payload part is not aligned to a base64 boundary: ${parts[index].name}`);
  }

  const decoded = Buffer.from(chunk, 'base64');
  if (decoded.length === 0) {
    throw new Error(`Legacy WEB BOQ payload part decoded to zero bytes: ${parts[index].name}`);
  }
  return decoded;
});

function inspectOrder(order) {
  // IMPORTANT: every part was base64-encoded independently. Decode each part
  // first, then concatenate the binary gzip bytes. Concatenating the base64
  // strings directly is invalid when intermediate chunks contain '=' padding.
  const compressed = Buffer.concat(order.map((index) => binaryChunks[index]));

  if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    return { status: 'invalid', reason: 'missing gzip header' };
  }

  try {
    const html = gunzipSync(compressed).toString('utf8');
    const valid =
      html.startsWith('<!doctype html>') &&
      html.includes('WEB BOQ • v15') &&
      html.includes('syncGeneratedBoq');

    return valid
      ? { status: 'complete', html, compressed }
      : { status: 'invalid', reason: 'gzip completed without required WEB BOQ markers' };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : 'UNKNOWN';
    const message = error instanceof Error ? error.message : String(error);

    if (code === 'Z_BUF_ERROR' && /unexpected end/i.test(message)) {
      return { status: 'incomplete', reason: `${code} ${message}` };
    }

    return { status: 'invalid', reason: `${code} ${message}` };
  }
}

// The files are named with their intended order, so try the deterministic
// natural order first. Recovery search is only a fallback for historical data.
const naturalOrder = parts.map(({ index }) => index);
const naturalInspection = inspectOrder(naturalOrder);

let attempts = 0;
const memo = new Set();

function recoverOrder(order, remaining) {
  attempts += 1;
  if (attempts > maxSearchAttempts) {
    throw new Error(`Legacy WEB BOQ part-order recovery exceeded ${maxSearchAttempts} attempts`);
  }

  const key = order.join(',');
  if (memo.has(key)) return null;
  memo.add(key);

  const inspection = inspectOrder(order);

  if (inspection.status === 'complete') {
    return { order, ...inspection };
  }

  if (inspection.status === 'invalid' || remaining.length === 0) {
    return null;
  }

  for (const candidate of remaining) {
    const nextOrder = [...order, candidate];
    const nextInspection = inspectOrder(nextOrder);
    const label = nextOrder.map((index) => String(index).padStart(2, '0')).join(' → ');

    if (nextInspection.status === 'invalid') {
      if (order.length === 1) {
        console.warn(`candidate ${label}: rejected (${nextInspection.reason})`);
      }
      continue;
    }

    console.log(`candidate ${label}: ${nextInspection.status}`);

    if (nextInspection.status === 'complete') {
      return { order: nextOrder, ...nextInspection };
    }

    const result = recoverOrder(
      nextOrder,
      remaining.filter((index) => index !== candidate),
    );
    if (result) return result;
  }

  return null;
}

let recovered;

if (naturalInspection.status === 'complete') {
  recovered = { order: naturalOrder, ...naturalInspection };
  console.log('Legacy WEB BOQ natural part order is valid.');
} else {
  console.warn(
    `Natural legacy part order is ${naturalInspection.status}: ${naturalInspection.reason}. Trying recovery search...`,
  );

  const firstInspection = inspectOrder([0]);
  if (firstInspection.status !== 'incomplete') {
    throw new Error(
      `legacy-v15.part-00.txt is not a valid beginning of the gzip stream: ${firstInspection.reason}`,
    );
  }

  recovered = recoverOrder(
    [0],
    parts.slice(1).map(({ index }) => index),
  );
}

if (!recovered) {
  throw new Error(
    `Could not recover a complete legacy WEB BOQ gzip stream from ${parts.length} parts after ${attempts} attempts`,
  );
}

const encoded = recovered.compressed.toString('base64');
await writeFile(outputPath, `${encoded}\n`, 'utf8');

const orderedNames = recovered.order.map((index) => parts[index].name);
const unusedNames = parts
  .filter(({ index }) => !recovered.order.includes(index))
  .map(({ name }) => name);

console.log(`Legacy WEB BOQ recovered order: ${orderedNames.join(' -> ')}`);
if (unusedNames.length > 0) {
  console.warn(`Unused legacy payload parts: ${unusedNames.join(', ')}`);
}
console.log(
  `Legacy WEB BOQ assembled: ${encoded.length.toLocaleString()} base64 characters, ${recovered.html.length.toLocaleString()} HTML characters, ${attempts} search attempts`,
);
