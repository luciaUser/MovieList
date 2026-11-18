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
  let onSync = null;
  let userId = null;
  let client = null;
  let cloudMode = false;
  let roster = null;
  let applying = false;
  let pushing = false;
  let pushAgain = false;
  let wipe = false;
  let pushTimer = 0;
  let lastAck = {};
  let stamps = {};
  let onlineBound = false;

  const SYNCABLE = /^tmdb:(movie|tv):\d+$/;

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
      if (point.x === 0 && point.y === 0) return;
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

  function cacheKey(id) { return `moviebylucia-cache-${id}`; }
  function ackKey(id) { return `moviebylucia-ack-${id}`; }
  function stampKey(id) { return `moviebylucia-stamps-${id}`; }
  function queueKey(id) { return `moviebylucia-queue-${id}`; }

  function storageKey() {
    return userId ? cacheKey(userId) : KEY;
  }

  function syncableId(id) {
    return SYNCABLE.test(id);
  }

  function persist() {
    if (!archive) return false;
    if (cloudMode && !userId) return false;
    try {
      localStorage.setItem(storageKey(), JSON.stringify(archive));
      if (userId && !applying) {
        touchDirty();
        schedulePush();
      }
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
    try { raw = localStorage.getItem(storageKey()); } catch { raw = null; }
    if (raw !== null) {
      try {
        archive = normalize(JSON.parse(raw));
        return archive;
      } catch {
        archive = null;
      }
    }
    if (userId || !legacyPresent()) return null;
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
    if (cloudMode && !userId) return null;
    archive = normalize(raw);
    persist();
    return archive;
  }

  function save(next) {
    if (cloudMode && !userId) return false;
    if (next) archive = next;
    return persist();
  }

  function savePositions(positions) {
    if (!archive || (cloudMode && !userId)) return false;
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
    if (!userId) {
      persist();
      return archive;
    }
    wipe = true;
    lastAck = {};
    stamps = {};
    applying = true;
    const stored = persist();
    applying = false;
    persistAck();
    rememberQueue();
    if (!stored) return archive;
    return flush().then(() => archive);
  }

  function starterSet() {
    const list = roster && typeof roster.starterIds === 'function' ? roster.starterIds() : [];
    return new Set((list || []).filter((id) => typeof id === 'string' && id));
  }

  function desiredIds() {
    const ids = new Set();
    if (!archive) return [];
    if (archive.startList !== 'leer') starterSet().forEach((id) => ids.add(id));
    archive.added.forEach((film) => { if (film && film.id) ids.add(film.id); });
    archive.hidden.forEach((id) => ids.add(id));
    Object.keys(archive.entries).forEach((id) => ids.add(id));
    Object.keys(archive.positions).forEach((id) => ids.add(id));
    Object.keys(archive.facetOverrides).forEach((id) => ids.add(id));
    return [...ids];
  }

  function entryRow(id) {
    const source = cleanEntry(archive.entries[id]);
    const hidden = archive.hidden.includes(id);
    const pos = archive.positions[id];
    const facets = archive.facetOverrides[id];
    return {
      user_id: userId,
      film_id: id,
      rating: typeof source.rating === 'number' ? source.rating : null,
      watched: !!source.watched,
      favorite: !!source.favorite,
      next: !!source.next,
      in_archive: !hidden,
      hidden,
      facet_overrides: facets && typeof facets === 'object' && Object.keys(facets).length ? facets : null,
      pos_x: pos && Number.isFinite(pos.x) ? pos.x : null,
      pos_y: pos && Number.isFinite(pos.y) ? pos.y : null,
    };
  }

  function memoOf(id) {
    const row = archive.entries[id];
    return row && typeof row.memo === 'string' ? row.memo : '';
  }

  function signature(id) {
    const row = entryRow(id);
    const film = roster && typeof roster.catalog === 'function' ? roster.catalog(id) : null;
    return JSON.stringify({
      rating: row.rating,
      watched: row.watched,
      favorite: row.favorite,
      next: row.next,
      in_archive: row.in_archive,
      hidden: row.hidden,
      facet_overrides: row.facet_overrides,
      pos_x: row.pos_x,
      pos_y: row.pos_y,
      memo: memoOf(id),
      title: film && film.title ? film.title : '',
      poster: film && film.poster ? film.poster : '',
    });
  }

  function touchDirty() {
    desiredIds().forEach((id) => {
      if (!syncableId(id)) {
        delete stamps[id];
        return;
      }
      if (signature(id) !== lastAck[id]) stamps[id] = new Date().toISOString();
      else delete stamps[id];
    });
    Object.keys(lastAck).forEach((id) => {
      if (!desiredIds().includes(id)) stamps[id] = stamps[id] || new Date().toISOString();
    });
    try { localStorage.setItem(stampKey(userId), JSON.stringify(stamps)); } catch { /* der Cache bleibt */ }
  }

  function rememberQueue() {
    if (!userId) return;
    const dirty = desiredIds().filter((id) => syncableId(id) && signature(id) !== lastAck[id]);
    Object.keys(lastAck).forEach((id) => {
      if (!desiredIds().includes(id)) dirty.push(id);
    });
    try { localStorage.setItem(queueKey(userId), JSON.stringify(dirty)); } catch { /* die Änderung bleibt im Cache */ }
  }

  function persistAck() {
    if (!userId) return;
    try {
      localStorage.setItem(ackKey(userId), JSON.stringify(lastAck));
      localStorage.setItem(stampKey(userId), JSON.stringify(stamps));
    } catch { /* ohne Merkzettel wird beim nächsten Mal neu verglichen */ }
  }

  function schedulePush() {
    if (!userId || applying) return;
    rememberQueue();
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(flush, 800);
  }

  function raiseSync(failed) {
    if (typeof onSync === 'function') onSync(failed);
  }

  async function wipeCloud() {
    const notes = await client.from('notes').delete().eq('user_id', userId);
    if (notes.error) throw notes.error;
    const entries = await client.from('entries').delete().eq('user_id', userId);
    if (entries.error) throw entries.error;
    wipe = false;
    lastAck = {};
  }

  async function flush() {
    if (!userId || !client) return false;
    window.clearTimeout(pushTimer);
    pushTimer = 0;
    if (pushing) {
      pushAgain = true;
      return false;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      rememberQueue();
      return false;
    }
    pushing = true;
    try {
      if (wipe) await wipeCloud();
      const wanted = desiredIds().filter(syncableId);
      const dropped = Object.keys(lastAck).filter((id) => !wanted.includes(id));
      const pending = wanted.filter((id) => signature(id) !== lastAck[id]);
      const changed = pending.filter((id) => {
        const film = roster && typeof roster.catalog === 'function' ? roster.catalog(id) : null;
        return Boolean(film && film.title);
      });
      const films = [];
      const entries = [];
      const notes = [];
      const clearNotes = [];
      changed.forEach((id) => {
        const film = roster.catalog(id);
        films.push(film);
        entries.push(entryRow(id));
        const memo = memoOf(id);
        let previous = '';
        try { previous = lastAck[id] ? JSON.parse(lastAck[id]).memo || '' : ''; } catch { previous = ''; }
        if (memo) {
          notes.push({
            user_id: userId,
            film_id: id,
            memo,
            updated_at: new Date().toISOString(),
          });
        } else if (previous) clearNotes.push(id);
      });
      if (films.length) {
        const written = await client.from('films').upsert(films, { onConflict: 'id' });
        if (written.error) throw written.error;
      }
      if (entries.length) {
        const written = await client.from('entries').upsert(entries, { onConflict: 'user_id,film_id' });
        if (written.error) throw written.error;
      }
      if (notes.length) {
        const written = await client.from('notes').upsert(notes, { onConflict: 'user_id,film_id' });
        if (written.error) throw written.error;
      }
      if (clearNotes.length) {
        const removed = await client.from('notes').delete().eq('user_id', userId).in('film_id', clearNotes);
        if (removed.error) throw removed.error;
      }
      if (dropped.length) {
        const removedNotes = await client.from('notes').delete().eq('user_id', userId).in('film_id', dropped);
        if (removedNotes.error) throw removedNotes.error;
        const removedEntries = await client.from('entries').delete().eq('user_id', userId).in('film_id', dropped);
        if (removedEntries.error) throw removedEntries.error;
        dropped.forEach((id) => { delete lastAck[id]; delete stamps[id]; });
      }
      changed.forEach((id) => {
        if (!films.some((film) => film.id === id)) return;
        lastAck[id] = signature(id);
        delete stamps[id];
      });
      persistAck();
      rememberQueue();
      if (changed.length < pending.length) {
        raiseSync(true);
        return false;
      }
      raiseSync(false);
      return true;
    } catch {
      rememberQueue();
      raiseSync(true);
      return false;
    } finally {
      pushing = false;
      if (pushAgain) {
        pushAgain = false;
        schedulePush();
      }
    }
  }

  function timeOf(value) {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : 0;
  }

  function filmFromRow(row) {
    const facets = row.facets && typeof row.facets === 'object' ? row.facets : {};
    const yearNum = Number(String(row.year || '').slice(0, 4));
    const genres = Array.isArray(facets.genres) ? facets.genres : [];
    const score = row.tmdb_rating == null ? null : Number(row.tmdb_rating);
    return {
      id: row.id,
      title: row.title,
      original: row.original_title || null,
      year: row.year || '',
      yearNum: Number.isFinite(yearNum) ? yearNum : null,
      kind: row.kind === 'tv' ? 'serie' : 'film',
      genres,
      cluster: genres[0] || '',
      director: facets.director || '',
      cast: Array.isArray(facets.cast) ? facets.cast : [],
      poster: row.poster || facets.poster || '',
      imdb: Number.isFinite(score) ? score : null,
      imdbLabel: Number.isFinite(score) ? String(score).replace('.', ',') : '–',
      tags: Array.isArray(facets.themes) ? facets.themes : [],
      meta: [],
    };
  }

  function archiveFromRemote(rows, notes, filmRows, starters) {
    const noteById = new Map(notes.map((note) => [note.film_id, note]));
    const filmById = new Map(filmRows.map((film) => [film.id, film]));
    const next = blank('leer');
    let starterVisible = false;
    rows.forEach((row) => {
      if (!row || !syncableId(row.film_id)) return;
      const id = row.film_id;
      if (row.hidden) next.hidden.push(id);
      if (row.pos_x != null && row.pos_y != null) {
        const x = Number(row.pos_x);
        const y = Number(row.pos_y);
        if (Number.isFinite(x) && Number.isFinite(y) && !(x === 0 && y === 0)) next.positions[id] = { x, y };
      }
      if (row.facet_overrides && typeof row.facet_overrides === 'object') next.facetOverrides[id] = row.facet_overrides;
      const local = {};
      const rating = Number(row.rating);
      if (Number.isFinite(rating) && rating > 0) local.rating = Math.round(rating * 10) / 10;
      if (row.watched) local.watched = true;
      if (row.favorite) local.favorite = true;
      if (row.next) local.next = true;
      const note = noteById.get(id);
      if (note && typeof note.memo === 'string' && note.memo) local.memo = note.memo;
      if (Object.keys(local).length) next.entries[id] = local;
      if (starters.has(id)) {
        if (row.in_archive && !row.hidden) starterVisible = true;
        return;
      }
      if (row.hidden || row.in_archive === false) return;
      const film = filmById.get(id);
      if (!film) return;
      next.added.push(filmFromRow(film));
      if (!next.facetOverrides[id] && film.facets) next.facetOverrides[id] = film.facets;
    });
    next.startList = starterVisible ? 'luciano' : 'leer';
    return normalize(next);
  }

  function mergeLocal(remote, remoteRows) {
    const local = archive;
    if (!local) return remote;
    const byFilm = new Map((remoteRows || []).map((row) => [row.film_id, row]));
    const keep = new Set();
    Object.keys(stamps).forEach((id) => {
      const remoteRow = byFilm.get(id);
      const remoteAt = remoteRow ? timeOf(remoteRow.updated_at) : 0;
      if (timeOf(stamps[id]) > remoteAt) keep.add(id);
    });
    keep.forEach((id) => {
      if (local.entries[id]) remote.entries[id] = local.entries[id];
      else delete remote.entries[id];
      if (local.positions[id]) remote.positions[id] = local.positions[id];
      else delete remote.positions[id];
      if (local.facetOverrides[id]) remote.facetOverrides[id] = local.facetOverrides[id];
      else delete remote.facetOverrides[id];
      remote.hidden = remote.hidden.filter((item) => item !== id);
      if (local.hidden.includes(id)) remote.hidden.push(id);
      const added = local.added.find((film) => film && film.id === id);
      if (added && !remote.added.some((film) => film.id === id)) remote.added.push(added);
    });
    local.added.forEach((film) => {
      if (!film || !film.id || syncableId(film.id)) return;
      if (!remote.added.some((item) => item.id === film.id)) remote.added.push(film);
      if (local.entries[film.id]) remote.entries[film.id] = local.entries[film.id];
      if (local.positions[film.id]) remote.positions[film.id] = local.positions[film.id];
      if (local.facetOverrides[film.id]) remote.facetOverrides[film.id] = local.facetOverrides[film.id];
    });
    return normalize(remote);
  }

  function ackClean(keep) {
    desiredIds().forEach((id) => {
      if (!syncableId(id) || keep.has(id)) return;
      lastAck[id] = signature(id);
      delete stamps[id];
    });
    persistAck();
    rememberQueue();
  }

  async function cloudEmpty() {
    if (!client || !userId) return null;
    const result = await client.from('entries').select('film_id', { count: 'exact', head: true }).eq('user_id', userId);
    if (result.error) throw result.error;
    return result.count === 0;
  }

  async function pull() {
    if (!client || !userId) return { empty: true };
    const entries = await client.from('entries').select('film_id,rating,watched,favorite,next,in_archive,hidden,facet_overrides,pos_x,pos_y,updated_at').eq('user_id', userId);
    if (entries.error) throw entries.error;
    const notes = await client.from('notes').select('film_id,memo,updated_at').eq('user_id', userId);
    if (notes.error) throw notes.error;
    const rows = entries.data || [];
    if (!rows.length && !(notes.data || []).length) return { empty: true };
    const starters = starterSet();
    const extra = rows.map((row) => row.film_id).filter((id) => syncableId(id) && !starters.has(id));
    let filmRows = [];
    if (extra.length) {
      const films = await client.from('films').select('id,title,original_title,year,kind,poster,tmdb_rating,tmdb_votes,facets').in('id', extra);
      if (films.error) throw films.error;
      filmRows = films.data || [];
    }
    const remote = archiveFromRemote(rows, notes.data || [], filmRows, starters);
    const byFilm = new Map(rows.map((row) => [row.film_id, row]));
    const keep = new Set();
    Object.keys(stamps).forEach((id) => {
      const remoteRow = byFilm.get(id);
      const remoteAt = remoteRow ? timeOf(remoteRow.updated_at) : 0;
      if (timeOf(stamps[id]) > remoteAt) keep.add(id);
    });
    const merged = mergeLocal(remote, rows);
    applying = true;
    archive = merged;
    persist();
    applying = false;
    ackClean(keep);
    if (keep.size) schedulePush();
    return { empty: false };
  }

  function readLegacyArchive() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw != null) return normalize(JSON.parse(raw));
    } catch {
      /* der alte Schlüssel ist beschädigt */
    }
    if (!legacyPresent()) return null;
    return fromLegacy();
  }

  function remapArchive(data, sourceMap) {
    if (!data) return null;
    const map = sourceMap instanceof Map ? new Map(sourceMap) : new Map();
    data.added.forEach((film) => {
      const next = filmKey(film);
      if (film && film.id && next && next !== film.id) map.set(film.id, next);
    });
    if (!map.size) return data;
    const copy = normalize(JSON.parse(JSON.stringify(data)));
    copy.hidden = [...new Set(copy.hidden.map((id) => map.get(id) || id))];
    copy.added.forEach((film) => { film.id = map.get(film.id) || film.id; });
    copy.facetOverrides = remapBag(copy.facetOverrides, map);
    copy.positions = remapBag(copy.positions, map);
    copy.entries = remapBag(copy.entries, map);
    return copy;
  }

  function hasLegacy() {
    try {
      if (localStorage.getItem(KEY) != null) return true;
    } catch {
      return false;
    }
    return legacyPresent();
  }

  function legacyPreview(sourceMap, starterIds) {
    const data = remapArchive(readLegacyArchive(), sourceMap);
    if (!data) return null;
    const hidden = new Set(data.hidden);
    const starter = new Set(starterIds || []);
    const seen = new Set();
    let films = 0;
    if (data.startList !== 'leer') {
      starter.forEach((id) => {
        if (hidden.has(id) || seen.has(id)) return;
        seen.add(id);
        films += 1;
      });
    }
    data.added.forEach((film) => {
      if (!film || !film.id || hidden.has(film.id) || seen.has(film.id)) return;
      seen.add(film.id);
      films += 1;
    });
    const ratings = Object.values(data.entries).filter((row) => row && typeof row.rating === 'number' && row.rating > 0).length;
    const corrections = Object.keys(data.facetOverrides).length;
    return { ratings, films, corrections, data };
  }

  function clearLegacy() {
    [KEY, BACKUP, MIGRATED, ...LEGACY].forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* schon weg */ }
    });
  }

  function bind(options) {
    cloudMode = true;
    userId = options && options.userId;
    client = options && options.client;
    roster = options || null;
    try {
      lastAck = JSON.parse(localStorage.getItem(ackKey(userId)) || '{}');
      stamps = JSON.parse(localStorage.getItem(stampKey(userId)) || '{}');
    } catch {
      lastAck = {};
      stamps = {};
    }
    if (!lastAck || typeof lastAck !== 'object') lastAck = {};
    if (!stamps || typeof stamps !== 'object') stamps = {};
    if (!onlineBound && typeof window !== 'undefined') {
      window.addEventListener('online', () => { flush(); });
      onlineBound = true;
    }
  }

  function clearUser() {
    const id = userId;
    window.clearTimeout(pushTimer);
    pushTimer = 0;
    if (id) {
      [cacheKey(id), ackKey(id), stampKey(id), queueKey(id)].forEach((key) => {
        try { localStorage.removeItem(key); } catch { /* schon weg */ }
      });
    }
    userId = null;
    client = null;
    roster = null;
    archive = null;
    lastAck = {};
    stamps = {};
    wipe = false;
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
    syncable: syncableId,
    bind,
    clearUser,
    flush,
    pull,
    cloudEmpty,
    hasLegacy,
    legacyPreview,
    clearLegacy,
    current() { return archive; },
    setError(fn) { onError = fn; },
    setSyncError(fn) { onSync = fn; },
  };
})(globalThis);
