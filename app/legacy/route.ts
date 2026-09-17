import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const runtime = 'nodejs';

function patchLegacyHtml(source: string) {
  const pattern = /(function populateSectionOptions\(\)\{[\s\S]*?)(\n    if\(\$\('catalogMajor'\)\) populateCatalogMajors\(\);)(\n  \}\n  function renderSummary\(\)\{)/;

  if (!pattern.test(source)) {
    throw new Error('WEB BOQ runtime patch target for populateSectionOptions was not found');
  }

  // v15 had a recursive loop:
  // populateCatalogMajors -> applyCatalogSelection -> alignBoqTargetToCatalog
  // -> populateSectionOptions -> populateCatalogMajors -> ...
  // Removing this one implicit refresh is safe because every explicit category
  // change/open action already calls populateCatalogMajors separately.
  return source.replace(pattern, '$1$3');
}

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'legacy-v15.html.gz.b64');
  const encoded = (await readFile(filePath, 'utf8')).trim();
  const rawHtml = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  const html = patchLegacyHtml(rawHtml);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-WEB-BOQ-Version': 'v15-nextjs-add-item-fix',
    },
  });
}
