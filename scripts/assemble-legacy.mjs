import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { constants as zlibConstants, gunzipSync } from 'node:zlib';

const publicDir = path.join(process.cwd(), 'public');
const outputPath = path.join(publicDir, 'legacy-v15.html.gz.b64');
const partPattern = /^legacy-v15\.part-(\d{2})\.txt$/;
const maxRecoveryNodes = 256;

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

function hasRequiredMarkers(html) {
  return (
    html.startsWith('<!doctype html>') &&
    html.includes('WEB BOQ • v15') &&
    html.includes('syncGeneratedBoq')
  );
}

function inspectOrder(order) {
  // Decode every checked-in base64 part first, then concatenate the gzip bytes.
  // This works both for independently encoded chunks and for 4-byte-aligned
  // slices of one base64 stream.
  const compressed = Buffer.concat(order.map((index) => binaryChunks[index]));

  if (compressed[0] !== 0x1f || compressed[1] !== 0x8b || compressed[2] !== 0x08) {
    return { status: 'invalid', reason: 'missing gzip header' };
  }

  try {
    const htmlBuffer = gunzipSync(compressed);
    const html = htmlBuffer.toString('utf8');
    return hasRequiredMarkers(html)
      ? { status: 'complete', html, htmlBuffer, compressed }
      : {
          status: 'invalid',
          reason: 'gzip completed without required WEB BOQ markers',
          htmlBuffer,
        };
  } catch (fullError) {
    // Z_SYNC_FLUSH lets us inspect a truncated gzip prefix. A candidate is not
    // considered a valid continuation merely because this call succeeds: the
    // caller also requires the decompressed HTML to grow while preserving the
    // entire previously decoded prefix.
    try {
      const htmlBuffer = gunzipSync(compressed, {
        finishFlush: zlibConstants.Z_SYNC_FLUSH,
      });

      if (htmlBuffer.length === 0) {
        return { status: 'invalid', reason: 'gzip prefix produced zero HTML bytes' };
      }

      return {
        status: 'incomplete',
        htmlBuffer,
        compressed,
        reason: fullError instanceof Error ? fullError.message : String(fullError),
      };
    } catch (partialError) {
      const code =
        partialError && typeof partialError === 'object' && 'code' in partialError
          ? partialError.code
          : 'UNKNOWN';
      const message = partialError instanceof Error ? partialError.message : String(partialError);
      return { status: 'invalid', reason: `${code} ${message}` };
    }
  }
}

function preservesAndExtends(previousBuffer, nextBuffer) {
  if (!previousBuffer || !nextBuffer || nextBuffer.length <= previousBuffer.length) {
    return false;
  }
  return nextBuffer.subarray(0, previousBuffer.length).equals(previousBuffer);
}

const naturalOrder = parts.map(({ index }) => index);
const naturalInspection = inspectOrder(naturalOrder);

if (naturalInspection.status === 'complete') {
  const encoded = naturalInspection.compressed.toString('base64');
  await writeFile(outputPath, `${encoded}\n`, 'utf8');
  console.log('Legacy WEB BOQ natural part order is valid.');
  console.log(
    `Legacy WEB BOQ assembled: ${encoded.length.toLocaleString()} base64 characters, ${naturalInspection.html.length.toLocaleString()} HTML characters`,
  );
  process.exit(0);
}

console.warn(
  `Natural legacy part order is ${naturalInspection.status}: ${naturalInspection.reason}. Checking validated continuations...`,
);

const seedOrder = [0];
const seedInspection = inspectOrder(seedOrder);
if (seedInspection.status !== 'incomplete') {
  throw new Error(
    `legacy-v15.part-00.txt is not a valid beginning of the gzip stream: ${seedInspection.reason}`,
  );
}

console.log(
  `Legacy gzip seed part-00 yields ${seedInspection.htmlBuffer.length.toLocaleString()} HTML bytes.`,
);

let visitedNodes = 0;
const deadEnds = new Set();

function recoverOrder(order, remaining, previousHtmlBuffer) {
  visitedNodes += 1;
  if (visitedNodes > maxRecoveryNodes) {
    throw new Error(
      `Legacy WEB BOQ validated recovery exceeded ${maxRecoveryNodes} nodes; refusing factorial brute-force search`,
    );
  }

  const stateKey = `${order.join(',')}|${remaining.join(',')}`;
  if (deadEnds.has(stateKey)) return null;

  const viable = [];

  for (const candidate of remaining) {
    const nextOrder = [...order, candidate];
    const inspection = inspectOrder(nextOrder);
    const label = nextOrder.map((index) => String(index).padStart(2, '0')).join(' → ');

    if (inspection.status === 'complete') {
      if (!preservesAndExtends(previousHtmlBuffer, inspection.htmlBuffer)) {
        console.warn(`candidate ${label}: rejected (completed stream does not extend decoded prefix)`);
        continue;
      }
      console.log(
        `candidate ${label}: COMPLETE (+${(inspection.htmlBuffer.length - previousHtmlBuffer.length).toLocaleString()} HTML bytes)`,
      );
      return { order: nextOrder, ...inspection };
    }

    if (
      inspection.status === 'incomplete' &&
      preservesAndExtends(previousHtmlBuffer, inspection.htmlBuffer)
    ) {
      const growth = inspection.htmlBuffer.length - previousHtmlBuffer.length;
      viable.push({ candidate, nextOrder, inspection, growth });
      console.log(`candidate ${label}: viable (+${growth.toLocaleString()} HTML bytes)`);
    } else if (order.length === 1) {
      const detail =
        inspection.status === 'invalid'
          ? inspection.reason
          : `no decompressed growth (${inspection.htmlBuffer?.length ?? 0} bytes)`;
      console.warn(`candidate ${label}: rejected (${detail})`);
    }
  }

  if (viable.length === 0) {
    deadEnds.add(stateKey);
    return null;
  }

  // Larger verified growth is a useful deterministic heuristic, but recovery
  // still backtracks among only those candidates that genuinely extend HTML.
  viable.sort((a, b) => b.growth - a.growth || a.candidate - b.candidate);

  for (const entry of viable) {
    const result = recoverOrder(
      entry.nextOrder,
      remaining.filter((index) => index !== entry.candidate),
      entry.inspection.htmlBuffer,
    );
    if (result) return result;
  }

  deadEnds.add(stateKey);
  return null;
}

const recovered = recoverOrder(
  seedOrder,
  parts.slice(1).map(({ index }) => index),
  seedInspection.htmlBuffer,
);

if (!recovered) {
  throw new Error(
    `No checked-in legacy WEB BOQ part can form a complete continuation from part-00 after ${visitedNodes} validated recovery node(s). The gzip chunks are inconsistent, corrupted, or a chunk is missing.`,
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
  `Legacy WEB BOQ assembled: ${encoded.length.toLocaleString()} base64 characters, ${recovered.html.length.toLocaleString()} HTML characters, ${visitedNodes} validated recovery node(s)`,
);
