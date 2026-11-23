const DOMAIN = process.env.AUTH_DOMAIN || 'users.invalid';
const renames = new Map();

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(status, headers);
    res.end(body);
    return undefined;
  }
  return new Response(body, { status, headers });
}

async function readBody(req) {
  if (!req) return {};
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (typeof req.json === 'function') {
    try { return await req.json(); } catch { return {}; }
  }
  if (typeof req.on !== 'function') return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function authEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@${DOMAIN}`;
}

function limited(userId) {
  const now = Date.now();
  const recent = (renames.get(userId) || []).filter((at) => now - at < 60 * 60 * 1000);
  if (recent.length >= 5) {
    renames.set(userId, recent);
    return true;
  }
  recent.push(now);
  renames.set(userId, recent);
  return false;
}

async function supabase(path, options) {
  const response = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options && options.headers),
    },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const message = (data && (data.msg || data.message || data.error_description || data.error)) || response.statusText;
    const error = new Error(message || 'Supabase antwortet nicht.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function getUser(req) {
  const headers = req && req.headers ? req.headers : {};
  const header = headers.authorization || headers.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token || !process.env.SUPABASE_URL) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function takenMessage(error) {
  const text = String(error && error.message || '');
  return /duplicate|already|exists|unique|registered/i.test(text);
}

export default async function handler(req, res) {
  const method = req && req.method ? req.method : 'GET';
  if (method !== 'POST') return json(res, 405, { error: 'Nicht möglich.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 503, { error: 'Anmeldung ist nicht eingerichtet.' });
  }
  const body = await readBody(req);
  if (body.action !== 'rename') return json(res, 400, { error: 'Nicht möglich.' });
  const display = String(body.name || '').trim();
  if (!/^[A-Za-z0-9_]*$/.test(display)) {
    return json(res, 400, { code: 'shape', error: 'Nur Buchstaben, Ziffern und _' });
  }
  if (display.length < 3 || display.length > 20) {
    return json(res, 400, { code: 'length', error: '3 bis 20 Zeichen' });
  }
  const user = await getUser(req);
  if (!user || !user.id) return json(res, 401, { error: 'Bitte zuerst anmelden.' });
  if (limited(user.id)) return json(res, 429, { code: 'limit', error: 'Höchstens 5 pro Stunde.' });
  const username = display.toLowerCase();
  const nextEmail = authEmail(username);
  try {
    const rows = await supabase(`/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id,username,display_name`);
    const list = Array.isArray(rows) ? rows : [];
    if (list.some((row) => row.id !== user.id)) {
      return json(res, 409, { code: 'taken', error: 'Name vergeben' });
    }
    const mine = list.find((row) => row.id === user.id) || null;
    const previous = mine || (await supabase(`/rest/v1/profiles?id=eq.${user.id}&select=username,display_name`) || [])[0] || {};
    const previousName = previous.username || '';
    const previousDisplay = previous.display_name || '';
    await supabase(`/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ username, display_name: display }),
    });
    const sameEmail = String(user.email || '').toLowerCase() === nextEmail.toLowerCase();
    if (!sameEmail) {
      try {
        await supabase(`/auth/v1/admin/users/${user.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            email: nextEmail,
            email_confirm: true,
            user_metadata: { username },
          }),
        });
      } catch (error) {
        await supabase(`/rest/v1/profiles?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ username: previousName, display_name: previousDisplay }),
        });
        if (takenMessage(error)) return json(res, 409, { code: 'taken', error: 'Name vergeben' });
        return json(res, 500, { error: 'Der Name konnte nicht geändert werden.' });
      }
    }
    return json(res, 200, { username, display_name: display });
  } catch (error) {
    if (takenMessage(error)) return json(res, 409, { code: 'taken', error: 'Name vergeben' });
    return json(res, 500, { error: 'Der Name konnte nicht geändert werden.' });
  }
}
