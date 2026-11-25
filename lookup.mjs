import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, searchHits, directorName, findByImdb, details, recommendBundle } from './tmdb.mjs';
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
  const titled = query.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  if (titled && titled[1].trim()) return { kind: 'text', text: titled[1].trim(), year: titled[2] };
  return { kind: 'text', text: query };
}

function dateOnly(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isUpcomingRelease(releaseDate, status) {
  const date = dateOnly(releaseDate);
  if (date && date > todayIso()) return true;
  if (!date) {
    const state = String(status || '');
    if (!state) return false;
    return state !== 'Released' && state !== 'Canceled';
  }
  return false;
}

function hitFromPayload(payload, type) {
  if (!payload?.id) return null;
  const date = dateOnly(payload.release_date || payload.first_air_date);
  return {
    id: payload.id,
    mediaType: type === 'tv' ? 'tv' : 'movie',
    title: payload.title || payload.name || '',
    originalTitle: payload.original_title || payload.original_name || '',
    year: date.slice(0, 4),
    posterPath: payload.poster_path || null,
    releaseDate: date,
  };
}

function filmRecord(hit, facets, extra) {
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
    release_date: extra && extra.release_date ? extra.release_date : null,
    status: extra && extra.status ? extra.status : null,
    overview: extra && extra.overview ? String(extra.overview).trim() : '',
  };
}

export async function lookupFilm(raw) {
  const parsed = parseQuery(raw);
  if (!parsed) throw fail(400, 'Titel oder Link eintragen.');
  if (!configured()) throw fail(503, 'TMDB ist nicht eingerichtet');
  let hit = null;
  let detailPayload = null;
  try {
    if (parsed.kind === 'imdb') hit = await findByImdb(parsed.id);
    else if (parsed.kind === 'tmdb') {
      detailPayload = await details(parsed.type, parsed.id);
      hit = hitFromPayload(detailPayload, parsed.type);
    } else hit = await search(parsed.text, parsed.year);
    if (hit?.id && !detailPayload) {
      try {
        detailPayload = await details(hit.mediaType === 'tv' ? 'tv' : 'movie', hit.id);
      } catch {
        detailPayload = null;
      }
    }
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
  const releaseDate = dateOnly(detailPayload?.release_date || detailPayload?.first_air_date || hit.releaseDate);
  const status = detailPayload && detailPayload.status ? String(detailPayload.status) : '';
  const overview = String(detailPayload && detailPayload.overview || '').trim();
  return {
    film: filmRecord(hit, facets, {
      release_date: releaseDate || null,
      status: status || null,
      overview: overview || null,
    }),
    facets,
  };
}

async function filmOverview(raw) {
  if (!configured()) return '';
  const parsed = parseQuery(raw);
  if (!parsed || parsed.kind === 'text') return '';
  try {
    let type = 'movie';
    let id = null;
    if (parsed.kind === 'tmdb') {
      type = parsed.type;
      id = parsed.id;
    } else {
      const hit = await findByImdb(parsed.id);
      if (!hit || !hit.id) return '';
      type = hit.mediaType === 'tv' ? 'tv' : 'movie';
      id = hit.id;
    }
    const payload = await details(type, id);
    return String(payload && payload.overview || '').trim();
  } catch {
    return '';
  }
}

function lightFilm(hit, director, fact) {
  const kind = hit.mediaType === 'tv' ? 'tv' : 'movie';
  const poster = hit.posterPath ? `https://image.tmdb.org/t/p/w342${hit.posterPath}` : null;
  const extra = fact && typeof fact === 'object' ? fact : null;
  return {
    film: {
      id: `tmdb:${kind}:${hit.id}`,
      tmdbId: hit.id,
      tmdbType: kind,
      title: hit.title,
      original: hit.originalTitle && hit.originalTitle !== hit.title ? hit.originalTitle : null,
      year: hit.year || '',
      poster,
      director: director || '',
      genres: [],
      kind: kind === 'tv' ? 'serie' : 'film',
      imdb: null,
      imdbLabel: '',
      release_date: (extra && extra.release_date) || dateOnly(hit.releaseDate) || null,
      status: (extra && extra.status) || null,
    },
    facets: {
      tmdbId: hit.id,
      tmdbType: kind,
      poster,
      director: director || null,
    },
  };
}

async function upcomingFacts(hits) {
  const facts = new Map();
  const today = todayIso();
  const open = hits.filter((hit) => {
    if (!hit) return false;
    const known = dateOnly(hit.releaseDate);
    return !known || known > today;
  }).slice(0, 10);
  // Details parallel statt nacheinander abrufen, damit die Suche schnell bleibt.
  const rows = await Promise.all(open.map(async (hit) => {
    const known = dateOnly(hit.releaseDate);
    let payload = null;
    try {
      payload = await details(hit.mediaType, hit.id);
    } catch {
      payload = null;
    }
    const releaseDate = dateOnly(payload?.release_date || payload?.first_air_date) || known;
    const status = payload && payload.status ? String(payload.status) : '';
    return { hit, releaseDate, status };
  }));
  rows.forEach(({ hit, releaseDate, status }) => {
    const key = `${hit.mediaType}:${hit.id}`;
    if (isUpcomingRelease(releaseDate, status)) {
      facts.set(key, { release_date: releaseDate || null, status: status || null });
    } else {
      facts.set(key, false);
    }
  });
  return facts;
}

function listRow(one, upcomingOnly) {
  const film = one && one.film;
  const upcoming = Boolean(film && isUpcomingRelease(film.release_date, film.status));
  if (upcomingOnly) return { films: upcoming && one ? [one] : [], hasUpcoming: upcoming };
  return { films: upcoming || !one ? [] : [one], hasUpcoming: upcoming };
}

export async function lookupFilms(raw, options) {
  const upcomingOnly = Boolean(options && options.upcoming);
  const parsed = parseQuery(raw);
  if (!parsed || !configured()) return { films: [], hasUpcoming: false };
  if (parsed.kind !== 'text') {
    try {
      return listRow(await lookupFilm(raw), upcomingOnly);
    } catch {
      return { films: [], hasUpcoming: false };
    }
  }
  let hits = [];
  try {
    hits = await searchHits(parsed.text, parsed.year, upcomingOnly ? 20 : 8);
  } catch {
    return { films: [], hasUpcoming: false };
  }
  const facts = await upcomingFacts(hits);
  let hasUpcoming = false;
  const kept = [];
  hits.forEach((hit) => {
    const fact = facts.get(`${hit.mediaType}:${hit.id}`);
    if (fact) {
      hasUpcoming = true;
      if (upcomingOnly) kept.push({ hit, fact });
      return;
    }
    if (!upcomingOnly) kept.push({ hit, fact: null });
  });
  const films = await Promise.all(kept.map(async ({ hit, fact }) => {
    let director = '';
    try {
      director = await directorName(hit.mediaType, hit.id);
    } catch {
      director = '';
    }
    return lightFilm(hit, director, fact);
  }));
  return {
    films: films.filter((row) => row.film && row.film.title),
    hasUpcoming,
  };
}

export async function recommendResponse(raw, page) {
  try {
    if (!configured()) {
      return {
        status: 503,
        body: JSON.stringify({ error: 'TMDB ist nicht eingerichtet', films: [], more: false, director: '' }),
        cache: 'no-store',
      };
    }
    const parsed = parseQuery(raw);
    if (!parsed) {
      return {
        status: 400,
        body: JSON.stringify({ films: [], more: false, director: '' }),
        cache: 'no-store',
      };
    }
    let type = 'movie';
    let id = null;
    if (parsed.kind === 'tmdb') {
      type = parsed.type;
      id = parsed.id;
    } else if (parsed.kind === 'imdb') {
      const hit = await findByImdb(parsed.id);
      if (!hit || !hit.id) {
        return {
          status: 200,
          body: JSON.stringify({ films: [], more: false, director: '' }),
          cache: 'no-store',
        };
      }
      type = hit.mediaType === 'tv' ? 'tv' : 'movie';
      id = hit.id;
    } else {
      const hit = await search(parsed.text, parsed.year, { prefer: 'movie' });
      if (!hit || !hit.id) {
        return {
          status: 200,
          body: JSON.stringify({ films: [], more: false, director: '' }),
          cache: 'no-store',
        };
      }
      type = hit.mediaType === 'tv' ? 'tv' : 'movie';
      id = hit.id;
    }
    const bundle = await recommendBundle(type, id, page);
    return {
      status: 200,
      body: JSON.stringify(bundle),
      cache: bundle.films.length ? 's-maxage=86400' : 'no-store',
    };
  } catch {
    return {
      status: 502,
      body: JSON.stringify({ error: 'Der Abruf ist gerade nicht möglich.', films: [], more: false, director: '' }),
      cache: 'no-store',
    };
  }
}

export async function filmResponse(raw, options) {
  try {
    if (options && options.overview) {
      const overview = await filmOverview(raw);
      return {
        status: 200,
        body: JSON.stringify({ overview }),
        cache: overview ? 's-maxage=86400' : 'no-store',
      };
    }
    if (options && options.list) {
      const found = await lookupFilms(raw, { upcoming: Boolean(options && options.upcoming) });
      const body = options && options.upcoming
        ? { films: found.films }
        : { films: found.films, hasUpcoming: Boolean(found.hasUpcoming) };
      return {
        status: 200,
        body: JSON.stringify(body),
        cache: found.films.length ? 's-maxage=3600' : 'no-store',
      };
    }
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
