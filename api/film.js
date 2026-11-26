import { filmResponse } from '../lookup.mjs';

function send(res, status, body, cache) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
  };
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(status, headers);
    res.end(body);
    return undefined;
  }
  return new Response(body, { status, headers });
}

export default async function handler(req, res) {
  try {
    const raw = typeof req === 'string' ? req : req?.url || '/';
    const url = new URL(raw, 'http://127.0.0.1');
    const result = await filmResponse(url.searchParams.get('q') || '', {
      list: url.searchParams.get('list') === '1',
      upcoming: url.searchParams.get('upcoming') === '1',
      feed: url.searchParams.get('feed') === '1',
      overview: url.searchParams.get('overview') === '1',
      card: url.searchParams.get('card') === '1',
      lang: url.searchParams.get('lang') === 'de' ? 'de' : 'en',
    });
    return send(res, result.status, result.body, result.cache);
  } catch {
    const body = JSON.stringify({ error: 'Der Abruf ist gerade nicht möglich.' });
    return send(res, 502, body, 'no-store');
  }
}
