(function attachStore(root) {
  const KEY = 'moviebylucia-archive-v2';
  const BACKUP = 'moviebylucia-archive-v2-backup';
  const MIGRATED = 'moviebylucia-ids-v15';
  const LEGACY = [
    'moviebylucia-v1',
    'moviebylucia-added-v1',
    'moviebylucia-removed-v1',
    'moviebylucia-facets-v1',
    'moviebylucia-positions-v2',
  ];

  let archive = null;
  let onError = null;

  function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function blank(startList) {
    return {
      version: 2,
      startList: startList === 'leer' ? 'leer' : 'luciano',
      hidden: [],
      added: [],
      facetOverrides: {},
      positions: {},
      entries: {},
    };
  }

  function cleanEntry(raw) {
    const source = asObject(raw);
    const row = {};
    if (typeof source.rating === 'number' && Number.isFinite(source.rating) && source.rating > 0) row.rating = source.rating;
    if (source.watched) row.watched = true;
    if (source.favorite) row.favorite = true;
    if (source.next) row.next = true;
    if (typeof source.memo === 'string' && source.memo) row.memo = source.memo;
    return row;
  }

  function normalize(raw) {
    const source = asObject(raw);
    const next = blank(source.startList);
    next.hidden = Array.isArray(source.hidden)
      ? source.hidden.filter((id) => typeof id === 'string' && id)
      : [];
    next.added = Array.isArray(source.added)
      ? source.added.filter((film) => film && typeof film.id === 'string' && film.id && typeof film.title === 'string' && film.title)
      : [];
    Object.entries(asObject(source.facetOverrides)).forEach(([id, facets]) => {
      if (facets && typeof facets === 'object' && !Array.isArray(facets)) next.facetOverrides[id] = facets;
    });
    Object.entries(asObject(source.positions)).forEach(([id, point]) => {
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      next.positions[id] = { x: point.x, y: point.y };
    });
    Object.entries(asObject(source.entries)).forEach(([id, row]) => {
      const clean = cleanEntry(row);
      if (Object.keys(clean).length) next.entries[id] = clean;
    });
    return next;
  }

  function legacyPresent() {
    return LEGACY.some((key) => {
      try { return localStorage.getItem(key) !== null; } catch { return false; }
    });
  }

  function persist() {
    if (!archive) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(archive));
      return true;
    } catch {
      if (typeof onError === 'function') onError();
      return false;
    }
  }

  function fromLegacy() {
    return normalize({
      startList: 'luciano',
      hidden: readJson('moviebylucia-removed-v1', []),
      added: readJson('moviebylucia-added-v1', []),
      facetOverrides: readJson('moviebylucia-facets-v1', {}),
      positions: readJson('moviebylucia-positions-v2', {}),
      entries: readJson('moviebylucia-v1', {}),
    });
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { raw = null; }
    if (raw !== null) {
      try {
        archive = normalize(JSON.parse(raw));
        return archive;
      } catch {
        archive = null;
      }
    }
    if (!legacyPresent()) return null;
    archive = fromLegacy();
    persist();
    return archive;
  }

  function create(startList) {
    archive = blank(startList);
    persist();
    return archive;
  }

  function replace(raw) {
    archive = normalize(raw);
    persist();
    return archive;
  }

  function save(next) {
    if (next) archive = next;
    return persist();
  }

  function savePositions(positions) {
    if (!archive) return false;
    if (positions && positions !== archive.positions) archive.positions = positions;
    return persist();
  }

  function filmKey(film) {
    if (!film) return '';
    const parsed = typeof film.id === 'string'
      ? film.id.match(/^tmdb[:\-](movie|tv)[:\-](\d+)$/i)
      : null;
    const raw = film.tmdbId != null ? film.tmdbId : (parsed ? parsed[2] : null);
    const numeric = typeof raw === 'number' ? raw : (typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isFinite(numeric)) return film.id ? String(film.id) : '';
    const hinted = film.tmdbType || (parsed && parsed[1]);
    const kind = hinted === 'tv' ? 'tv' : 'movie';
    return `tmdb:${kind}:${numeric}`;
  }

  function remapBag(bag, map) {
    const next = {};
    Object.entries(asObject(bag)).forEach(([id, value]) => {
      const key = map.get(id) || id;
      if (next[key] == null) next[key] = value;
    });
    return next;
  }

  function migrateIds(sourceMap) {
    if (!archive) return null;
    let done = false;
    try { done = localStorage.getItem(MIGRATED) === '1'; } catch { done = false; }
    if (done) return archive;
    const map = sourceMap instanceof Map ? new Map(sourceMap) : new Map();
    archive.added.forEach((film) => {
      const next = filmKey(film);
      if (film && film.id && next && next !== film.id) map.set(film.id, next);
    });
    if (!map.size) return archive;
    try {
      if (localStorage.getItem(BACKUP) == null) {
        const raw = localStorage.getItem(KEY);
        if (raw != null) localStorage.setItem(BACKUP, raw);
      }
    } catch {
      /* ohne Sicherung wird trotzdem umgeschlüsselt */
    }
    archive.hidden = [...new Set(archive.hidden.map((id) => map.get(id) || id))];
    archive.added.forEach((film) => {
      film.id = map.get(film.id) || film.id;
    });
    archive.facetOverrides = remapBag(archive.facetOverrides, map);
    archive.positions = remapBag(archive.positions, map);
    archive.entries = remapBag(archive.entries, map);
    if (!persist()) return archive;
    try { localStorage.setItem(MIGRATED, '1'); } catch { /* die Daten sind schon neu */ }
    return archive;
  }

  function reset() {
    if (!archive) return null;
    archive.hidden.splice(0);
    archive.added.splice(0);
    Object.keys(archive.facetOverrides).forEach((key) => { delete archive.facetOverrides[key]; });
    Object.keys(archive.positions).forEach((key) => { delete archive.positions[key]; });
    Object.keys(archive.entries).forEach((key) => { delete archive.entries[key]; });
    persist();
    return archive;
  }

  root.Store = {
    load,
    create,
    replace,
    save,
    savePositions,
    reset,
    filmKey,
    migrateIds,
    current() { return archive; },
    setError(fn) { onError = fn; },
  };
})(globalThis);
