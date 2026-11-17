const CLUSTERS = {
  action: 'Action',
  adventure: 'Abenteuer',
  abenteuer: 'Abenteuer',
  animation: 'Animation',
  anime: 'Anime',
  biography: 'Biografie',
  biografie: 'Biografie',
  comedy: 'Komödie',
  komödie: 'Komödie',
  crime: 'Krimi',
  krimi: 'Krimi',
  documentary: 'Dokumentation',
  dokumentation: 'Dokumentation',
  drama: 'Drama',
  fantasy: 'Fantasy',
  history: 'Historie',
  historie: 'Historie',
  horror: 'Horror',
  mystery: 'Mystery',
  romance: 'Romantik',
  romantik: 'Romantik',
  'sci-fi': 'Sci-Fi',
  'science fiction': 'Sci-Fi',
  'science-fiction': 'Sci-Fi',
  thriller: 'Thriller',
  war: 'Kriegsfilm',
  kriegsfilm: 'Kriegsfilm',
};

function clustersFor(genres) {
  const names = [];
  for (const genre of genres) {
    const name = CLUSTERS[String(genre || '').trim().toLowerCase()];
    if (name && !names.includes(name)) names.push(name);
  }
  return names.length ? names : ['Andere'];
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}

async function searchImdb(query) {
  const data = await getJson(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`);
  const hits = (data?.d || []).filter((item) => item?.id && /^tt\d+$/.test(item.id) && item.l);
  const hit = hits.find((item) => item.qid === 'movie' || item.qid === 'tvSeries' || item.qid === 'tvMiniSeries')
    || hits.find((item) => item.q === 'feature')
    || hits[0];
  if (!hit) return null;
  return {
    id: hit.id,
    title: hit.l,
    year: hit.y ? String(hit.y) : '',
    series: /series/i.test(hit.q || ''),
    poster: hit.i?.imageUrl || null,
  };
}

async function searchCinemeta(query) {
  const data = await getJson(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`);
  const hit = (data?.metas || []).find((item) => item?.name && (item.imdb_id || item.id));
  if (!hit) return null;
  const id = String(hit.imdb_id || hit.id);
  if (!/^tt\d+$/.test(id)) return null;
  return {
    id,
    title: hit.name,
    year: hit.year ? String(hit.year) : '',
    series: hit.type === 'series',
    poster: hit.poster || null,
  };
}

async function readMeta(id, type) {
  const data = await getJson(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`);
  return data?.meta || null;
}

function ratingOf(value) {
  const number = Number(String(value || '').replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0 || number > 10) return null;
  return Math.round(number * 10) / 10;
}

export async function lookupFilm(raw) {
  const query = String(raw || '').trim();
  if (!query) return null;
  const linked = query.match(/tt\d{5,}/i);
  const found = linked ? null : (await searchImdb(query).catch(() => null)) || (await searchCinemeta(query).catch(() => null));
  if (!linked && !found) return null;
  const id = (linked ? linked[0] : found.id).toLowerCase();
  const series = Boolean(found?.series);
  const meta = await readMeta(id, series ? 'series' : 'movie').catch(() => null)
    || await readMeta(id, series ? 'movie' : 'series').catch(() => null);
  const title = meta?.name || found?.title;
  if (!title) return null;
  const genres = clustersFor(Array.isArray(meta?.genres) ? meta.genres : []);
  const cluster = genres[0];
  const year = String(meta?.year || found?.year || '');
  const yearNum = Number(year.slice(0, 4));
  const imdb = ratingOf(meta?.imdbRating);
  const directors = Array.isArray(meta?.director) ? meta.director.filter(Boolean) : [];
  const isSeries = series || meta?.type === 'series';
  return {
    id,
    title,
    original: null,
    meta: isSeries ? ['Serie'] : [],
    kind: isSeries ? 'serie' : 'film',
    year: year.slice(0, 9),
    yearNum: Number.isFinite(yearNum) ? yearNum : null,
    genres,
    cluster,
    tags: [],
    imdb,
    imdbLabel: imdb == null ? 'k. A.' : imdb.toFixed(1).replace('.', ','),
    director: directors.length ? directors.join(' & ') : null,
    franchise: null,
    poster: found?.poster || meta?.poster || null,
  };
}
