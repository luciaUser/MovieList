import http from 'node:http';
import { filmResponse, recommendResponse } from './lookup.mjs';
import recovery from './api/recovery.js';
import account from './api/account.js';
import taste from './api/taste.js';
import { search } from './tmdb.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(ROOT, 'data', 'posters.json');
const PORT = Number(process.env.PORT || 8741);
const TOKEN = process.env.TMDB_ACCESS_TOKEN || '';

let posters = loadCache();
let refreshing = null;
let filmList = null;

function loadFilms() {
  if (filmList) return filmList;
  try {
    const source = fs.readFileSync(path.join(ROOT, 'films.js'), 'utf8');
    const start = source.indexOf('[');
    const end = source.lastIndexOf(']');
    filmList = JSON.parse(source.slice(start, end + 1));
  } catch {
    filmList = [];
  }
  return filmList;
}

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(posters, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookup(film) {
  const queries = [...new Set([film.original, film.title].filter(Boolean))];
  const year = film.yearNum == null ? '' : String(film.yearNum);
  for (const query of queries) {
    const hit = await search(query, year);
    if (hit?.posterPath) return `https://image.tmdb.org/t/p/w500${hit.posterPath}`;
  }
  return null;
}

async function refresh() {
  if (!TOKEN) return;
  const films = loadFilms();
  let writes = 0;
  for (const film of films) {
    if (Object.prototype.hasOwnProperty.call(posters, film.id)) continue;
    try {
      posters[film.id] = await lookup(film);
    } catch {
      posters[film.id] = null;
    }
    writes += 1;
    if (writes % 8 === 0) saveCache();
    await sleep(80);
  }
  saveCache();
}

function payload() {
  const films = loadFilms();
  const done = !TOKEN || films.every((film) => Object.prototype.hasOwnProperty.call(posters, film.id));
  const known = {};
  films.forEach((film) => {
    if (typeof posters[film.id] === 'string') known[film.id] = posters[film.id];
  });
  return { posters: known, done, configured: Boolean(TOKEN) };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

function send(res, status, body, type, cache = 'no-store') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': cache,
  });
  res.end(body);
}

function reply(res, status, body, type, cache = 'no-store') {
  if (res && typeof res.writeHead === 'function') {
    if (!res.headersSent) send(res, status, body, type, cache);
    return undefined;
  }
  return new Response(body, {
    status,
    headers: {
      'Content-Type': type,
      'Cache-Control': cache,
    },
  });
}

async function handle(req, res) {
  try {
    const raw = typeof req === 'string' ? req : req?.url || '/';
    const url = new URL(raw, 'http://127.0.0.1');
    if (url.pathname === '/api/recovery') return recovery(req, res);
    if (url.pathname === '/api/account') return account(req, res);
    if (url.pathname === '/api/taste') return taste(req, res);
    if (url.pathname === '/api/recommendations') {
      const result = await recommendResponse(url.searchParams.get('q') || '', url.searchParams.get('page') || '1');
      return reply(res, result.status, result.body, 'application/json; charset=utf-8', result.cache);
    }
    if (url.pathname === '/api/film') {
      const result = await filmResponse(url.searchParams.get('q') || '', {
        list: url.searchParams.get('list') === '1',
        upcoming: url.searchParams.get('upcoming') === '1',
        feed: url.searchParams.get('feed') === '1',
        overview: url.searchParams.get('overview') === '1',
        card: url.searchParams.get('card') === '1',
        lang: url.searchParams.get('lang') === 'de' ? 'de' : 'en',
      });
      return reply(res, result.status, result.body, 'application/json; charset=utf-8', result.cache);
    }
    if (url.pathname === '/api/posters') {
      if (!refreshing && TOKEN) refreshing = refresh().finally(() => { refreshing = null; });
      return reply(res, 200, JSON.stringify(payload()), 'application/json; charset=utf-8');
    }
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(ROOT, `.${requested}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return reply(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
    return reply(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch {
    return reply(res, 500, 'Not available', 'text/plain; charset=utf-8');
  }
}

export default handle;

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  http.createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch(() => {
      if (!res.headersSent) reply(res, 500, 'Not available', 'text/plain; charset=utf-8');
    });
  }).listen(PORT, '0.0.0.0');
}
