import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const runtime = 'nodejs';

function patchLegacyHtml(source: string) {
  const broken = `  function populateSectionOptions(){\n    const ci=n($('newCategory').value); const cat=state.categories[ci];\n    $('newSection').innerHTML=(cat?.sections||[]).map((s,i)=>\`<option value="${i}">${escapeHtml(s.code)} ${escapeHtml(s.name)}</option>\`).join('');\n    if($('catalogMajor')) populateCatalogMajors();\n  }`;

  const fixed = `  function populateSectionOptions(){\n    const ci=n($('newCategory').value); const cat=state.categories[ci];\n    $('newSection').innerHTML=(cat?.sections||[]).map((s,i)=>\`<option value="${i}">${escapeHtml(s.code)} ${escapeHtml(s.name)}</option>\`).join('');\n  }`;

  if (!source.includes(broken)) {
    throw new Error('WEB BOQ runtime patch target for populateSectionOptions was not found');
  }

  return source.replace(broken, fixed);
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
