export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'WEB_BOQ',
    runtime: 'Next.js',
    legacyUi: 'v15',
  });
}
