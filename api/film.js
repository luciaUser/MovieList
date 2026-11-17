import { lookupFilm } from '../lookup.mjs';

export default async function handler(req, res) {
  try {
    const raw = typeof req === 'string' ? req : req?.url || '/';
    const url = new URL(raw, 'http://127.0.0.1');
    const film = await lookupFilm(url.searchParams.get('q') || '');
    const body = JSON.stringify({ film });
    const status = film ? 200 : 404;
    if (res && typeof res.writeHead === 'function') {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    const body = JSON.stringify({ film: null });
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    }
    return new Response(body, { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
}
