import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const DOMAIN = process.env.AUTH_DOMAIN || 'users.invalid';
const attempts = new Map();

function enabled() {
  return Boolean(
    process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
    && process.env.MAIL_FROM
  );
}

function authEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@${DOMAIN}`;
}

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

function html(res, status, markup) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(status, headers);
    res.end(markup);
    return undefined;
  }
  return new Response(markup, { status, headers });
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

function originOf(req) {
  const headers = req && req.headers ? req.headers : {};
  const proto = headers['x-forwarded-proto'] || 'http';
  const host = headers['x-forwarded-host'] || headers.host;
  if (host) return `${String(proto).split(',')[0].trim()}://${String(host).split(',')[0].trim()}`;
  return 'http://localhost:8741';
}

function limited(username) {
  const now = Date.now();
  const recent = (attempts.get(username) || []).filter((at) => now - at < 60 * 60 * 1000);
  if (recent.length >= 3) {
    attempts.set(username, recent);
    return true;
  }
  recent.push(now);
  attempts.set(username, recent);
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
    const message = (data && (data.msg || data.message || data.error_description)) || response.statusText;
    const error = new Error(message || 'Supabase antwortet nicht.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function userFromRequest(req) {
  const headers = req && req.headers ? req.headers : {};
  const header = headers.authorization || headers.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendMail(to, subject, text) {
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
  });
}

async function verify(req, res) {
  const user = await userFromRequest(req);
  if (!user || !user.id) return json(res, 401, { error: 'Bitte melde dich an.' });
  const body = await readBody(req);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const existing = await supabase(`/rest/v1/recovery_emails?user_id=eq.${user.id}&select=email`);
  const stored = Array.isArray(existing) ? existing[0] : null;
  const target = email || (stored && stored.email);
  if (!target) return json(res, 400, { error: 'Keine E-Mail zum Bestätigen hinterlegt.' });
  const token = crypto.randomBytes(32).toString('hex');
  const row = {
    user_id: user.id,
    email: target,
    verified: false,
    token_hash: hashToken(token),
    token_expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase('/rest/v1/recovery_emails?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  const link = `${originOf(req)}/api/recovery?action=confirm&token=${token}`;
  await sendMail(
    target,
    'E-Mail für MoviePlot bestätigen',
    `Bestätige diese Adresse für das Zurücksetzen deines Passworts:\n\n${link}\n\nDer Link gilt 24 Stunden.`,
  );
  return json(res, 200, { ok: true });
}

async function confirm(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const token = url.searchParams.get('token') || '';
  if (!token) return html(res, 400, '<p>Der Link ist unvollständig.</p>');
  const rows = await supabase(`/rest/v1/recovery_emails?token_hash=eq.${hashToken(token)}&select=user_id,token_expires`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.token_expires || new Date(row.token_expires).getTime() < Date.now()) {
    return html(res, 400, '<p>Der Link ist abgelaufen. Fordere in der App einen neuen an.</p>');
  }
  await supabase(`/rest/v1/recovery_emails?user_id=eq.${row.user_id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      verified: true,
      token_hash: null,
      token_expires: null,
    }),
  });
  return html(res, 200, '<p>Die E-Mail ist bestätigt. Du kannst das Fenster schliessen.</p>');
}

async function reset(req, res) {
  const body = await readBody(req);
  const username = String(body.username || '').trim().toLowerCase();
  const same = { ok: true, message: 'Falls eine bestätigte E-Mail hinterlegt ist, wurde ein Link verschickt.' };
  if (!/^[a-z0-9_]{3,20}$/.test(username) || limited(username)) return json(res, 200, same);
  try {
    const profiles = await supabase(`/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) return json(res, 200, same);
    const rows = await supabase(`/rest/v1/recovery_emails?user_id=eq.${profile.id}&select=email,verified`);
    const mail = Array.isArray(rows) ? rows[0] : null;
    if (!mail || !mail.verified || !mail.email) return json(res, 200, same);
    const link = await supabase('/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({
        type: 'recovery',
        email: authEmail(username),
        redirect_to: originOf(req),
      }),
    });
    const action = link && (link.action_link || (link.properties && link.properties.action_link));
    if (!action) return json(res, 200, same);
    await sendMail(
      mail.email,
      'Passwort für MoviePlot zurücksetzen',
      `Setze dein Passwort über diesen Link zurück:\n\n${action}\n`,
    );
  } catch {
    /* dieselbe Antwort, damit niemand Profile abfragen kann */
  }
  return json(res, 200, same);
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const action = url.searchParams.get('action') || (url.searchParams.has('status') ? 'status' : '');
    if (action === 'status' || url.pathname.endsWith('/status')) {
      return json(res, 200, { enabled: enabled() });
    }
    if (!enabled()) {
      return json(res, 503, { error: 'Die Wiederherstellung ist nicht eingerichtet.' });
    }
    if (action === 'verify') return verify(req, res);
    if (action === 'confirm') return confirm(req, res);
    if (action === 'reset') return reset(req, res);
    return json(res, 404, { error: 'Diese Aktion gibt es nicht.' });
  } catch {
    return json(res, 500, { error: 'Die Anfrage ist gerade nicht möglich.' });
  }
}
