const BASE = 'https://api.themoviedb.org/3';

function token() {
  return process.env.TMDB_ACCESS_TOKEN || '';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(path) {
  if (!token()) return null;
  const run = () => fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token()}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  let response = await run();
  if (response.status === 429) {
    await wait(1200);
    response = await run();
  }
  if (!response.ok) return null;
  return response.json();
}

function yearOf(item) {
  return String(item?.release_date || item?.first_air_date || '').slice(0, 4);
}

function releaseOf(item) {
  const text = String(item?.release_date || item?.first_air_date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function shape(item, yearMatch) {
  if (!item) return null;
  return {
    id: item.id,
    mediaType: item.media_type === 'tv' || item.first_air_date ? 'tv' : 'movie',
    title: item.title || item.name || '',
    originalTitle: item.original_title || item.original_name || '',
    year: yearOf(item),
    posterPath: item.poster_path || null,
    yearMatch: Boolean(yearMatch),
    releaseDate: releaseOf(item),
  };
}

function pick(results, year) {
  const yearText = year == null || year === '' ? '' : String(year);
  const yearHit = yearText
    ? results.find((item) => yearOf(item) === yearText && item.poster_path)
    : null;
  const posterHit = results.find((item) => item.poster_path);
  const match = yearHit || posterHit || null;
  return { match, yearMatch: Boolean(yearHit) };
}

function mediaHits(results) {
  return (Array.isArray(results) ? results : []).filter((item) => (
    item && (item.media_type === 'movie' || item.media_type === 'tv') && (item.title || item.name)
  ));
}

export async function search(query, year, options = {}) {
  const text = String(query || '').trim();
  if (!text) return null;
  const data = await get(`/search/multi?query=${encodeURIComponent(text)}&language=de-DE`);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;
  if (options.prefer === 'movie' || options.prefer === 'tv') {
    const typed = results.filter((item) => item.media_type === options.prefer);
    const preferred = pick(typed, year);
    if (preferred.match) return shape(preferred.match, preferred.yearMatch);
  }
  const any = pick(results, year);
  return shape(any.match, any.yearMatch);
}

export async function searchHits(query, year, limit = 8) {
  const text = String(query || '').trim();
  if (!text) return [];
  const data = await get(`/search/multi?query=${encodeURIComponent(text)}&language=de-DE`);
  const yearText = year == null || year === '' ? '' : String(year);
  const ranked = mediaHits(data?.results).slice().sort((a, b) => (
    yearText ? Number(yearOf(b) === yearText) - Number(yearOf(a) === yearText) : 0
  ));
  return ranked.slice(0, limit).map((item) => shape(item, Boolean(yearText) && yearOf(item) === yearText));
}

export async function directorName(type, id) {
  const kind = type === 'tv' ? 'tv' : 'movie';
  if (!id) return '';
  if (kind === 'tv') {
    const payload = await get(`/tv/${id}?language=de-DE`);
    const created = payload && Array.isArray(payload.created_by) ? payload.created_by[0] : null;
    if (created && created.name) return created.name;
  }
  const credits = await get(`/${kind}/${id}/credits?language=en-US`);
  const crew = credits && Array.isArray(credits.crew) ? credits.crew : [];
  const director = crew.find((person) => person.job === 'Director');
  return director && director.name ? director.name : '';
}

export async function findByImdb(imdbId) {
  const id = String(imdbId || '').trim();
  if (!/^tt\d+$/i.test(id)) return null;
  const data = await get(`/find/${encodeURIComponent(id)}?external_source=imdb_id`);
  const movie = data?.movie_results?.[0];
  const tv = data?.tv_results?.[0];
  const hit = movie || tv;
  if (!hit) return null;
  return shape({ ...hit, media_type: movie ? 'movie' : 'tv' }, false);
}

function goodMovie(item, type) {
  if (!item || !item.id) return null;
  const kind = type === 'tv' ? 'tv' : 'movie';
  if (item.media_type && item.media_type !== kind) return null;
  const vote = Number(item.vote_average);
  const votes = Number(item.vote_count);
  if (!Number.isFinite(vote) || !Number.isFinite(votes) || vote < 7 || votes < 300) return null;
  const title = kind === 'tv' ? (item.name || item.title || '') : (item.title || item.name || '');
  if (!title) return null;
  const date = String(kind === 'tv' ? (item.first_air_date || item.release_date || '') : (item.release_date || '')).slice(0, 10);
  const original = kind === 'tv' ? (item.original_name || item.original_title || '') : (item.original_title || item.original_name || '');
  return {
    tmdbId: item.id,
    type: kind,
    title,
    original: original && original !== title ? original : '',
    year: date.slice(0, 4),
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : '',
    vote: Math.round(vote * 10) / 10,
    votes,
  };
}

function resultList(data) {
  return Array.isArray(data && data.results) ? data.results : [];
}

function pageContinues(data, page) {
  return Number(data && data.total_pages) > page;
}

async function grab(path) {
  try {
    return await get(path);
  } catch {
    return null;
  }
}

export async function recommendBundle(kind, id, page) {
  const type = kind === 'tv' ? 'tv' : 'movie';
  const pageNum = Math.min(20, Math.max(1, Number.parseInt(page, 10) || 1));
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return { page: pageNum, more: false, director: '', films: [] };
  }
  const [credits, recs, sims] = await Promise.all([
    grab(`/${type}/${numericId}/credits?language=en-US`),
    grab(`/${type}/${numericId}/recommendations?language=de-DE&page=${pageNum}`),
    grab(`/${type}/${numericId}/similar?language=de-DE&page=${pageNum}`),
  ]);
  const crew = credits && Array.isArray(credits.crew) ? credits.crew : [];
  const director = crew.find((person) => person && person.job === 'Director' && person.id) || null;
  const cast = (credits && Array.isArray(credits.cast) ? credits.cast : [])
    .filter((person) => person && person.id && person.name)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .slice(0, 5);
  const discoverPath = type === 'tv' ? '/discover/tv' : '/discover/movie';
  const jobs = [];
  if (director) {
    jobs.push(grab(`${discoverPath}?with_crew=${director.id}&page=${pageNum}&vote_count.gte=300&vote_average.gte=7&sort_by=vote_average.desc&include_adult=false&language=de-DE`).then((data) => ({
      kind: 'director',
      data,
    })));
  }
  cast.forEach((person) => {
    jobs.push(grab(`${discoverPath}?with_cast=${person.id}&page=${pageNum}&vote_count.gte=300&vote_average.gte=7&sort_by=vote_average.desc&include_adult=false&language=de-DE`).then((data) => ({
      kind: 'cast',
      name: person.name,
      data,
    })));
  });
  const discovered = await Promise.all(jobs);
  const map = new Map();
  const add = (item, source, extra) => {
    const row = goodMovie(item, type);
    if (!row || row.tmdbId === numericId) return;
    let current = map.get(row.tmdbId);
    if (!current) {
      current = {
        ...row,
        sources: [],
        cast: [],
        sameDirector: false,
      };
      map.set(row.tmdbId, current);
    }
    if (!current.sources.includes(source)) current.sources.push(source);
    if (extra && extra.sameDirector) current.sameDirector = true;
    if (extra && extra.castName && !current.cast.includes(extra.castName)) current.cast.push(extra.castName);
  };
  resultList(recs).forEach((item) => add(item, 'recommendations'));
  resultList(sims).forEach((item) => add(item, 'similar'));
  discovered.forEach((entry) => {
    resultList(entry && entry.data).forEach((item) => {
      if (entry.kind === 'director') add(item, 'director', { sameDirector: true });
      else add(item, 'cast', { castName: entry.name });
    });
  });
  return {
    page: pageNum,
    more: pageContinues(recs, pageNum) || pageContinues(sims, pageNum),
    director: director && director.name ? director.name : '',
    films: [...map.values()],
  };
}

export async function details(type, id) {
  const kind = type === 'tv' ? 'tv' : 'movie';
  const append = kind === 'tv'
    ? 'keywords,credits,content_ratings,external_ids'
    : 'keywords,credits,release_dates,external_ids';
  const payload = await get(`/${kind}/${id}?language=en-US&append_to_response=${append}`);
  if (!payload) return null;
  if (!String(payload.overview || '').trim()) {
    const german = await get(`/${kind}/${id}?language=de-DE`);
    const text = german && String(german.overview || '').trim();
    if (text) payload.overview = text;
  }
  return payload;
}
