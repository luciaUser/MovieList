(function attachFacets(root) {
  const LIST_LIMITS = {
    genres: 3,
    subgenres: 2,
    themes: 4,
    tone: 2,
    narrative: 2,
    origin: 4,
    cast: 3,
  };

  async function loadVocabulary(source) {
    if (source && typeof source === 'object') return source;
    const response = await fetch(source || 'data/vocabulary.json');
    if (!response.ok) throw new Error('vocabulary');
    return response.json();
  }

  function allowedSet(vocab, field) {
    if (field === 'subgenres') {
      return new Set(Object.values(vocab.subgenres || {}).flat());
    }
    if (field === 'intensity') {
      return new Set((vocab.intensity || []).map((item) => item.level));
    }
    return new Set(vocab[field] || []);
  }

  function validateFacets(raw, vocab) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const discarded = [];
    const facets = {};
    const drop = (field, value) => discarded.push({ field, value });

    function takeList(field, allowed) {
      const values = Array.isArray(source[field]) ? source[field] : [];
      const next = [];
      for (const value of values) {
        if (typeof value !== 'string' || (allowed && !allowed.has(value))) {
          if (value != null && value !== '') drop(field, value);
          continue;
        }
        if (!next.includes(value)) next.push(value);
      }
      const capped = next.slice(0, LIST_LIMITS[field] || next.length);
      if (capped.length) facets[field] = capped;
    }

    takeList('genres', allowedSet(vocab, 'genres'));
    takeList('subgenres', allowedSet(vocab, 'subgenres'));
    takeList('themes', allowedSet(vocab, 'themes'));
    takeList('tone', allowedSet(vocab, 'tone'));
    takeList('narrative', allowedSet(vocab, 'narrative'));
    takeList('origin', null);
    if (facets.origin) {
      const codes = facets.origin.filter((code) => /^[A-Z]{2}$/.test(code));
      const rejected = facets.origin.filter((code) => !/^[A-Z]{2}$/.test(code));
      rejected.forEach((value) => drop('origin', value));
      if (codes.length) facets.origin = codes.slice(0, LIST_LIMITS.origin);
      else delete facets.origin;
    }

    if (source.epoch != null && source.epoch !== '') {
      if (allowedSet(vocab, 'epoch').has(source.epoch)) facets.epoch = source.epoch;
      else drop('epoch', source.epoch);
    }
    if (source.place != null && source.place !== '') {
      if (allowedSet(vocab, 'place').has(source.place)) facets.place = source.place;
      else drop('place', source.place);
    }
    if (source.format != null && source.format !== '') {
      if (allowedSet(vocab, 'formats').has(source.format)) facets.format = source.format;
      else drop('format', source.format);
    }
    if (source.intensity != null && source.intensity !== '') {
      const level = Number(source.intensity);
      if (allowedSet(vocab, 'intensity').has(level)) facets.intensity = level;
      else drop('intensity', source.intensity);
    }

    takeList('cast', null);
    if (typeof source.director === 'string' && source.director.trim()) facets.director = source.director.trim();
    else if (source.director) drop('director', source.director);
    if (typeof source.franchise === 'string' && source.franchise.trim()) facets.franchise = source.franchise.trim();
    else if (source.franchise === null) facets.franchise = null;

    if (typeof source.imdbId === 'string' && /^tt\d+$/i.test(source.imdbId)) facets.imdbId = source.imdbId.toLowerCase();
    else if (source.imdbId) drop('imdbId', source.imdbId);
    if (typeof source.tmdbId === 'number' && Number.isFinite(source.tmdbId)) facets.tmdbId = source.tmdbId;
    else if (typeof source.tmdbId === 'string' && /^\d+$/.test(source.tmdbId)) facets.tmdbId = Number(source.tmdbId);
    else if (source.tmdbId) drop('tmdbId', source.tmdbId);
    if (source.tmdbType === 'movie' || source.tmdbType === 'tv') facets.tmdbType = source.tmdbType;
    else if (source.tmdbType) drop('tmdbType', source.tmdbType);

    if (source.source === 'tmdb' || source.source === 'manuell') facets.source = source.source;
    else if (source.source) drop('source', source.source);
    if (typeof source.reviewed === 'boolean') facets.reviewed = source.reviewed;
    else if (source.reviewed != null) drop('reviewed', source.reviewed);

    if (typeof source.tmdbRating === 'number' && Number.isFinite(source.tmdbRating)) {
      facets.tmdbRating = Math.round(source.tmdbRating * 10) / 10;
    } else if (source.tmdbRating != null) drop('tmdbRating', source.tmdbRating);
    if (typeof source.tmdbVotes === 'number' && Number.isFinite(source.tmdbVotes)) {
      facets.tmdbVotes = Math.round(source.tmdbVotes);
    } else if (source.tmdbVotes != null) drop('tmdbVotes', source.tmdbVotes);
    if (typeof source.poster === 'string' && source.poster.trim()) facets.poster = source.poster.trim();

    if (discarded.length) console.warn('Verworfene Facetten', discarded);
    return { facets, discarded };
  }

  function mergeFilm(film, facets) {
    const next = { ...(film || {}) };
    if (!facets || typeof facets !== 'object') return next;
    for (const key of ['genres', 'subgenres', 'themes', 'tone', 'narrative', 'origin', 'cast']) {
      if (Array.isArray(facets[key]) && facets[key].length) next[key] = facets[key].slice();
    }
    for (const key of ['intensity', 'epoch', 'place', 'format', 'tmdbRating', 'tmdbVotes', 'imdbId', 'tmdbId', 'tmdbType', 'source', 'reviewed', 'poster']) {
      if (facets[key] != null && facets[key] !== '') next[key] = facets[key];
    }
    if (facets.director) next.director = facets.director;
    if (facets.franchise) next.franchise = facets.franchise;
    return next;
  }

  root.Facets = { loadVocabulary, validateFacets, mergeFilm };
})(globalThis);
