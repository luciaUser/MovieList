import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = process.argv[2];

if (!file) {
  console.error('Aufruf: node scripts/apply_export.mjs <export.json>');
  process.exit(1);
}

const archive = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
const filmsSource = readFileSync(path.join(root, 'films.js'), 'utf8');
const starterIds = new Set([...filmsSource.matchAll(/"id":\s*"(f\d+)"/g)].map((hit) => hit[1]));

const facetsPath = path.join(root, 'data', 'facets.json');
const facets = JSON.parse(readFileSync(facetsPath, 'utf8'));
const overrides = archive.facetOverrides && typeof archive.facetOverrides === 'object' && !Array.isArray(archive.facetOverrides)
  ? archive.facetOverrides
  : {};
let fixes = 0;
Object.entries(overrides).forEach(([id, row]) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return;
  facets[id] = row;
  fixes += 1;
});
writeFileSync(facetsPath, `${JSON.stringify(facets, null, 2)}\n`);

const addedPath = path.join(root, 'data', 'added-films.json');
let added = [];
try {
  const current = JSON.parse(readFileSync(addedPath, 'utf8'));
  if (Array.isArray(current)) added = current;
} catch {
  added = [];
}
const incoming = Array.isArray(archive.added) ? archive.added : [];
let films = 0;
incoming.forEach((film) => {
  if (!film || typeof film.id !== 'string' || !film.id || typeof film.title !== 'string' || !film.title) return;
  if (starterIds.has(film.id)) return;
  const index = added.findIndex((item) => item && item.id === film.id);
  if (index >= 0) added[index] = film;
  else added.push(film);
  films += 1;
});
writeFileSync(addedPath, `${JSON.stringify(added, null, 2)}\n`);

console.log(`${fixes} Korrekturen in data/facets.json, ${films} Filme in data/added-films.json.`);
console.log('Als Nächstes: npm run graph');
