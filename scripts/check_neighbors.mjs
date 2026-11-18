import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../facets.js';
import '../similarity.config.js';
import '../similarity.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULTS = [
  'Inception',
  'Heat',
  'Parasite',
  'Der Herr der Ringe',
  'Oldboy',
  'Knives Out',
  'Mad Max: Fury Road',
  'The Others',
  'Spotlight',
  'Birdman',
];

function readJson(file) {
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
}

function loadFilms() {
  const source = readFileSync(join(root, 'films.js'), 'utf8');
  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  return JSON.parse(source.slice(start, end + 1));
}

function findFilm(films, query) {
  const needle = query.trim().toLowerCase();
  return films.find((film) => film.title.toLowerCase() === needle)
    || films.find((film) => String(film.original || '').toLowerCase() === needle)
    || films.find((film) => film.title.toLowerCase().includes(needle))
    || null;
}

function line(item) {
  const reasons = item.reasons.map((reason) => reason.label).join(', ') || '–';
  return `    ${item.score.toFixed(2)}  ${item.film.title} — ${reasons}`;
}

const facets = readJson('data/facets.json');
const films = loadFilms().map((film) => globalThis.Facets.mergeFilm(film, facets[film.id]));
globalThis.Similarity.prepare(films);

const queries = process.argv.slice(2);
const titles = queries.length ? queries : DEFAULTS;

titles.forEach((title) => {
  const film = findFilm(films, title);
  console.log(title);
  if (!film) {
    console.log('  nicht gefunden');
    console.log('');
    return;
  }
  ['layout', 'links'].forEach((mode) => {
    console.log(`  ${mode}`);
    globalThis.Similarity.neighbors(film, films, mode, 5).forEach((item) => {
      console.log(line(item));
    });
  });
  console.log('');
});
