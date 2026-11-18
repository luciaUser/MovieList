import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, findByImdb, details } from './tmdb.mjs';
import { enrichFilm } from './enrich.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let vocab;

function vocabulary() {
  if (!vocab) vocab = JSON.parse(readFileSync(path.join(ROOT, 'data', 'vocabulary.json'), 'utf8'));
  return vocab;
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function configured() {
  return Boolean(process.env.TMDB_ACCESS_TOKEN);
}

function parseQuery(raw) {
  const query = String(raw || '').trim();
  if (!query) return null;
  const tmdb = query.match(/themoviedb\.org\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(movie|tv)\/(\d+)/i);
  if (tmdb) {
    return {
      kind: 'tmdb',
      type: tmdb[1].toLowerCase() === 'tv' ? 'tv' : 'movie',
      id: Number(tmdb[2]),
    };
  }
  const imdb = query.match(/tt\d{5,}/i);
  if (imdb) return { kind: 'imdb', id: imdb[0].toLowerCase() };
  return { kind: 'text', text: query };
}

function hitFromPayload(payload, type) {
  if (!payload?.id) return null;
  const date = payload.release_date || payload.first_air_date || '';
  return {
    id: payload.id,
    mediaType: type === 'tv' ? 'tv' : 'movie',
    title: payload.title || payload.name || '',
    originalTitle: payload.original_title || payload.original_name || '',
    year: String(date).slice(0, 4),
    posterPath: payload.poster_path || null,
  };
}

function filmRecord(hit, facets) {
  const year = String(hit.year || '');
  const yearNum = Number(year.slice(0, 4));
  const rating = typeof facets.tmdbRating === 'number' ? facets.tmdbRating : null;
  const genres = Array.isArray(facets.genres) ? facets.genres.slice() : [];
  const format = facets.format;
  const series = format === 'serie' || format === 'miniserie' || hit.mediaType === 'tv';
  const meta = [];
  if (format === 'miniserie') meta.push('Miniserie');
  else if (series) meta.push('Serie');
  if (format === 'animation') meta.push('Animation');
  if (format === 'anime') meta.push('Anime');
  const original = hit.originalTitle && hit.originalTitle !== hit.title ? hit.originalTitle : null;
  return {
    id: `tmdb-${hit.mediaType === 'tv' ? 'tv' : 'movie'}-${hit.id}`,
    title: hit.title,
    original,
    meta,
    kind: series ? 'serie' : 'film',
    year: year.slice(0, 9),
    yearNum: Number.isFinite(yearNum) ? yearNum : null,
    genres,
    cluster: genres[0] || 'Andere',
    tags: [],
    imdb: rating,
    imdbLabel: rating == null ? 'k. A.' : rating.toFixed(1).replace('.', ','),
    director: facets.director || null,
    franchise: facets.franchise || null,
    poster: facets.poster || (hit.posterPath ? `https://image.tmdb.org/t/p/w500${hit.posterPath}` : null),
  };
}

export async function lookupFilm(raw) {
  const parsed = parseQuery(raw);
  if (!parsed) throw fail(400, 'Titel oder Link eintragen.');
  if (!configured()) throw fail(503, 'TMDB ist nicht eingerichtet');
  let hit = null;
  try {
    if (parsed.kind === 'imdb') hit = await findByImdb(parsed.id);
    else if (parsed.kind === 'tmdb') hit = hitFromPayload(await details(parsed.type, parsed.id), parsed.type);
    else hit = await search(parsed.text);
  } catch {
    throw fail(502, 'Der Abruf ist gerade nicht möglich.');
  }
  if (!hit?.id || !hit.title) throw fail(404, 'Dazu finde ich keinen Film.');
  let enriched;
  try {
    enriched = await enrichFilm({
      tmdbId: hit.id,
      tmdbType: hit.mediaType === 'tv' ? 'tv' : 'movie',
      title: hit.title,
      year: hit.year,
      imdbId: parsed.kind === 'imdb' ? parsed.id : null,
    }, vocabulary());
  } catch {
    throw fail(502, 'Der Abruf ist gerade nicht möglich.');
  }
  const facets = enriched?.facets || {};
  if (!facets.tmdbId) throw fail(404, 'Dazu finde ich keinen Film.');
  return { film: filmRecord(hit, facets), facets };
}

export async function filmResponse(raw) {
  try {
    const result = await lookupFilm(raw);
    return {
      status: 200,
      body: JSON.stringify(result),
      cache: 's-maxage=86400',
    };
  } catch (error) {
    const status = Number(error?.status) || 502;
    const message = error?.message || 'Der Abruf ist gerade nicht möglich.';
    return {
      status,
      body: JSON.stringify({ error: message }),
      cache: 'no-store',
    };
  }
}
