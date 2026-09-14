import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliDecompressSync, gzipSync } from 'node:zlib';

const publicDir = path.join(process.cwd(), 'public');
const outputPath = path.join(publicDir, 'legacy-v15.html.gz.b64');

const expectedSourceBase64Length = 118_952;
const expectedBrotliSha256 =
  'f5e8eaf0d9aa79b5d1b49bc6f7f6e2a420c0f3774ce7a0086f81072c36a03fa1';
const expectedHtmlSha256 =
  '20dc9f5f4ef1ab897d2f870fe3053d279bbdd48edfdc0be1cbac04facfe1a188';

// The complete WEB-BOQ-Prototype-v15.html was recovered from the original
// project artifact and stored as a verified Brotli/base64 source. Part 03 is
// split into smaller fragments because the connector used during restoration
// required an additional byte-integrity gate for that section.
const sourceParts = [
  'legacy-v15.br-part-00.txt',
  'legacy-v15.br-part-01.txt',
  'legacy-v15.br-part-02.txt',
  'legacy-v15.br-part-03a1.txt',
  'legacy-v15.br-part-03a2.txt',
  'legacy-v15.br-part-03b.txt',
  'legacy-v15.br-part-04.txt',
  'legacy-v15.br-part-05.txt',
  'legacy-v15.br-part-06.txt',
  'legacy-v15.br-part-07.txt',
  'legacy-v15.br-part-08.txt',
  'legacy-v15.br-part-09.txt',
  'legacy-v15.br-part-10.txt',
  'legacy-v15.br-part-11.txt',
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const sourceText = (
  await Promise.all(
    sourceParts.map(async (name) => {
      const text = (await readFile(path.join(publicDir, name), 'utf8')).trim();

      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
        throw new Error(`Invalid base64 characters in ${name}`);
      }

      return text;
    }),
  )
).join('');

if (
  sourceText.length !== expectedSourceBase64Length ||
  sourceText.length % 4 !== 0
) {
  throw new Error(
    `Unexpected legacy Brotli base64 length: ${sourceText.length}; expected ${expectedSourceBase64Length}`,
  );
}

const brotliBuffer = Buffer.from(sourceText, 'base64');
const brotliSha256 = sha256(brotliBuffer);

if (brotliSha256 !== expectedBrotliSha256) {
  throw new Error(
    `Legacy Brotli SHA-256 mismatch: ${brotliSha256}; expected ${expectedBrotliSha256}`,
  );
}

const htmlBuffer = brotliDecompressSync(brotliBuffer);
const htmlSha256 = sha256(htmlBuffer);

if (htmlSha256 !== expectedHtmlSha256) {
  throw new Error(
    `Legacy HTML SHA-256 mismatch: ${htmlSha256}; expected ${expectedHtmlSha256}`,
  );
}

const html = htmlBuffer.toString('utf8');
const requiredMarkers = [
  '<!doctype html>',
  'WEB BOQ • v15',
  'syncGeneratedBoq',
  '</html>',
];

for (const marker of requiredMarkers) {
  if (!html.includes(marker)) {
    throw new Error(`Restored legacy HTML is missing required marker: ${marker}`);
  }
}

if (!html.startsWith('<!doctype html>')) {
  throw new Error('Restored legacy HTML does not start with <!doctype html>');
}

const gzipBase64 = gzipSync(htmlBuffer, { level: 9 }).toString('base64');
await writeFile(outputPath, `${gzipBase64}\n`, 'utf8');

console.log(
  `Legacy WEB BOQ v15 restored from ${sourceParts.length} verified source fragments: ${htmlBuffer.length.toLocaleString()} HTML bytes -> ${gzipBase64.length.toLocaleString()} gzip base64 characters`,
);
