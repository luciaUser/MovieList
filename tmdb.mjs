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

export async function details(type, id) {
  const kind = type === 'tv' ? 'tv' : 'movie';
  const append = kind === 'tv'
    ? 'keywords,credits,content_ratings,external_ids'
    : 'keywords,credits,release_dates,external_ids';
  return get(`/${kind}/${id}?language=en-US&append_to_response=${append}`);
}
