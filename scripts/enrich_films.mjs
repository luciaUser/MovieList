import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../facets.js';
import { canonicalGenres, enrichFilm } from '../enrich.mjs';
import { search } from '../tmdb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACET_PATH = path.join(ROOT, 'data', 'facets.json');
const REPORT_PATH = path.join(ROOT, 'data', 'keyword-report.md');
const VOCAB_PATH = path.join(ROOT, 'data', 'vocabulary.json');
const OVERRIDE_PATH = path.join(ROOT, 'data', 'tmdb-overrides.json');

function readFilms() {
  const source = readFileSync(path.join(ROOT, 'films.js'), 'utf8');
  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  const films = JSON.parse(source.slice(start, end + 1));
  if (!Array.isArray(films)) throw new Error('films.js');
  return films;
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeFacets(facets) {
  mkdirSync(path.dirname(FACET_PATH), { recursive: true });
  const ordered = Object.fromEntries(Object.keys(facets).sort().map((id) => [id, facets[id]]));
  writeFileSync(FACET_PATH, `${JSON.stringify(ordered, null, 2)}\n`);
}

function onlySet() {
  const inline = process.argv.find((arg) => arg.startsWith('--only='));
  const flag = process.argv.indexOf('--only');
  const raw = inline
    ? inline.slice('--only='.length)
    : (flag >= 0 ? process.argv[flag + 1] : '');
  if (!raw || raw.startsWith('--')) return null;
  return new Set(raw.split(',').map((id) => id.trim()).filter(Boolean));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findOnTmdb(film) {
  const prefer = film.kind === 'serie' ? 'tv' : 'movie';
  const queries = [];
  if (film.original) queries.push(film.original);
  if (film.title && film.title !== film.original) queries.push(film.title);
  let fallback = null;
  for (const query of queries) {
    const hit = await search(query, film.yearNum, { prefer });
    if (!hit) continue;
    if (hit.yearMatch || !film.yearNum) return hit;
    if (!fallback) fallback = hit;
  }
  return fallback;
}

function countBy(facets, field) {
  const counts = new Map();
  for (const entry of Object.values(facets)) {
    for (const value of entry[field] || []) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
}

function missing(facets, field) {
  return Object.entries(facets)
    .filter(([, entry]) => !entry[field] || (Array.isArray(entry[field]) && !entry[field].length))
    .map(([id]) => id);
}

function writeReport(facets) {
  const counts = new Map();
  for (const [id, entry] of Object.entries(facets)) {
    for (const word of entry.unmappedKeywords || []) {
      if (!counts.has(word)) counts.set(word, new Set());
      counts.get(word).add(id);
    }
  }
  const rows = [...counts.entries()]
    .map(([word, ids]) => ({ word, count: ids.size }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'en'));
  const many = rows.filter((row) => row.count >= 2);
  const one = rows.filter((row) => row.count < 2);
  const lines = ['# Nicht abgebildete Keywords', ''];
  const section = (title, list) => {
    lines.push(`## ${title}`, '');
    if (!list.length) lines.push('Keine.', '');
    for (const row of list) lines.push(`- ${row.count} · ${row.word}`);
    lines.push('');
  };
  section('Mindestens 2 Filme', many);
  section('Ein Film', one);
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function printSummary(facets, uncertain, missingHits) {
  console.log('\nGenre');
  for (const [name, count] of countBy(facets, 'genres')) console.log(`  ${count}  ${name}`);
  console.log('\nSubgenre');
  const subgenres = countBy(facets, 'subgenres');
  for (const [name, count] of subgenres) console.log(`  ${count}  ${name}`);
  console.log('\nSubgenres mit nur einem Film');
  const singles = subgenres.filter(([, count]) => count === 1);
  if (!singles.length) console.log('  keine');
  for (const [name] of singles) console.log(`  ${name}`);
  console.log(`\nOhne Themen: ${missing(facets, 'themes').join(', ') || 'keine'}`);
  console.log(`Ohne Ton: ${missing(facets, 'tone').join(', ') || 'keine'}`);
  console.log(`Ohne Erzählstruktur: ${missing(facets, 'narrative').join(', ') || 'keine'}`);
  console.log('\nUnsichere Treffer');
  if (!uncertain.length) console.log('  keine');
  for (const line of uncertain) console.log(`  ${line}`);
  console.log('\nNicht gefunden');
  if (!missingHits.length) console.log('  keine');
  for (const line of missingHits) console.log(`  ${line}`);
  const total = Object.keys(facets).length;
  const filled = (field) => Object.values(facets).filter((entry) => {
    const value = entry[field];
    if (Array.isArray(value)) return value.length > 0;
    return value != null && value !== '';
  }).length;
  console.log(`\nTon: ${filled('tone')} von ${total}`);
  console.log(`Erzählweise: ${filled('narrative')} von ${total}`);
  console.log(`Epoche: ${filled('epoch')} von ${total}`);
  console.log(`Ort: ${filled('place')} von ${total}`);
}

async function main() {
  if (!process.env.TMDB_ACCESS_TOKEN) {
    console.error('TMDB_ACCESS_TOKEN fehlt.');
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  const only = onlySet();
  const vocab = await globalThis.Facets.loadVocabulary(JSON.parse(readFileSync(VOCAB_PATH, 'utf8')));
  const films = readFilms();
  const facets = readJson(FACET_PATH, {});
  const overrides = readJson(OVERRIDE_PATH, {});
  const uncertain = [];
  const missingHits = [];

  for (const film of films) {
    if (only && !only.has(film.id)) continue;
    const existing = facets[film.id];
    if (existing?.reviewed === true && !force) {
      console.log(`${film.id} geprüft, übersprungen`);
      continue;
    }
    if (existing && !force) {
      console.log(`${film.id} vorhanden, übersprungen`);
      continue;
    }
    try {
      let tmdbId = existing?.tmdbId || null;
      let tmdbType = existing?.tmdbType || null;
      let imdbId = existing?.imdbId || null;
      const override = overrides[film.id];
      if (override) {
        const forcedId = Number(override.tmdbId);
        if (!(forcedId > 0)) {
          console.log(`${film.id} Override ohne tmdbId, übersprungen`);
          await wait(250);
          continue;
        }
        tmdbId = forcedId;
        tmdbType = override.tmdbType === 'tv' ? 'tv' : 'movie';
      }
      if (!tmdbId) {
        const hit = await findOnTmdb(film);
        if (!hit) {
          missingHits.push(`${film.id} ${film.title}`);
          console.log(`${film.id} nicht gefunden`);
          await wait(250);
          continue;
        }
        tmdbId = hit.id;
        tmdbType = hit.mediaType;
        if (film.yearNum && !hit.yearMatch) {
          uncertain.push(`${film.id} ${film.title}: Liste ${film.yearNum}, TMDB ${hit.year || '?'} (${hit.title})`);
        }
      }
      const result = await enrichFilm({
        tmdbId,
        tmdbType,
        imdbId,
        title: film.original || film.title,
        year: film.yearNum,
        tags: film.tags || [],
        genres: film.genres || [],
      }, vocab);
      const record = result.facets;
      if (!record.genres?.length) {
        const fallback = canonicalGenres(film.genres, vocab).genres;
        if (fallback.length) record.genres = fallback;
      }
      if (film.director) record.director = film.director;
      if (film.franchise) record.franchise = film.franchise;
      record.unmappedKeywords = result.unmappedKeywords;
      facets[film.id] = record;
      writeFacets(facets);
      console.log(`${film.id} ${film.title}`);
    } catch (error) {
      console.log(`${film.id} Fehler: ${error?.message || 'unbekannt'}`);
    }
    await wait(250);
  }

  writeReport(facets);
  printSummary(facets, uncertain, missingHits);
}

main();
