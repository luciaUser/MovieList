import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../facets.js';
import '../similarity.config.js';
import '../similarity.js';
import '../layout.js';
import { writePreview } from './preview_graph.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const facetPath = join(root, 'data', 'facets.json');
const graphPath = join(root, 'data', 'graph.json');

function loadFilms() {
  const source = readFileSync(join(root, 'films.js'), 'utf8');
  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  return JSON.parse(source.slice(start, end + 1));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function roundPoint(point) {
  const next = { ...point };
  if (typeof next.x === 'number') next.x = round(next.x);
  if (typeof next.y === 'number') next.y = round(next.y);
  if (typeof next.sim === 'number') next.sim = round(next.sim);
  return next;
}

function roundIsland(island) {
  return {
    genre: island.genre,
    x: round(island.x),
    y: round(island.y),
    ids: island.ids,
    hull: (island.hull || []).map((point) => ({ x: round(point.x), y: round(point.y) })),
  };
}

function silhouette(films, nodes) {
  const pos = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map();
  films.forEach((film) => {
    const genre = film.genres?.[0];
    const node = pos.get(film.id);
    if (!genre || !node) return;
    if (!groups.has(genre)) groups.set(genre, []);
    groups.get(genre).push(node);
  });
  const genres = [...groups.keys()];
  let total = 0;
  let count = 0;
  genres.forEach((genre) => {
    const own = groups.get(genre);
    if (own.length < 2) return;
    own.forEach((point) => {
      let near = 0;
      own.forEach((other) => {
        if (other === point) return;
        near += Math.hypot(point.x - other.x, point.y - other.y);
      });
      near /= own.length - 1;
      let far = Infinity;
      genres.forEach((otherGenre) => {
        if (otherGenre === genre) return;
        const them = groups.get(otherGenre);
        if (!them.length) return;
        const mean = them.reduce((sum, other) => sum + Math.hypot(point.x - other.x, point.y - other.y), 0) / them.length;
        if (mean < far) far = mean;
      });
      total += (far - near) / Math.max(near, far, 1e-9);
      count += 1;
    });
  });
  return count ? total / count : 0;
}

function bridgesOf(films, nodes) {
  const pos = new Map(nodes.map((node) => [node.id, node]));
  const genreOf = new Map(films.map((film) => [film.id, film.genres?.[0] || '']));
  const titleOf = new Map(films.map((film) => [film.id, film.title]));
  const rows = [];
  films.forEach((film) => {
    const point = pos.get(film.id);
    const genre = genreOf.get(film.id);
    if (!point || !genre) return;
    let best = null;
    let bestDist = Infinity;
    films.forEach((other) => {
      if (other.id === film.id) return;
      const there = pos.get(other.id);
      if (!there) return;
      const dist = Math.hypot(point.x - there.x, point.y - there.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = other;
      }
    });
    if (!best || genreOf.get(best.id) === genre) return;
    rows.push({
      title: film.title,
      genre,
      neighbor: titleOf.get(best.id),
      neighborGenre: genreOf.get(best.id),
      distance: bestDist,
    });
  });
  rows.sort((a, b) => a.distance - b.distance || a.title.localeCompare(b.title, 'de'));
  return rows;
}

function report(films, graph, score) {
  console.log(`\nSilhouette ${score.toFixed(3)}`);
  console.log(`Inseln ${graph.islands.length}`);
  graph.islands.forEach((island) => {
    const clusters = graph.clusters.filter((cluster) => cluster.genre === island.genre).length;
    console.log(`  ${island.genre.padEnd(14, ' ')} ${String(island.ids.length).padStart(3, ' ')} Filme   ${clusters} Cluster`);
  });
  const bridges = bridgesOf(films, graph.nodes);
  console.log(`\nBrückenfilme ${bridges.length}`);
  bridges.forEach((item) => {
    console.log(`  ${item.distance.toFixed(3)}  ${item.title} (${item.genre}) → ${item.neighbor} (${item.neighborGenre})`);
  });
}

const facetBytes = readFileSync(facetPath);
const facets = JSON.parse(facetBytes.toString('utf8'));
const films = loadFilms().map((film) => globalThis.Facets.mergeFilm(film, facets[film.id]));
const graph = await globalThis.Layout.layoutAll(films, {
  chunk: 50,
  onProgress({ tick, ticks }) {
    if (tick % 250 === 0 || tick === ticks) console.log(`Ticks ${tick} / ${ticks}`);
  },
});
const score = silhouette(films, graph.nodes);

const configHash = createHash('sha256')
  .update(JSON.stringify(globalThis.SimilarityConfig.weights))
  .update(JSON.stringify(globalThis.SimilarityConfig.layout))
  .update(facetBytes)
  .digest('hex');

const payload = {
  configHash,
  nodes: graph.nodes.map(roundPoint).sort((a, b) => a.id.localeCompare(b.id)),
  islands: graph.islands.map(roundIsland),
  clusters: graph.clusters.map(roundPoint),
  edges: graph.edges.map(roundPoint),
};

mkdirSync(dirname(graphPath), { recursive: true });
writeFileSync(graphPath, `${JSON.stringify(payload, null, 2)}\n`);
writePreview(payload, films, join(root, 'data', 'graph-preview.svg'));
report(films, graph, score);
console.log(graphPath);
