import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const runtime = 'nodejs';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'legacy-v15.html.gz.b64');
  const encoded = (await readFile(filePath, 'utf8')).trim();
  const html = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-WEB-BOQ-Version': 'v15-nextjs',
    },
  });
}
