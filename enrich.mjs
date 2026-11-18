import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { details, findByImdb } from './tmdb.mjs';
import './facets.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIRECTOR_TAGS = new Set([
  'nolan', 'scorsese', 'tarantino', 'guyritchie', 'spielberg', 'kubrick',
  'villeneuve', 'shyamalan', 'wesanderson', 'lucbesson', 'garethevans', 'guillermodeltoro',
]);

let keywordIndex;

function normKey(value) {
  return String(value || '')
    .replace(/\s*\([^)]*\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

function compactKey(value) {
  return normKey(value).replace(/[\s-]+/g, '');
}

function keywordMap() {
  if (keywordIndex) return keywordIndex;
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'data', 'keyword-map.json'), 'utf8'));
  const exact = new Map();
  const compact = new Map();
  for (const [key, value] of Object.entries(raw)) {
    const normal = normKey(key);
    exact.set(normal, value);
    const compactName = compactKey(key);
    if (!compact.has(compactName)) compact.set(compactName, value);
  }
  keywordIndex = { exact, compact };
  return keywordIndex;
}

function lookupKeyword(value) {
  const map = keywordMap();
  const normal = normKey(value);
  return map.exact.get(normal) || map.compact.get(compactKey(value)) || null;
}

function aliasIndex(vocab) {
  const index = new Map();
  for (const [key, value] of Object.entries(vocab.genreAliases || {})) {
    index.set(normKey(key), value);
  }
  for (const genre of vocab.genres || []) {
    if (!index.has(normKey(genre))) index.set(normKey(genre), genre);
  }
  return index;
}

export function canonicalGenres(names, vocab) {
  const index = aliasIndex(vocab);
  const genres = [];
  let format = null;
  const unknown = [];
  for (const name of names || []) {
    const hit = index.get(normKey(name));
    if (!hit) {
      if (name) unknown.push(name);
      continue;
    }
    if (typeof hit === 'object' && hit.format) {
      format = hit.format;
      continue;
    }
    if (typeof hit === 'string' && !genres.includes(hit)) genres.push(hit);
  }
  return { genres: genres.slice(0, 3), format, unknown };
}

const IGNORED_KEYWORDS = new Set([
  'aftercreditsstinger',
  'duringcreditsstinger',
  'independent film',
  'remake',
  'sequel',
  'prequel',
  'spin off',
  'woman director',
  'compilation',
  'edited from tv series',
  'live action and animation',
  'marvel cinematic universe',
]);
const TV_SKIP = new Set(['soap', 'talk', 'reality', 'news']);
const SCIFI_HINTS = ['space', 'alien', 'future', 'robot', 'time travel', 'dystopia'];

function isIgnored(value) {
  const key = normKey(value);
  return key.startsWith('based on ') || IGNORED_KEYWORDS.has(key);
}

function hintsSciFi(names) {
  return (names || []).some((name) => {
    const key = normKey(name);
    return SCIFI_HINTS.some((hint) => key === hint || key.includes(hint));
  });
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

export function mapTmdbGenres(names, type, keywords, vocab) {
  const genres = [];
  let format = null;
  const unknown = [];
  const scifi = hintsSciFi(keywords);
  for (const name of names || []) {
    const key = normKey(name);
    if (TV_SKIP.has(key)) continue;
    if (type === 'tv' && key === 'sci-fi & fantasy') {
      pushUnique(genres, scifi ? 'Sci-Fi' : 'Fantasy');
      continue;
    }
    if (key === 'action & adventure') {
      pushUnique(genres, 'Action');
      pushUnique(genres, 'Abenteuer');
      continue;
    }
    const hit = canonicalGenres([name], vocab);
    if (hit.format) format = hit.format;
    hit.genres.forEach((genre) => pushUnique(genres, genre));
    unknown.push(...hit.unknown);
  }
  return { genres, format, unknown };
}

export function mergeGenreLists(userNames, tmdbNames, type, keywords, vocab) {
  const mine = canonicalGenres(userNames, vocab);
  const extra = mapTmdbGenres(tmdbNames, type, keywords, vocab);
  const genres = mine.genres.slice();
  for (const genre of extra.genres) {
    if (genres.length >= 3) break;
    pushUnique(genres, genre);
  }
  return {
    genres,
    format: mine.format || extra.format || null,
    unknown: extra.unknown,
  };
}

export function collectSignals({ keywords, tags, extra }) {
  const bucket = new Map();
  const subEvidence = new Map();
  let keywordIntensity = 0;
  let intensityDelta = 0;
  const unmapped = [];
  const seenUnmapped = new Set();

  function bump(field, value, amount) {
    if (!bucket.has(field)) bucket.set(field, new Map());
    const counts = bucket.get(field);
    counts.set(value, (counts.get(value) || 0) + amount);
  }

  function absorb(mapped, amount, fromTag) {
    if (!mapped) return;
    const strong = mapped.strong === true;
    for (const [field, value] of Object.entries(mapped)) {
      if (field === 'strong') continue;
      if (field === 'intensity') {
        keywordIntensity = Math.max(keywordIntensity, Number(value) || 0);
        continue;
      }
      if (field === 'intensityDelta') {
        intensityDelta += Number(value) || 0;
        continue;
      }
      const list = Array.isArray(value) ? value : [value];
      for (const item of list) {
        if (!item) continue;
        if (field === 'subgenres') {
          const row = subEvidence.get(item) || { score: 0, tag: false, strong: false, keywords: 0 };
          row.score += amount;
          if (fromTag) row.tag = true;
          else {
            row.keywords += 1;
            if (strong) row.strong = true;
          }
          subEvidence.set(item, row);
          continue;
        }
        bump(field, item, amount);
      }
    }
  }

  for (const name of keywords || []) {
    if (isIgnored(name)) continue;
    const mapped = lookupKeyword(name);
    if (!mapped) {
      const key = normKey(name);
      if (key && !seenUnmapped.has(key)) {
        seenUnmapped.add(key);
        unmapped.push(name);
      }
      continue;
    }
    absorb(mapped, 1, false);
  }
  for (const name of extra || []) {
    const mapped = lookupKeyword(name);
    if (mapped) absorb(mapped, 1, false);
  }
  for (const tag of tags || []) {
    if (DIRECTOR_TAGS.has(compactKey(tag))) continue;
    const mapped = lookupKeyword(tag);
    if (!mapped) continue;
    absorb(mapped, 2, true);
  }

  const subgenres = [...subEvidence.entries()]
    .filter(([, row]) => row.tag || row.strong || row.keywords >= 2)
    .sort((a, b) => b[1].score - a[1].score || String(a[0]).localeCompare(String(b[0]), 'de'))
    .slice(0, 2)
    .map(([name]) => name);

  return {
    subgenres,
    themes: ranked(bucket.get('themes'), 4),
    tone: ranked(bucket.get('tone'), 2),
    narrative: ranked(bucket.get('narrative'), 2),
    epoch: ranked(bucket.get('epoch'), 1)[0] || null,
    place: ranked(bucket.get('place'), 1)[0] || null,
    formats: ranked(bucket.get('format'), 1),
    keywordIntensity,
    intensityDelta,
    unmapped,
  };
}

function ranked(counts, limit) {
  if (!counts) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'de'))
    .slice(0, limit)
    .map(([name]) => name);
}

function parentOf(subgenre, vocab) {
  for (const [parent, list] of Object.entries(vocab.subgenres || {})) {
    if (list.includes(subgenre)) return parent;
  }
  return null;
}

function keywordNames(payload, type) {
  const block = payload?.keywords;
  const rows = type === 'tv'
    ? (block?.results || block?.keywords || [])
    : (block?.keywords || block?.results || []);
  return rows.map((item) => item?.name).filter(Boolean);
}

function people(list, limit) {
  return (list || [])
    .slice()
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((person) => person?.name)
    .filter(Boolean)
    .slice(0, limit);
}

function directorsOf(payload, type) {
  if (type === 'tv') {
    const created = (payload?.created_by || []).map((person) => person?.name).filter(Boolean);
    if (created.length) return created.join(' & ');
  }
  const crew = (payload?.credits?.crew || [])
    .filter((person) => person?.job === 'Director' && person.name)
    .map((person) => person.name);
  return crew.length ? crew.join(' & ') : null;
}

function certification(payload, type) {
  if (type === 'tv') {
    const rows = payload?.content_ratings?.results || [];
    const de = rows.find((row) => row.iso_3166_1 === 'DE' && row.rating);
    const us = rows.find((row) => row.iso_3166_1 === 'US' && row.rating);
    return de ? { region: 'DE', value: de.rating } : (us ? { region: 'US', value: us.rating } : null);
  }
  const rows = payload?.release_dates?.results || [];
  const read = (region) => {
    const block = rows.find((row) => row.iso_3166_1 === region);
    const dates = block?.release_dates || [];
    const theatrical = dates.find((row) => row.type === 3 && row.certification);
    const any = dates.find((row) => row.certification);
    return (theatrical || any)?.certification || '';
  };
  const de = read('DE');
  if (de) return { region: 'DE', value: de };
  const us = read('US');
  return us ? { region: 'US', value: us } : null;
}

function intensityFromCert(cert) {
  if (!cert) return null;
  if (cert.region === 'DE') {
    const number = Number(String(cert.value).match(/\d+/)?.[0]);
    if (number === 0 || number === 6) return 1;
    if (number === 12) return 2;
    if (number === 16) return 3;
    if (number === 18) return 4;
    return null;
  }
  const text = String(cert.value).toUpperCase();
  if (['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'].includes(text)) return 1;
  if (['PG-13', 'TV-14'].includes(text)) return 2;
  if (text === 'R') return 3;
  if (['NC-17', 'TV-MA'].includes(text)) return 4;
  return null;
}

function wikidataEnabled() {
  const value = process.env.ENRICH_WIKIDATA;
  if (value == null || value === '') return true;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

async function wikidataLabels(imdbId) {
  if (!wikidataEnabled() || !imdbId) return [];
  const query = `
    SELECT ?placeLabel ?epochLabel ?themeLabel WHERE {
      ?item wdt:P345 ${JSON.stringify(imdbId)} .
      OPTIONAL { ?item wdt:P840 ?place. }
      OPTIONAL { ?item wdt:P2408 ?epoch. }
      OPTIONAL { ?item wdt:P921 ?theme. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`;
  try {
    const response = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'MovieByLucia/1.0 (personal non-commercial catalog)',
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const labels = [];
    const seen = new Set();
    for (const row of data?.results?.bindings || []) {
      for (const key of ['placeLabel', 'epochLabel', 'themeLabel']) {
        const label = row[key]?.value;
        if (!label || seen.has(label)) continue;
        seen.add(label);
        labels.push(label);
      }
    }
    return labels;
  } catch {
    return [];
  }
}

async function fillWithOllama(draft, vocab, hint) {
  if (process.env.ENRICH_PROVIDER !== 'ollama') return;
  const model = process.env.OLLAMA_MODEL;
  if (!model) return;
  const needsTone = !draft.tone?.length;
  const needsNarrative = !draft.narrative?.length;
  if (!needsTone && !needsNarrative) return;
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        format: 'json',
        stream: false,
        messages: [{
          role: 'user',
          content: [
            'Fill only empty film facets. Reply with JSON {"tone":[],"narrative":[]}.',
            `tone must be chosen from: ${vocab.tone.join(', ')}`,
            `narrative must be chosen from: ${vocab.narrative.join(', ')}`,
            `Use at most 2 tone values and 2 narrative values.`,
            `Film: ${hint.title || ''} (${hint.year || ''})`,
            `Genres: ${(draft.genres || []).join(', ')}`,
            `Themes: ${(draft.themes || []).join(', ')}`,
          ].join('\n'),
        }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return;
    const payload = await response.json();
    const parsed = JSON.parse(payload?.message?.content || '{}');
    if (needsTone && Array.isArray(parsed.tone)) draft.tone = parsed.tone.filter((value) => vocab.tone.includes(value)).slice(0, 2);
    if (needsNarrative && Array.isArray(parsed.narrative)) {
      draft.narrative = parsed.narrative.filter((value) => vocab.narrative.includes(value)).slice(0, 2);
    }
  } catch {
    /* Ollama stays optional */
  }
}

export async function enrichFilm(input, vocab) {
  const hint = input || {};
  let tmdbId = hint.tmdbId || null;
  let tmdbType = hint.tmdbType === 'tv' ? 'tv' : (hint.tmdbType === 'movie' ? 'movie' : null);
  let imdbId = typeof hint.imdbId === 'string' ? hint.imdbId.toLowerCase() : null;
  if (!tmdbId && imdbId) {
    const found = await findByImdb(imdbId);
    if (found) {
      tmdbId = found.id;
      tmdbType = found.mediaType;
    }
  }
  const payload = tmdbId ? await details(tmdbType || 'movie', tmdbId) : null;
  if (payload?.id) {
    tmdbId = payload.id;
    if (!tmdbType) tmdbType = hint.tmdbType === 'tv' ? 'tv' : 'movie';
    imdbId = payload.external_ids?.imdb_id || imdbId;
  }
  const type = tmdbType === 'tv' ? 'tv' : 'movie';
  const names = keywordNames(payload, type);
  const signals = collectSignals({
    keywords: names,
    tags: hint.tags || [],
    extra: await wikidataLabels(imdbId),
  });
  const merged = mergeGenreLists(
    hint.genres,
    (payload?.genres || []).map((genre) => genre.name),
    type,
    names,
    vocab,
  );
  const genres = merged.genres.slice();
  if (!genres.length && signals.subgenres.length) {
    const parent = parentOf(signals.subgenres[0], vocab);
    if (parent) genres.push(parent);
  }
  let format = merged.format || signals.formats[0] || (type === 'tv' ? 'serie' : 'film');
  const tagKeys = new Set((hint.tags || []).map((tag) => compactKey(tag)));
  if (tagKeys.has('miniserie')) format = 'miniserie';
  if (tagKeys.has('anime') || merged.format === 'anime') format = 'anime';

  const origin = [];
  for (const country of payload?.production_countries || []) {
    if (country?.iso_3166_1 && !origin.includes(country.iso_3166_1)) origin.push(country.iso_3166_1);
  }
  for (const code of payload?.origin_country || []) {
    if (typeof code === 'string' && !origin.includes(code)) origin.push(code);
  }

  const certIntensity = intensityFromCert(certification(payload, type));
  let intensity = certIntensity;
  if (typeof intensity === 'number' && signals.intensityDelta) {
    intensity = Math.min(5, intensity + signals.intensityDelta);
  }
  if (signals.keywordIntensity >= 5) intensity = 5;
  const votes = Number(payload?.vote_count);
  const rating = Number(payload?.vote_average);
  const draft = {
    imdbId,
    tmdbId,
    tmdbType: tmdbId ? type : null,
    genres: genres.concat(merged.unknown),
    subgenres: signals.subgenres,
    themes: signals.themes,
    tone: signals.tone,
    narrative: signals.narrative,
    intensity,
    epoch: signals.epoch,
    place: signals.place,
    origin: origin.slice(0, 4),
    cast: people(payload?.credits?.cast, 3),
    director: directorsOf(payload, type),
    franchise: null,
    format,
    tmdbRating: Number.isFinite(rating) && votes > 0 ? Math.round(rating * 10) / 10 : null,
    tmdbVotes: Number.isFinite(votes) ? Math.round(votes) : null,
    poster: payload?.poster_path ? `https://image.tmdb.org/t/p/w500${payload.poster_path}` : null,
    source: 'tmdb',
    reviewed: false,
  };
  await fillWithOllama(draft, vocab, hint);
  const cleaned = globalThis.Facets.validateFacets(draft, vocab);
  return {
    facets: cleaned.facets,
    unmappedKeywords: signals.unmapped,
    source: 'tmdb',
  };
}
