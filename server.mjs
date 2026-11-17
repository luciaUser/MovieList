import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(ROOT, "data", "posters.json");
const PORT = Number(process.env.PORT || 8741);
const TOKEN = process.env.TMDB_ACCESS_TOKEN || "";

let posters = loadCache();
let refreshing = null;
let filmList = null;

function loadFilms() {
  if (filmList) return filmList;
  try {
    const source = fs.readFileSync(path.join(ROOT, "films.js"), "utf8");
    const start = source.indexOf("[");
    const end = source.lastIndexOf("]");
    filmList = JSON.parse(source.slice(start, end + 1));
  } catch {
    filmList = [];
  }
  return filmList;
}

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
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
  const year = film.yearNum == null ? "" : String(film.yearNum);
  for (const query of queries) {
    const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&language=de-DE`;
    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json",
      },
    });
    if (res.status === 429) {
      await sleep(1200);
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          accept: "application/json",
        },
      });
    }
    if (!res.ok) continue;
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    const match = results.find((item) => (
      year && String(item.release_date || item.first_air_date || "").startsWith(year) && item.poster_path
    )) || results.find((item) => item.poster_path);
    if (match?.poster_path) return `https://image.tmdb.org/t/p/w500${match.poster_path}`;
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
    if (typeof posters[film.id] === "string") known[film.id] = posters[film.id];
  });
  return { posters: known, done, configured: Boolean(TOKEN) };
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function reply(res, status, body, type) {
  if (res && typeof res.writeHead === "function") {
    if (!res.headersSent) send(res, status, body, type);
    return undefined;
  }
  return new Response(body, {
    status,
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
    },
  });
}

function handle(req, res) {
  try {
    const raw = typeof req === "string" ? req : req?.url || "/";
    const url = new URL(raw, "http://127.0.0.1");
    if (url.pathname === "/api/posters") {
      if (!refreshing && TOKEN) refreshing = refresh().finally(() => { refreshing = null; });
      return reply(res, 200, JSON.stringify(payload()), "application/json; charset=utf-8");
    }
    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const file = path.resolve(ROOT, `.${requested}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return reply(res, 404, "Not found", "text/plain; charset=utf-8");
    }
    return reply(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch {
    return reply(res, 500, "Not available", "text/plain; charset=utf-8");
  }
}

export default handle;

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  http.createServer(handle).listen(PORT, "0.0.0.0");
}
