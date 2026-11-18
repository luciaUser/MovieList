import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../facets.js';
import '../similarity.config.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadFilms() {
  const source = readFileSync(join(root, 'films.js'), 'utf8');
  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  return JSON.parse(source.slice(start, end + 1));
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelBox(x, y, text, size) {
  const width = Math.max(size, String(text).length * size * 0.62);
  const height = size * 1.25;
  return { x: x - (width / 2) - 4, y: y - (height / 2) - 3, w: width + 8, h: height + 6 };
}

function hits(box, kept) {
  return kept.some((other) => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y);
}

function settle(x, y, text, size, kept, shifts) {
  for (let i = 0; i < shifts.length; i += 1) {
    const box = labelBox(x + shifts[i][0], y + shifts[i][1], text, size);
    if (!hits(box, kept)) {
      kept.push(box);
      return { x: x + shifts[i][0], y: y + shifts[i][1] };
    }
  }
  return null;
}

export function writePreview(graph, films, outPath) {
  const layout = globalThis.SimilarityConfig.layout;
  const colors = layout.genreColors || {};
  const aspect = layout.aspect || 1.6;
  const width = 1600;
  const height = 1000;
  const byId = new Map((films || []).map((film) => [film.id, film]));
  const sx = (x) => (x / aspect) * width;
  const sy = (y) => y * height;
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#0a0b0e"/>`,
  ];
  const kept = [];
  const genreShifts = [[0, 0], [0, -26], [0, 26], [28, 0], [-28, 0], [18, -18], [-18, 18]];
  const smallShifts = [[0, 0], [0, -14], [0, 14], [12, 0], [-12, 0], [10, -10], [-10, 10]];
  (graph.islands || []).slice().sort((a, b) => (b.ids?.length || 0) - (a.ids?.length || 0)).forEach((island) => {
    const spot = settle(sx(island.x), sy(island.y), island.genre, 28, kept, genreShifts);
    const at = spot || { x: sx(island.x), y: sy(island.y) };
    if (!spot) kept.push(labelBox(at.x, at.y, island.genre, 28));
    const color = colors[island.genre] || '#c8c8c8';
    parts.push(`<text x="${at.x.toFixed(1)}" y="${at.y.toFixed(1)}" fill="${color}" fill-opacity="0.55" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(island.genre)}</text>`);
  });
  kept.length = 0;
  (graph.nodes || []).forEach((node) => {
    const film = byId.get(node.id);
    const genre = film?.genres?.[0] || '';
    const color = colors[genre] || '#c8c8c8';
    parts.push(`<circle cx="${sx(node.x).toFixed(1)}" cy="${sy(node.y).toFixed(1)}" r="3" fill="${color}"/>`);
  });
  (graph.clusters || []).slice().sort((a, b) => b.count - a.count || String(a.subgenre).localeCompare(String(b.subgenre), 'de')).forEach((cluster) => {
    const spot = settle(sx(cluster.x), sy(cluster.y), cluster.subgenre, 12, kept, smallShifts);
    if (!spot) return;
    parts.push(`<text x="${spot.x.toFixed(1)}" y="${spot.y.toFixed(1)}" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="12" text-anchor="middle" dominant-baseline="middle">${escapeXml(cluster.subgenre)}</text>`);
  });
  (graph.nodes || []).forEach((node) => {
    const title = byId.get(node.id)?.title || node.id;
    const spot = settle(sx(node.x) + 8, sy(node.y) - 8, title, 9, kept, [[0, 0], [0, 12], [10, 0], [0, -12]]);
    if (!spot) return;
    parts.push(`<text x="${spot.x.toFixed(1)}" y="${spot.y.toFixed(1)}" fill="rgba(255,255,255,0.7)" font-family="sans-serif" font-size="9">${escapeXml(title)}</text>`);
  });
  parts.push('</svg>');
  writeFileSync(outPath, `${parts.join('\n')}\n`);
  return outPath;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const facets = JSON.parse(readFileSync(join(root, 'data', 'facets.json'), 'utf8'));
  const films = loadFilms().map((film) => globalThis.Facets.mergeFilm(film, facets[film.id]));
  const graph = JSON.parse(readFileSync(join(root, 'data', 'graph.json'), 'utf8'));
  const previewPath = join(root, 'data', 'graph-preview.svg');
  writePreview(graph, films, previewPath);
  console.log(previewPath);
}
