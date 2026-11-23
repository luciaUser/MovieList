(() => {
  const LINK_GROUPS = {
    director: 'Gleiche Handschrift',
    cast: 'Gleiche Handschrift',
    franchise: 'Gleiche Handschrift',
    subgenre: 'Ähnliche Geschichte',
    theme: 'Ähnliche Geschichte',
    narrative: 'Ähnliche Geschichte',
    tone: 'Ähnliche Stimmung',
    intensity: 'Ähnliche Stimmung',
    epoch: 'Gleiche Welt',
    place: 'Gleiche Welt',
    year: 'Gleiche Welt',
  };

  const wall = document.getElementById('wall');
  const panel = document.getElementById('panel');
  const search = document.getElementById('search');
  const results = document.getElementById('results');
  const networkEl = document.getElementById('network');
  const modeNetwork = document.getElementById('mode-network');
  const modeDirector = document.getElementById('mode-director');
  const modeRating = document.getElementById('mode-rating');
  const modeProfile = document.getElementById('mode-profile');
  const netRating = document.getElementById('net-rating');
  const netCompare = document.getElementById('net-compare');
  const MODE_KEY = 'moviebylucia-view-v1';
  const recoveryLink = /(?:^|[#&])type=recovery(?:&|$)/.test(location.hash);

  let archive = null;
  let removed = new Set();
  let FILMS = [];
  let state = {};
  const byId = new Map();
  const posters = new Map();
  let added = [];
  let facetOverrides = {};
  let baseFacets = {};
  let starterAdded = [];
  let started = false;
  let importBusy = false;

  let vocabulary = null;
  let editDraft = null;

  let mode = 'network';
  let ratingView = false;
  let network = null;
  let networkReady = false;
  let graphPoints = null;
  const idMap = new Map();
  let relayoutTimer = 0;
  let relayoutIdle = 0;
  let relayoutIdleTimer = false;
  let relayoutJob = 0;
  let relayoutWorker = null;
  let relayoutWait = null;
  let relayoutDirty = false;
  let relayoutPending = new Map();
  let pendingGlide = false;
  let netRatingOn = false;
  let account = null;
  let recoveryOn = null;
  let leaving = false;
  let profileToken = 0;
  let profileMode = 'home';
  let settingsOpen = false;
  let profileStats = null;
  let profileLists = { followers: [], following: [], requests: [] };
  let profileMail = null;
  let profileStatus = '';
  let followChannel = null;
  let listKind = '';
  let viewingId = null;
  let otherToken = 0;
  let otherCache = new Map();
  let followedCache = null;
  let skipProfileHome = false;
  let panelFilm = null;
  let compareId = null;
  let compareName = '';
  let pendingInvite = new URLSearchParams(location.search).get('profil') || '';
  let searchTimer = 0;
  let wishLists = [];
  let wishOpenId = null;
  let wishItems = [];
  let wishSort = 'votes';
  let wishChannel = null;
  let wishChannelKey = '';
  let wishFresh = new Set();
  let wishSeen = { lists: {}, hints: [] };
  let wishBoot = 0;
  let wishViewToken = 0;
  let wishReloadTimer = 0;
  let followedFilmCache = null;
  let followDot = false;
  let wishDot = false;
  let selectedId = null;
  let links = [];
  let activeLinkId = null;
  let spotlight = null;
  let lastTapAt = 0;
  let lastTapId = null;

  function needsProfile() {
    return Boolean(globalThis.AppConfig && globalThis.AppConfig.profileRequired);
  }

  function showStoreError() {
    const note = document.getElementById('store-note');
    if (!note) return;
    note.classList.remove('is-sync');
    note.hidden = false;
    note.textContent = 'Der Speicher ist voll. Neue Änderungen bleiben nur in dieser Sitzung.';
  }

  function showSyncState(failed) {
    const note = document.getElementById('store-note');
    if (!note) return;
    if (!failed) {
      if (!note.classList.contains('is-sync')) return;
      note.hidden = true;
      note.classList.remove('is-sync');
      note.replaceChildren();
      return;
    }
    note.classList.add('is-sync');
    note.hidden = false;
    note.replaceChildren(document.createTextNode('Nicht gespeichert – '));
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'erneut versuchen';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      retrySync().finally(() => { retry.disabled = false; });
    });
    note.append(retry);
  }

  if (globalThis.Store) globalThis.Store.setError(showStoreError);

  function persist() {
    if (!archive || !globalThis.Store) return false;
    archive.hidden = [...removed];
    archive.added = added;
    archive.facetOverrides = facetOverrides;
    archive.entries = state;
    const ok = globalThis.Store.save(archive);
    if (!ok) showStoreError();
    return ok;
  }

  function saveRemoved() {
    persist();
  }

  function saveFacetOverrides() {
    persist();
  }

  function applyFacets() {
    const next = { ...baseFacets };
    Object.entries(facetOverrides).forEach(([id, facets]) => {
      if (facets && typeof facets === 'object') next[id] = facets;
    });
    globalThis.FILM_FACETS = next;
    FILMS.forEach(patchFilmFromFacets);
  }

  function overlayFacets(base) {
    baseFacets = { ...(base || {}) };
    applyFacets();
  }

  function adoptArchive(next) {
    archive = next;
    removed = new Set(archive.hidden || []);
    facetOverrides = archive.facetOverrides;
    state = archive.entries;
    added = (archive.added || []).filter((film) => film && film.id && !removed.has(film.id));
    const seen = new Set();
    FILMS = [];
    byId.clear();
    posters.clear();
    const starter = archive.startList === 'leer' ? [] : (window.FILMS || []).concat(starterAdded);
    starter.concat(added).forEach((film) => {
      if (!film || !film.id || removed.has(film.id) || seen.has(film.id)) return;
      seen.add(film.id);
      FILMS.push(film);
      byId.set(film.id, film);
      if (film.poster) posters.set(film.id, film.poster);
    });
    applyFacets();
    if (network) network.setFilms(FILMS);
    refreshEmpty();
  }

  function patchFilmFromFacets(film) {
    const facets = facetOverrides[film.id];
    if (!facets) return;
    if (Array.isArray(facets.genres) && facets.genres.length) {
      film.genres = facets.genres.slice();
      film.cluster = facets.genres[0];
    }
    if (facets.director) film.director = facets.director;
  }

  function entry(id) {
    const row = state[id] || {};
    const result = {
      watched: !!row.watched,
      favorite: !!row.favorite,
      next: !!row.next,
      rating: typeof row.rating === 'number' && Number.isFinite(row.rating) && row.rating > 0 ? row.rating : null,
      memo: typeof row.memo === 'string' ? row.memo : '',
    };
    if (typeof row.ratedAt === 'string' && row.ratedAt) result.ratedAt = row.ratedAt;
    return result;
  }

  function removeFilm(id) {
    const own = added.some((film) => film.id === id);
    if (own) {
      added = added.filter((film) => film.id !== id);
      removed.delete(id);
      delete state[id];
      delete facetOverrides[id];
      if (archive && archive.positions) delete archive.positions[id];
      if (globalThis.FILM_FACETS) delete globalThis.FILM_FACETS[id];
    } else if (!removed.has(id)) {
      removed.add(id);
    }
    persist();
    FILMS = FILMS.filter((film) => film.id !== id);
    byId.delete(id);
    posters.delete(id);
    clearSelection();
    if (network) {
      network.setFilms(FILMS);
      network.dropFilm(id);
    }
    if (mode !== 'network') buildWall();
    refreshEmpty();
    scheduleRelayout();
  }

  function writeEntry(id, patch) {
    const next = { ...entry(id), ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'rating')) {
      if (typeof next.rating === 'number' && next.rating > 0) next.ratedAt = new Date().toISOString();
      else delete next.ratedAt;
    }
    state[id] = next;
    persist();
  }

  function hex(color) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    const pa = hex(a);
    const pb = hex(b);
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
  }

  function ratingColor(score) {
    const stops = [
      [0, '#9a221c'],
      [5, '#e4231a'],
      [6.2, '#f08a1a'],
      [7.4, '#f0d04a'],
      [8.6, '#8fce3a'],
      [10, '#12a34a'],
    ];
    if (score == null) return '#cfcfcf';
    if (score <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i += 1) {
      if (score <= stops[i][0]) {
        const span = stops[i][0] - stops[i - 1][0];
        return mix(stops[i - 1][1], stops[i][1], (score - stops[i - 1][0]) / span);
      }
    }
    return stops[stops.length - 1][1];
  }

  function lineStyle(reasons) {
    const kind = (reasons && reasons[0] && reasons[0].kind) || '';
    if (kind === 'director') return 'director';
    if (kind === 'cast' || kind === 'franchise') return 'cast';
    return 'content';
  }

  function fullOf(film) {
    const stored = globalThis.FILM_FACETS || {};
    const merge = globalThis.Facets && globalThis.Facets.mergeFilm;
    return merge ? merge(film, stored[film.id]) : film;
  }

  function ensureVocab() {
    if (vocabulary) return Promise.resolve(vocabulary);
    const load = globalThis.Facets && globalThis.Facets.loadVocabulary;
    if (!load) return Promise.reject(new Error('vocabulary'));
    return load().then((data) => {
      vocabulary = data;
      return data;
    });
  }

  function similarityFilms() {
    const stored = globalThis.FILM_FACETS || {};
    const merge = globalThis.Facets && globalThis.Facets.mergeFilm;
    return FILMS.map((film) => (merge ? merge(film, stored[film.id]) : film));
  }

  function linksFor(film) {
    const Similarity = globalThis.Similarity;
    if (!Similarity) return [];
    const films = similarityFilms();
    Similarity.prepare(films);
    const source = films.find((item) => item.id === film.id) || film;
    return Similarity.neighbors(source, films, 'links', 16).map((item) => {
      const reason = (item.reasons || []).find((entry) => LINK_GROUPS[entry.kind]) || null;
      let tier = 'weak';
      if (item.score >= 0.7) tier = 'strong';
      else if (item.score >= 0.4) tier = 'mid';
      return {
        id: item.film.id,
        score: item.score,
        tier,
        reasons: item.reasons,
        group: reason ? LINK_GROUPS[reason.kind] : '',
        reason: reason ? reason.label : '',
      };
    });
  }

  function ratingBucket(score) {
    if (score == null) return 'none';
    if (score >= 9) return 9;
    return Math.floor(score);
  }

  function ratingLabel(bucket) {
    if (bucket === 'none') return 'Ohne Wertung';
    if (bucket >= 9) return '★  9+';
    return `★  ${bucket}`;
  }

  function filmGroups() {
    if (ratingView) {
      const groups = new Map();
      FILMS.forEach((film) => {
        const bucket = ratingBucket(entry(film.id).rating);
        if (!groups.has(bucket)) groups.set(bucket, []);
        groups.get(bucket).push(film);
      });
      return [...groups.keys()]
        .sort((a, b) => {
          if (a === 'none') return 1;
          if (b === 'none') return -1;
          return b - a;
        })
        .map((bucket) => ({
          label: ratingLabel(bucket),
          films: groups.get(bucket).slice().sort((a, b) => (
            (entry(b.id).rating ?? -1) - (entry(a.id).rating ?? -1)
            || a.title.localeCompare(b.title, 'de')
          )),
        }));
    }
    const groups = new Map();
    FILMS.forEach((film) => {
      const key = mode === 'director' ? (film.director || 'Ohne Regie') : (film.cluster || 'Andere');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(film);
    });
    return [...groups.entries()]
      .sort((a, b) => {
        const watched = watchedCount(b[1]) - watchedCount(a[1]);
        if (watched) return watched;
        const size = b[1].length - a[1].length;
        if (size) return size;
        return a[0].localeCompare(b[0], 'de');
      })
      .map(([label, list]) => ({
        label,
        films: list.slice().sort((a, b) => (
          (b.imdb ?? -1) - (a.imdb ?? -1) || a.title.localeCompare(b.title, 'de')
        )),
      }));
  }

  function watchedCount(list) {
    return list.reduce((sum, film) => sum + (entry(film.id).watched ? 1 : 0), 0);
  }

  function myAverage(films) {
    const scores = films
      .map((film) => entry(film.id))
      .filter((row) => row.rating != null)
      .map((row) => row.rating);
    if (!scores.length) return null;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }

  function placeholder(film) {
    const lines = [];
    let line = '';
    film.title.split(/\s+/).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > 16 && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    const shown = lines.slice(0, 5);
    const start = 360 - (shown.length - 1) * 28;
    const text = shown.map((part, index) => (
      `<text x="250" y="${start + index * 56}" text-anchor="middle" fill="#f2f2f2" font-family="Helvetica, Arial, sans-serif" font-size="34">${escapeXml(part)}</text>`
    )).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect width="500" height="750" fill="#000"/>${text}</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function escapeXml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function originalIdOf(id) {
    for (const [from, to] of idMap) {
      if (to === id) return from;
    }
    return null;
  }

  function knownPoster(film) {
    if (!film) return '';
    const direct = posters.get(film.id);
    if (direct) return direct;
    const original = originalIdOf(film.id);
    if (original && posters.get(original)) return posters.get(original);
    if (film.poster) return film.poster;
    const facets = globalThis.FILM_FACETS || {};
    const row = facets[film.id] || (original ? facets[original] : null);
    return row && typeof row.poster === 'string' ? row.poster : '';
  }

  function posterSrc(film) {
    const src = knownPoster(film);
    if (src && film && !film.poster) film.poster = src;
    return src || placeholder(film);
  }

  function buildWall() {
    const selected = selectedId;
    wall.replaceChildren();
    if (!FILMS.length) {
      wall.append(emptyBlock());
      selectedId = selected;
      paint();
      refreshEmpty();
      return;
    }
    filmGroups().forEach((group) => {
      const bar = document.createElement('div');
      bar.className = 'genre-bar';
      bar.dataset.ids = group.films.map((film) => film.id).join(',');
      bar.append(el('span', 'genre-name', group.label), el('span', 'genre-count', ''), el('span', 'genre-score', ''));
      wall.append(bar);
      group.films.forEach((film) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'poster';
        button.dataset.id = film.id;
        const image = document.createElement('img');
        image.alt = '';
        image.draggable = false;
        image.decoding = 'async';
        image.src = posterSrc(film);
        const tint = document.createElement('span');
        tint.className = 'tint';
        const score = document.createElement('span');
        score.className = 'poster-score';
        button.append(image, tint, score);
        button.addEventListener('click', () => choose(film));
        wall.append(button);
      });
    });
    selectedId = selected;
    paint();
  }

  function choose(film) {
    const now = performance.now();
    const again = film.id === lastTapId && now - lastTapAt < 340;
    lastTapAt = now;
    lastTapId = film.id;
    if (again) {
      writeEntry(film.id, { watched: true });
      if (mode === 'network') {
        if (selectedId !== film.id) openFilm(film, false);
        else paint();
        return;
      }
      if (!ratingView) buildWall();
      if (selectedId !== film.id) openFilm(film, false);
      else paint();
      return;
    }
    if (selectedId === film.id) {
      clearSelection();
      return;
    }
    openFilm(film, false);
  }

  function filmsWith(kind, value) {
    return similarityFilms().filter((film) => {
      if (kind === 'genre') return (film.genres || []).includes(value);
      if (kind === 'subgenre') return (film.subgenres || []).includes(value);
      if (kind === 'theme') return (film.themes || []).includes(value);
      if (kind === 'tone') return (film.tone || []).includes(value);
      if (kind === 'narrative') return (film.narrative || []).includes(value);
      if (kind === 'intensity') return film.intensity === value;
      if (kind === 'epoch') return film.epoch === value;
      if (kind === 'place') return film.place === value;
      if (kind === 'director') return film.director === value;
      if (kind === 'cast') return (film.cast || []).includes(value);
      return false;
    }).map((film) => film.id);
  }

  function renderBar() {
    const bar = document.getElementById('net-bar');
    if (!bar) return;
    if (!spotlight) {
      bar.hidden = true;
      bar.replaceChildren();
      return;
    }
    const count = spotlight.ids.length;
    bar.replaceChildren();
    bar.append(el('span', null, `${spotlight.title} · ${count === 1 ? '1 Film' : `${count} Filme`}`));
    const close = el('button', null, '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Hervorhebung beenden');
    close.addEventListener('click', clearHighlight);
    bar.append(close);
    bar.hidden = false;
  }

  function applyNetworkFocus() {
    if (!network) return;
    if (spotlight) {
      network.setFocus({
        lit: spotlight.ids,
        star: true,
        style: spotlight.style,
      });
      return;
    }
    if (mode === 'network' && selectedId) {
      network.setFocus({
        lit: [selectedId].concat(links.slice(0, 8).map((link) => link.id)),
        edges: links.slice(0, 8).map((link) => ({
          source: selectedId,
          target: link.id,
          score: link.score,
          style: lineStyle(link.reasons),
        })),
        hot: activeLinkId,
      });
      return;
    }
    network.setFocus(null);
  }

  function clearHighlight() {
    spotlight = null;
    renderBar();
    applyNetworkFocus();
  }

  async function highlight(spec) {
    const ids = (spec.ids || []).filter((id) => byId.has(id));
    if (!ids.length) return;
    spotlight = { title: spec.title, ids, style: spec.style || 'content' };
    renderBar();
    if (mode !== 'network') await setMode('network');
    applyNetworkFocus();
    if (network) network.frame(ids);
  }

  function openFilm(film, focus) {
    if (spotlight) {
      spotlight = null;
      renderBar();
    }
    selectedId = film.id;
    links = linksFor(film);
    activeLinkId = (links.find((link) => link.group) || links[0] || {}).id || null;
    renderPanel(film);
    applyNetworkFocus();
    paint();
    if (mode === 'network' && network) {
      const ids = focus === 'near'
        ? [film.id]
        : [film.id].concat(links.slice(0, 8).map((link) => link.id));
      const minScale = focus === 'near' ? network.nearScale() : 0;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => network.frame(ids, { minScale }));
      });
      return;
    }
    if (focus) {
      wall.querySelector(`[data-id="${film.id}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }

  function setActiveLink(id) {
    if (!id || id === activeLinkId || !links.some((link) => link.id === id)) return;
    activeLinkId = id;
    panel.querySelectorAll('.link').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.id === id);
    });
    if (mode === 'network') applyNetworkFocus();
  }

  function clearSelection() {
    panelFilm = null;
    selectedId = null;
    links = [];
    activeLinkId = null;
    panel.hidden = true;
    panel.replaceChildren();
    applyNetworkFocus();
    paint();
    if (mode === 'network' && network) requestAnimationFrame(() => network.resize());
  }

  function paint() {
    document.body.classList.toggle('has-selection', Boolean(selectedId));
    document.body.classList.toggle('is-rating', ratingView);
    wall.querySelectorAll('.poster').forEach((button) => {
      const row = entry(button.dataset.id);
      const selected = button.dataset.id === selectedId;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-rated', row.rating != null);
      button.classList.toggle('is-favorite', row.favorite);
      button.classList.toggle('is-next', row.next);
      const tint = button.querySelector('.tint');
      tint.style.background = row.rating == null ? '' : ratingColor(row.rating);
      button.querySelector('.poster-score').textContent = row.rating == null
        ? ''
        : `★  ${row.rating.toFixed(1).replace('.', ',')}`;
    });
    document.querySelectorAll('.their-wall .poster').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.id === selectedId);
    });
    wall.querySelectorAll('.genre-bar').forEach((bar) => {
      const films = bar.dataset.ids.split(',').filter(Boolean).map((id) => byId.get(id)).filter(Boolean);
      const avg = myAverage(films);
      bar.querySelector('.genre-score').textContent = avg == null ? '' : `★  ${avg.toFixed(1).replace('.', ',')}`;
      bar.querySelector('.genre-count').textContent = films.length === 1 ? '1 Film' : `${films.length} Filme`;
    });
    if (network) network.paint();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatScore(value) {
    if (value == null || Number.isNaN(value)) return '–';
    return value.toFixed(1).replace('.', ',');
  }

  function toggle(text, pressed, onChange) {
    const button = el('button', 'toggle', text);
    button.type = 'button';
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    button.addEventListener('click', () => onChange(!pressed));
    return button;
  }

  function renderPanel(film) {
    panelFilm = film;
    const row = entry(film.id);
    const mine = byId.has(film.id);
    panel.replaceChildren();
    panel.hidden = false;

    const remove = el('button', 'remove-film');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Aus meinem Archiv entfernen');
    remove.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.4h6v2.2H9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3.8 6.4h16.4v2.1H3.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.6 8.5h12.8l-.9 12.1H6.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11.4v6.2M12 11.4v6.2M15 11.4v6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    remove.addEventListener('click', () => removeFilm(film.id));
    const closeIcon = el('button', 'panel-close');
    closeIcon.type = 'button';
    closeIcon.setAttribute('aria-label', 'Schließen');
    closeIcon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    closeIcon.addEventListener('click', clearSelection);
    const tools = el('div', 'panel-tools');
    tools.append(closeIcon);
    panel.append(tools);

    const full = fullOf(film);
    const head = el('div', 'panel-head');
    head.append(el('h1', null, film.title));
    if (needsProfile() && globalThis.Store && globalThis.Store.syncable && !globalThis.Store.syncable(film.id)) {
      head.append(el('p', 'unsynced', 'nicht synchronisiert'));
    }
    if (film.year) head.append(el('p', 'sub', film.year));
    if (full.director) {
      const director = el('button', 'credit credit-link', `Regie ${full.director}`);
      director.type = 'button';
      director.addEventListener('click', () => highlight({
        title: `Regie: ${full.director}`,
        style: 'director',
        ids: filmsWith('director', full.director),
      }));
      head.append(director);
    }
    const names = (full.cast || []).slice(0, 3);
    if (names.length) {
      const row = el('div', 'cast-row');
      names.forEach((name) => {
        const person = el('button', 'cast-link', name);
        person.type = 'button';
        person.addEventListener('click', () => highlight({
          title: `Mit: ${name}`,
          style: 'cast',
          ids: filmsWith('cast', name),
        }));
        row.append(person);
      });
      head.append(row);
    }
    const imdb = el('p', 'imdb-line');
    imdb.append(el('span', 'star', '★'), el('span', null, film.imdbLabel));
    head.append(imdb);
    const genreRow = el('div', 'genre-row');
    if ((film.genres || []).length) {
      const pills = el('ul', 'pills');
      film.genres.forEach((genre) => pills.append(el('li', null, genre)));
      genreRow.append(pills);
    }
    if (mine) genreRow.append(remove);
    head.append(genreRow);
    panel.append(head);
    const followed = el('div', 'followed-row');
    followed.hidden = true;
    panel.append(followed);
    fillFollowed(film.id, followed);
    const wishSlot = el('div', 'wish-slot');
    panel.append(wishSlot);
    paintWishSlot(wishSlot, film);
    if (!mine) {
      const addMine = el('button', 'text-line', 'Zu meinem Archiv hinzufügen');
      addMine.type = 'button';
      addMine.addEventListener('click', () => addForeignFilm(film));
      panel.append(addMine);
    }

    const field = el('div', 'block');
    const rateLabel = el('label', null, 'Bewertung');
    rateLabel.htmlFor = 'own-rate';
    const rateRow = el('div', 'rate-row');
    const range = document.createElement('input');
    range.id = 'own-rate';
    range.className = 'rate';
    range.type = 'range';
    range.min = '0';
    range.max = '10';
    range.step = '0.1';
    range.value = row.rating == null ? '0' : String(row.rating);
    const value = el('output', 'rate-value', formatScore(row.rating));
    value.htmlFor = 'own-rate';
    range.addEventListener('input', () => {
      const next = Math.round(Number(range.value) * 10) / 10;
      const rating = next > 0 ? next : null;
      const previous = entry(film.id).rating;
      value.textContent = formatScore(rating);
      writeEntry(film.id, { rating });
      if (ratingView && ratingBucket(previous) !== ratingBucket(rating)) {
        buildWall();
        wall.querySelector(`[data-id="${film.id}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
      } else {
        paint();
      }
    });
    rateRow.append(range, value);
    const memoLabel = el('label', null, 'Notiz');
    memoLabel.htmlFor = 'own-memo';
    memoLabel.style.marginTop = '16px';
    const memo = document.createElement('textarea');
    memo.id = 'own-memo';
    memo.className = 'memo';
    memo.maxLength = 500;
    memo.value = row.memo;
    memo.addEventListener('input', () => writeEntry(film.id, { memo: memo.value }));
    field.append(rateLabel, rateRow, memoLabel, memo);
    panel.append(field);

    const toggles = el('div', 'toggles block');
    toggles.append(
      toggle('Gesehen', row.watched, (on) => {
        writeEntry(film.id, { watched: on });
        if (mode !== 'network' && !ratingView) buildWall();
        renderPanel(film);
        paint();
      }),
      toggle('Favorit', row.favorite, (on) => {
        writeEntry(film.id, { favorite: on });
        renderPanel(film);
        paint();
      }),
      toggle('Als Nächstes', row.next, (on) => {
        writeEntry(film.id, { next: on });
        renderPanel(film);
        paint();
      }),
    );
    panel.append(toggles);
    appendTraits(film, full);

    [
      'Gleiche Handschrift',
      'Ähnliche Geschichte',
      'Ähnliche Stimmung',
      'Gleiche Welt',
    ].forEach((name) => {
      const items = links.filter((link) => link.group === name).slice(0, 6);
      if (!items.length) return;
      const group = el('section', 'group');
      group.append(el('h2', null, name));
      items.forEach((link) => {
        const other = byId.get(link.id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'link';
        button.dataset.id = other.id;
        if (other.id === activeLinkId) button.classList.add('is-active');
        button.append(
          el('span', 'link-title', other.title),
          el('span', 'link-meta', link.reason),
        );
        button.addEventListener('pointerenter', (event) => {
          if (event.pointerType === 'touch') return;
          setActiveLink(other.id);
        });
        button.addEventListener('click', () => openFilm(other, true));
        group.append(button);
      });
      panel.append(group);
    });

  }

  const TRAIT_FIELDS = [
    ['genres', 'Genre', 'genre', 3],
    ['subgenres', 'Subgenre', 'subgenre', 2],
    ['themes', 'Thema', 'theme', 4],
    ['tone', 'Ton', 'tone', 2],
    ['narrative', 'Erzählweise', 'narrative', 2],
  ];

  function traitChip(label, value, kind) {
    const button = el('button', 'chip');
    button.type = 'button';
    button.append(el('small', null, label), el('span', null, value));
    button.addEventListener('click', () => highlight({
      title: `${label}: ${value}`,
      style: 'content',
      ids: filmsWith(kind, value),
    }));
    return button;
  }

  function missingChip(label) {
    const node = el('span', 'chip is-missing');
    node.append(el('small', null, label), el('span', null, 'fehlt'));
    return node;
  }

  function draftFrom(full) {
    return {
      genres: (full.genres || []).slice(0, 3),
      subgenres: (full.subgenres || []).slice(0, 2),
      themes: (full.themes || []).slice(0, 4),
      tone: (full.tone || []).slice(0, 2),
      narrative: (full.narrative || []).slice(0, 2),
      intensity: typeof full.intensity === 'number' ? full.intensity : null,
      epoch: full.epoch || '',
      place: full.place || '',
    };
  }

  function traitOptions(field) {
    const vocab = vocabulary || {};
    if (field === 'subgenres') {
      const groups = vocab.subgenres || {};
      const list = [];
      (editDraft.genres || []).forEach((parent) => {
        (groups[parent] || []).forEach((name) => {
          if (!list.includes(name)) list.push(name);
        });
      });
      (editDraft.subgenres || []).forEach((name) => {
        if (!list.includes(name)) list.push(name);
      });
      return list;
    }
    return (vocab[field] || []).slice();
  }

  function pruneSubgenres() {
    const allowed = new Set(traitOptions('subgenres'));
    editDraft.subgenres = editDraft.subgenres.filter((name) => allowed.has(name)).slice(0, 2);
  }

  function toggleTrait(field, value, limit) {
    const list = editDraft[field];
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
    else if (list.length < limit) list.push(value);
    if (field === 'genres') pruneSubgenres();
  }

  function beginEdit(film) {
    ensureVocab().then(() => {
      editDraft = { id: film.id, ...draftFrom(fullOf(film)) };
      renderPanel(film);
    }).catch(() => {
      /* das Vokabular bleibt weg, der Blick auf die Merkmale auch */
    });
  }

  function saveDraft(film) {
    const current = (globalThis.FILM_FACETS || {})[film.id] || {};
    const validate = globalThis.Facets && globalThis.Facets.validateFacets;
    if (!validate || !vocabulary) return;
    pruneSubgenres();
    const raw = {
      ...current,
      genres: editDraft.genres,
      subgenres: editDraft.subgenres,
      themes: editDraft.themes,
      tone: editDraft.tone,
      narrative: editDraft.narrative,
      intensity: editDraft.intensity,
      epoch: editDraft.epoch || null,
      place: editDraft.place || null,
      source: 'manuell',
      reviewed: true,
    };
    const cleaned = validate(raw, vocabulary).facets;
    cleaned.source = 'manuell';
    cleaned.reviewed = true;
    facetOverrides[film.id] = cleaned;
    saveFacetOverrides();
    if (!globalThis.FILM_FACETS) globalThis.FILM_FACETS = {};
    globalThis.FILM_FACETS[film.id] = cleaned;
    patchFilmFromFacets(film);
    const index = added.findIndex((item) => item.id === film.id);
    if (index >= 0) {
      added[index] = {
        ...added[index],
        genres: film.genres,
        cluster: film.cluster,
        director: film.director,
      };
      persist();
    }
    editDraft = null;
    links = linksFor(film);
    activeLinkId = (links.find((link) => link.group) || links[0] || {}).id || null;
    scheduleRelayout();
    renderPanel(film);
    applyNetworkFocus();
    paint();
    if (mode === 'network' && network) {
      requestAnimationFrame(() => network.frame([film.id]));
    } else {
      buildWall();
    }
  }

  function facetEditor(field, label, limit) {
    const block = el('div', 'facet-block');
    block.append(el('p', 'facet-label', label));
    const find = document.createElement('input');
    find.type = 'search';
    find.className = 'facet-find';
    find.placeholder = 'Suchen';
    find.setAttribute('aria-label', `${label} suchen`);
    find.autocomplete = 'off';
    const list = el('div', 'chips');
    const draw = () => {
      const query = find.value.trim().toLocaleLowerCase('de');
      list.replaceChildren();
      traitOptions(field).forEach((name) => {
        const selected = editDraft[field].includes(name);
        if (query && !selected && !name.toLocaleLowerCase('de').includes(query)) return;
        const button = el('button', selected ? 'chip is-on' : 'chip', name);
        button.type = 'button';
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        button.disabled = !selected && editDraft[field].length >= limit;
        button.addEventListener('click', () => {
          toggleTrait(field, name, limit);
          if (field === 'genres') {
            const current = byId.get(editDraft.id);
            if (current) renderPanel(current);
            return;
          }
          draw();
        });
        list.append(button);
      });
    };
    find.addEventListener('input', draw);
    block.append(find, list);
    draw();
    return block;
  }

  function choiceEditor(label, field, options) {
    const block = el('label', 'facet-block');
    block.append(el('span', 'facet-label', label));
    const select = document.createElement('select');
    select.append(new Option('fehlt', ''));
    options.forEach((name) => select.append(new Option(name, name)));
    select.value = editDraft[field] || '';
    select.addEventListener('change', () => {
      editDraft[field] = select.value;
    });
    block.append(select);
    return block;
  }

  function intensityEditor() {
    const block = el('div', 'facet-block');
    block.append(el('p', 'facet-label', 'Intensität'));
    const row = el('div', 'chips');
    for (let mark = 1; mark <= 5; mark += 1) {
      const button = el('button', editDraft.intensity === mark ? 'chip is-on' : 'chip', String(mark));
      button.type = 'button';
      button.setAttribute('aria-label', `Intensität ${mark} von 5`);
      button.setAttribute('aria-pressed', editDraft.intensity === mark ? 'true' : 'false');
      button.addEventListener('click', () => {
        editDraft.intensity = editDraft.intensity === mark ? null : mark;
        const current = byId.get(editDraft.id);
        if (current) renderPanel(current);
      });
      row.append(button);
    }
    block.append(row);
    return block;
  }

  function traitEditor(film) {
    const form = el('div', 'trait-edit');
    TRAIT_FIELDS.forEach(([field, label, , limit]) => {
      form.append(facetEditor(field, label, limit));
    });
    form.append(intensityEditor());
    form.append(choiceEditor('Epoche', 'epoch', (vocabulary && vocabulary.epoch) || []));
    form.append(choiceEditor('Ort', 'place', (vocabulary && vocabulary.place) || []));
    const actions = el('div', 'trait-actions');
    const save = el('button', 'text-button', 'Speichern');
    save.type = 'button';
    save.addEventListener('click', () => saveDraft(film));
    const cancel = el('button', 'text-button', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      editDraft = null;
      renderPanel(film);
    });
    actions.append(save, cancel);
    form.append(actions);
    return form;
  }

  function traitView(full) {
    const list = el('div', 'chips');
    TRAIT_FIELDS.forEach(([field, label, kind]) => {
      const values = full[field] || [];
      if (!values.length) {
        list.append(missingChip(label));
        return;
      }
      values.forEach((value) => list.append(traitChip(label, value, kind)));
    });
    if (typeof full.intensity === 'number' && full.intensity > 0) {
      const button = el('button', 'chip');
      button.type = 'button';
      button.setAttribute('aria-label', `Intensität ${full.intensity} von 5`);
      const dots = el('span', 'dots');
      dots.setAttribute('aria-hidden', 'true');
      for (let mark = 1; mark <= 5; mark += 1) dots.append(el('span', mark <= full.intensity ? 'on' : ''));
      button.append(el('small', null, 'Intensität'), dots);
      button.addEventListener('click', () => highlight({
        title: `Intensität: ${full.intensity}`,
        style: 'content',
        ids: filmsWith('intensity', full.intensity),
      }));
      list.append(button);
    } else {
      list.append(missingChip('Intensität'));
    }
    if (full.epoch) list.append(traitChip('Epoche', full.epoch, 'epoch'));
    else list.append(missingChip('Epoche'));
    if (full.place) list.append(traitChip('Ort', full.place, 'place'));
    else list.append(missingChip('Ort'));
    return list;
  }

  function appendTraits(film, full) {
    const editing = editDraft && editDraft.id === film.id;
    const section = el('section', 'group');
    const heading = el('div', 'trait-head');
    heading.append(el('h2', null, 'Merkmale'));
    section.append(heading);
    section.append(editing ? traitEditor(film) : traitView(full));
    panel.append(section);
  }

  function savedMode() {
    try {
      const raw = localStorage.getItem(MODE_KEY);
      if (raw === 'director' || raw === 'rating' || raw === 'network' || raw === 'profile') return raw;
    } catch {
      /* private mode can refuse storage */
    }
    return 'network';
  }

  function rememberMode(next) {
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* private mode can refuse storage; the session still works */
    }
  }

  function ensureNetwork() {
    if (network) return network;
    network = globalThis.Network.create({
      stage: networkEl,
      films: FILMS,
      posterSrc,
      ratingColor,
      entry,
      selectedId: () => selectedId,
      onChoose: choose,
    });
    return network;
  }

  async function showNetwork() {
    wall.hidden = true;
    networkEl.hidden = false;
    document.body.classList.add('is-network');
    const view = ensureNetwork();
    view.setFilms(FILMS);
    if (!networkReady) {
      try {
        const response = await fetch('data/graph.json');
        const graph = mappedGraph(response.ok ? await response.json() : { nodes: [] });
        rememberGraph(graph);
        view.loadGraph(graph);
      } catch {
        view.loadGraph({ nodes: [] });
      }
      view.build();
      networkReady = true;
      pendingGlide = false;
      applyNetworkFocus();
      refreshEmpty();
      return;
    }
    view.paint();
    view.resize();
    if (pendingGlide) {
      pendingGlide = false;
      view.glide(archive.positions);
    }
    applyNetworkFocus();
    refreshEmpty();
  }

  function showWall() {
    networkEl.hidden = true;
    wall.hidden = false;
    document.body.classList.remove('is-network');
    buildWall();
  }

  function setMode(next) {
    if (next !== 'profile' && !started && account && !leaving) {
      openSheet(gateView());
      return Promise.resolve();
    }
    if (next !== 'network') {
      spotlight = null;
      renderBar();
      const pop = document.getElementById('compare-pop');
      if (pop) pop.hidden = true;
      if (netCompare) netCompare.setAttribute('aria-expanded', 'false');
    }
    mode = next;
    ratingView = next === 'rating';
    rememberMode(next);
    modeNetwork.setAttribute('aria-selected', next === 'network' ? 'true' : 'false');
    modeDirector.setAttribute('aria-selected', next === 'director' ? 'true' : 'false');
    modeRating.setAttribute('aria-selected', next === 'rating' ? 'true' : 'false');
    if (modeProfile) modeProfile.setAttribute('aria-selected', next === 'profile' ? 'true' : 'false');
    const profile = document.getElementById('profile');
    if (profile) profile.hidden = next !== 'profile';
    document.body.classList.toggle('is-profile', next === 'profile');
    document.body.classList.toggle('is-rating', ratingView);
    if (next === 'profile') {
      networkEl.hidden = true;
      wall.hidden = true;
      document.body.classList.remove('is-network');
      if (skipProfileHome) skipProfileHome = false;
      else renderProfile();
      return Promise.resolve();
    }
    if (next === 'network') {
      const shown = showNetwork();
      if (relayoutTimer || relayoutIdle || relayoutWait) flushRelayout();
      return shown;
    }
    showWall();
    return Promise.resolve();
  }

  function showResults(query) {
    const q = query.trim().toLowerCase();
    results.replaceChildren();
    if (!q) {
      results.hidden = true;
      return;
    }
    const roster = similarityFilms();
    const people = [];
    const seen = new Set();
    roster.forEach((film) => {
      if (film.director && film.director.toLowerCase().includes(q) && !seen.has(`director:${film.director}`)) {
        seen.add(`director:${film.director}`);
        people.push({ kind: 'director', name: film.director });
      }
      (film.cast || []).forEach((name) => {
        if (!name || !name.toLowerCase().includes(q) || seen.has(`cast:${name}`)) return;
        seen.add(`cast:${name}`);
        people.push({ kind: 'cast', name });
      });
    });
    people.sort((a, b) => a.name.localeCompare(b.name, 'de')).slice(0, 4).forEach((person) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.append(document.createTextNode(person.name), el('small', null, person.kind === 'director' ? 'Regie' : 'Darsteller'));
      button.addEventListener('click', () => {
        search.value = person.name;
        results.hidden = true;
        highlight({
          title: person.kind === 'director' ? `Regie: ${person.name}` : `Mit: ${person.name}`,
          style: person.kind === 'director' ? 'director' : 'cast',
          ids: filmsWith(person.kind, person.name),
        });
      });
      item.append(button);
      results.append(item);
    });
    const hits = roster.filter((film) => (
      `${film.title || ''} ${film.original || ''} ${film.director || ''} ${(film.cast || []).join(' ')}`.toLowerCase().includes(q)
    )).slice(0, 8);
    hits.forEach((film) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = film.title;
      button.addEventListener('click', () => {
        search.value = film.title;
        results.hidden = true;
        openFromSearch(byId.get(film.id) || film);
      });
      item.append(button);
      results.append(item);
    });
    results.hidden = results.childElementCount === 0;
  }

  async function openFromSearch(film) {
    if (!film) return;
    if (mode !== 'network') await setMode('network');
    openFilm(film, 'near');
  }

  async function readPosters() {
    try {
      const res = await fetch('/api/posters');
      if (res.ok) {
        const data = await res.json();
        if (data.posters && Object.keys(data.posters).length) return data;
      }
    } catch {
      /* a static host has no API */
    }
    try {
      const res = await fetch('data/posters.json');
      if (!res.ok) return null;
      return { posters: await res.json(), done: true, configured: false };
    } catch {
      return null;
    }
  }

  async function loadPosters() {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const data = await readPosters();
      if (!data) return;
      let changed = false;
      Object.entries(data.posters || {}).forEach(([rawId, url]) => {
        if (typeof url !== 'string' || !url) return;
        const keyOf = globalThis.Store && globalThis.Store.filmKey;
        const facets = (globalThis.FILM_FACETS || {})[rawId];
        const mapped = idMap.get(rawId)
          || (keyOf && facets ? keyOf({ id: rawId, tmdbId: facets.tmdbId, tmdbType: facets.tmdbType }) : null)
          || rawId;
        [rawId, mapped].forEach((id) => {
          if (posters.get(id) === url) return;
          posters.set(id, url);
          const film = byId.get(id);
          if (film && !film.poster) film.poster = url;
          const image = wall.querySelector(`[data-id="${CSS.escape(id)}"] img`);
          if (image) image.src = url;
          changed = true;
        });
      });
      if (changed && network) network.paint();
      if (data.done || data.configured === false) return;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  document.getElementById('net-bar').addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  modeNetwork.addEventListener('click', () => setMode('network'));
  modeDirector.addEventListener('click', () => setMode('director'));
  modeRating.addEventListener('click', () => setMode('rating'));
  if (modeProfile) modeProfile.addEventListener('click', () => setMode('profile'));
  netRating.addEventListener('click', () => {
    netRatingOn = !netRatingOn;
    netRating.setAttribute('aria-pressed', netRatingOn ? 'true' : 'false');
    if (network) network.setRating(netRatingOn);
  });
  if (netCompare) {
    netCompare.addEventListener('click', (event) => {
      event.stopPropagation();
      const pop = document.getElementById('compare-pop');
      if (!pop) return;
      if (!pop.hidden) {
        pop.hidden = true;
        netCompare.setAttribute('aria-expanded', 'false');
        return;
      }
      openCompareMenu();
    });
  }
  const compareBar = document.getElementById('compare-bar');
  if (compareBar) {
    compareBar.querySelector('button').addEventListener('click', () => stopCompare());
  }

  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const first = results.querySelector('button');
    if (first) first.click();
  });
  search.addEventListener('input', () => showResults(search.value));
  panel.addEventListener('scroll', () => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const buttons = [...panel.querySelectorAll('.link')];
    if (!buttons.length) return;
    const frame = panel.getBoundingClientRect();
    const focus = frame.top + frame.height * 0.42;
    let best = null;
    let bestDist = Infinity;
    buttons.forEach((button) => {
      const rect = button.getBoundingClientRect();
      if (rect.bottom < frame.top || rect.top > frame.bottom) return;
      const dist = Math.abs((rect.top + rect.bottom) / 2 - focus);
      if (dist < bestDist) {
        bestDist = dist;
        best = button;
      }
    });
    if (best) setActiveLink(best.dataset.id);
  }, { passive: true });
  const addButton = document.getElementById('add-film');
  const addFilm = document.querySelector('.add-film');
  const addForm = document.getElementById('add-form');
  const addQuery = document.getElementById('add-query');
  const addStatus = document.getElementById('add-status');
  const searchForm = document.getElementById('search-form');
  const searchOpen = document.getElementById('search-open');

  function closeAdd() {
    addFilm.classList.remove('is-open');
    addButton.setAttribute('aria-expanded', 'false');
    addQuery.disabled = true;
    addStatus.textContent = '';
  }

  function openAdd() {
    closeSearch();
    addQuery.disabled = false;
    addFilm.classList.add('is-open');
    addButton.setAttribute('aria-expanded', 'true');
    addQuery.focus();
  }

  function closeSearch() {
    searchForm.classList.remove('is-open');
    searchOpen.setAttribute('aria-expanded', 'false');
    results.hidden = true;
    search.value = '';
    search.disabled = true;
  }

  function openSearch() {
    closeAdd();
    search.disabled = false;
    searchForm.classList.add('is-open');
    searchOpen.setAttribute('aria-expanded', 'true');
    search.focus();
  }

  function normTitle(value) {
    return String(value || '').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');
  }

  function yearOf(film) {
    if (typeof film.yearNum === 'number' && Number.isFinite(film.yearNum)) return film.yearNum;
    const year = Number(String(film.year || '').slice(0, 4));
    return Number.isFinite(year) ? year : null;
  }

  function identityOf(film) {
    const facets = (globalThis.FILM_FACETS || {})[film.id] || {};
    const imdb = String(facets.imdbId || '').toLowerCase();
    return {
      imdb: imdb || (/^tt\d+$/i.test(film.id) ? film.id.toLowerCase() : ''),
      tmdb: facets.tmdbId == null || facets.tmdbId === '' ? null : Number(facets.tmdbId),
      titles: [film.title, film.original].map(normTitle).filter(Boolean),
      year: yearOf(film),
    };
  }

  function findExisting(film, facets) {
    const incoming = {
      imdb: String(facets.imdbId || '').toLowerCase(),
      tmdb: facets.tmdbId == null || facets.tmdbId === '' ? null : Number(facets.tmdbId),
      titles: [film.title, film.original].map(normTitle).filter(Boolean),
      year: yearOf(film),
    };
    const pool = new Map();
    if (!archive || archive.startList !== 'leer') {
      (window.FILMS || []).forEach((item) => pool.set(item.id, item));
      starterAdded.forEach((item) => pool.set(item.id, item));
    }
    FILMS.forEach((item) => pool.set(item.id, item));
    added.forEach((item) => pool.set(item.id, item));
    for (const item of pool.values()) {
      const known = identityOf(item);
      if (incoming.tmdb && known.tmdb && incoming.tmdb === known.tmdb) return item;
      if (incoming.imdb && known.imdb && incoming.imdb === known.imdb) return item;
      const idsDisagree = (incoming.tmdb && known.tmdb && incoming.tmdb !== known.tmdb)
        || (incoming.imdb && known.imdb && incoming.imdb !== known.imdb);
      if (idsDisagree) continue;
      const sameName = incoming.titles.some((title) => known.titles.includes(title));
      if (sameName && incoming.year && known.year && incoming.year === known.year) return item;
    }
    return null;
  }

  function adopt(film) {
    if (removed.delete(film.id)) saveRemoved();
    if (byId.has(film.id)) return byId.get(film.id);
    const stored = added.find((item) => item.id === film.id) || film;
    FILMS.push(stored);
    byId.set(stored.id, stored);
    if (stored.poster) posters.set(stored.id, stored.poster);
    return stored;
  }

  async function revealFilm(film) {
    if (mode !== 'network') await setMode('network');
    if (network) {
      network.setFilms(FILMS);
      network.addFilm(film);
    }
    openFilm(film, 'near');
  }

  function rememberFacets(id, facets) {
    facetOverrides[id] = facets;
    saveFacetOverrides();
    if (!globalThis.FILM_FACETS) globalThis.FILM_FACETS = {};
    globalThis.FILM_FACETS[id] = facets;
  }

  function withCanonicalId(film, facets) {
    const keyOf = globalThis.Store && globalThis.Store.filmKey;
    if (!keyOf || !film) return film;
    const next = keyOf({
      ...film,
      tmdbId: film.tmdbId != null ? film.tmdbId : facets && facets.tmdbId,
      tmdbType: film.tmdbType || (facets && facets.tmdbType),
    });
    if (!next || next === film.id) return film;
    idMap.set(film.id, next);
    return { ...film, id: next };
  }

  function placeFilm(film, facets) {
    film = withCanonicalId(film, facets);
    const existing = findExisting(film, facets);
    if (existing) {
      addStatus.textContent = 'Den Film gibt es schon.';
      revealFilm(adopt(existing));
      return;
    }
    rememberFacets(film.id, facets);
    if (film.poster) posters.set(film.id, film.poster);
    added.push(film);
    persist();
    FILMS.push(film);
    byId.set(film.id, film);
    seatProvisional(film);
    const genre = (facets.genres || [])[0];
    const sub = (facets.subgenres || [])[0];
    if (genre && sub) addStatus.textContent = `Eingeordnet als ${genre} · ${sub}`;
    else if (genre) addStatus.textContent = `Eingeordnet als ${genre}`;
    else addStatus.textContent = 'Eingeordnet.';
    addQuery.value = '';
    revealFilm(film).then(() => scheduleRelayout());
  }

  addButton.addEventListener('click', () => {
    if (addFilm.classList.contains('is-open')) closeAdd();
    else openAdd();
  });

  searchOpen.addEventListener('click', () => {
    if (searchForm.classList.contains('is-open')) closeSearch();
    else openSearch();
  });

  document.addEventListener('pointerdown', (event) => {
    const pop = document.getElementById('compare-pop');
    if (pop && !pop.hidden && !pop.contains(event.target) && event.target !== netCompare) {
      pop.hidden = true;
      if (netCompare) netCompare.setAttribute('aria-expanded', 'false');
    }
    if (document.querySelector('header').contains(event.target)) return;
    if (addFilm.classList.contains('is-open')) closeAdd();
    if (searchForm.classList.contains('is-open')) closeSearch();
  }, true);

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = addQuery.value.trim();
    if (!query) {
      addStatus.textContent = 'Titel oder Link eintragen.';
      return;
    }
    addStatus.textContent = 'Ich hole Daten von TMDB …';
    addForm.querySelector('button[type=submit]').disabled = true;
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.film || !data?.facets) {
        addStatus.textContent = (data && data.error) || 'Dazu finde ich keinen Film.';
        return;
      }
      placeFilm(data.film, data.facets);
    } catch {
      addStatus.textContent = 'Der Abruf ist gerade nicht möglich.';
    } finally {
      addForm.querySelector('button[type=submit]').disabled = false;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (sheetOpen()) {
        if (importBusy) {
          requestCancel();
          return;
        }
        if (!archive) return;
        closeSheet();
        return;
      }
      if (searchForm.classList.contains('is-open')) {
        closeSearch();
        return;
      }
      if (editDraft) {
        const film = byId.get(editDraft.id);
        editDraft = null;
        if (film && selectedId === film.id) renderPanel(film);
        return;
      }
      if (addFilm.classList.contains('is-open')) {
        closeAdd();
        return;
      }
      if (spotlight) {
        clearHighlight();
        return;
      }
      clearSelection();
    }
  });
  window.addEventListener('resize', () => {
    if (mode === 'network' && network) network.resize();
  });

  function refreshPosterImages() {
    wall.querySelectorAll('[data-id] img').forEach((image) => {
      const holder = image.closest('[data-id]');
      const film = holder ? byId.get(holder.dataset.id) : null;
      if (!film) return;
      const src = posterSrc(film);
      if (src && image.src !== src && !src.startsWith('data:')) image.src = src;
    });
    if (network) network.paint();
  }

  async function loadStoredFacets() {
    try {
      const response = await fetch('data/facets.json');
      if (!response.ok) return;
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      overlayFacets(canonicalFacets(data));
      FILMS.forEach(patchFilmFromFacets);
      refreshPosterImages();
      if (network) network.refresh();
      if (!selectedId) return;
      const film = byId.get(selectedId);
      if (!film) return;
      links = linksFor(film);
      activeLinkId = (links.find((link) => link.group) || links[0] || {}).id || null;
      renderPanel(film);
      paint();
    } catch {
      /* ohne Facetten bleibt die Wand wie bisher */
    }
  }

  let importCancel = false;
  let importAbort = null;

  function requestCancel() {
    importCancel = true;
    if (importAbort) importAbort.abort();
  }

  function openSheet(node) {
    const sheet = document.getElementById('sheet');
    const body = document.getElementById('sheet-body');
    body.replaceChildren(node);
    sheet.hidden = false;
  }

  function closeSheet() {
    const sheet = document.getElementById('sheet');
    if (!sheet) return;
    sheet.hidden = true;
    document.getElementById('sheet-body').replaceChildren();
  }

  function sheetOpen() {
    const sheet = document.getElementById('sheet');
    return Boolean(sheet && !sheet.hidden);
  }

  function choiceButton(label) {
    const button = el('button', 'choice', label);
    button.type = 'button';
    return button;
  }

  function emptyBlock() {
    const box = document.createElement('div');
    box.className = 'empty';
    box.append(el('p', null, 'Dein Archiv ist noch leer.'));
    const add = choiceButton('Film hinzufügen');
    add.dataset.empty = 'add';
    const list = choiceButton('Liste einfügen');
    list.dataset.empty = 'list';
    box.append(add, list);
    return box;
  }

  function refreshEmpty() {
    const node = document.getElementById('empty-net');
    if (!node) return;
    node.hidden = FILMS.length > 0 || mode !== 'network';
  }

  function showRoster() {
    if (network && networkReady) {
      network.setFilms(FILMS);
      network.reflow();
    }
    if (mode === 'network') {
      if (!networkReady) showNetwork();
    } else buildWall();
    refreshEmpty();
  }

  function startApp() {
    if (started) {
      return Promise.resolve(showRoster()).then((value) => {
        queueInvite();
        loadWishlists();
        showWishHints();
        return value;
      });
    }
    started = true;
    const ready = setMode(savedMode());
    loadPosters();
    loadStoredFacets();
    ensureVocab().catch(() => {
      /* Bearbeiten holt das Vokabular erneut */
    });
    return Promise.resolve(ready).then((value) => {
      queueInvite();
      loadWishlists();
      showWishHints();
      return value;
    });
  }

  function gateView() {
    const box = document.createElement('div');
    box.append(el('h2', null, 'Womit willst du starten?'));
    const luciano = choiceButton('Mit Lucianos Liste starten');
    luciano.addEventListener('click', () => beginArchive('luciano'));
    const empty = choiceButton('Leer starten');
    empty.addEventListener('click', () => beginArchive('leer'));
    const own = choiceButton('Eigene Liste einfügen');
    own.addEventListener('click', () => openListImport({ gate: true }));
    box.append(luciano, empty, own);
    return box;
  }

  function beginArchive(kind) {
    adoptArchive(globalThis.Store.create(kind));
    closeSheet();
    startApp();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const source = String(text || '');
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quoted) {
        if (char === '"') {
          if (source[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else quoted = false;
        } else cell += char;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === ',') {
        row.push(cell);
        cell = '';
        continue;
      }
      if (char === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }
      if (char !== '\r') cell += char;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((line) => line.some((value) => String(value).trim()));
  }

  function queriesFromText(text) {
    return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function queriesFromCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return [];
    const header = rows[0].map((item) => item.trim().toLowerCase());
    const name = header.findIndex((item) => item === 'name' || item === 'title');
    if (name < 0) return queriesFromText(text);
    const year = header.findIndex((item) => item === 'year');
    return rows.slice(1).map((line) => {
      const title = String(line[name] || '').trim();
      if (!title) return '';
      const when = year >= 0 ? String(line[year] || '').trim() : '';
      return /^\d{4}$/.test(when) ? `${title} (${when})` : title;
    }).filter(Boolean);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function placeImported(film, facets) {
    film = withCanonicalId(film, facets);
    if (findExisting(film, facets) || byId.has(film.id)) return false;
    if (facets) rememberFacets(film.id, facets);
    if (film.poster) posters.set(film.id, film.poster);
    added.push(film);
    FILMS.push(film);
    byId.set(film.id, film);
    seatProvisional(film);
    persist();
    scheduleRelayout();
    return true;
  }

  async function fetchFilm(query, signal) {
    const response = await fetch(`/api/film?q=${encodeURIComponent(query)}`, { signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.film || !data.facets) {
      throw new Error((data && data.error) || 'Dazu finde ich keinen Film.');
    }
    return data;
  }

  async function importQueries(queries, onProgress) {
    const misses = [];
    let cursor = 0;
    let done = 0;
    let skipped = 0;
    let addedCount = 0;
    importAbort = new AbortController();
    const signal = importAbort.signal;
    async function worker() {
      while (!importCancel) {
        const index = cursor;
        cursor += 1;
        if (index >= queries.length) return;
        const query = queries[index];
        try {
          const data = await fetchFilm(query, signal);
          if (importCancel) return;
          if (placeImported(data.film, data.facets)) addedCount += 1;
          else skipped += 1;
        } catch (error) {
          if (!importCancel && !(error && error.name === 'AbortError')) {
            misses.push({
              query,
              message: error && error.message ? error.message : 'Der Abruf ist gerade nicht möglich.',
            });
          }
        }
        if (importCancel) return;
        done += 1;
        onProgress(done, queries.length);
      }
    }
    const width = Math.min(3, Math.max(queries.length, 1));
    await Promise.all(Array.from({ length: width }, () => worker()));
    return { misses, skipped, addedCount };
  }

  function canonicalFacets(data) {
    const next = {};
    const keyOf = globalThis.Store && globalThis.Store.filmKey;
    Object.entries(data || {}).forEach(([id, row]) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return;
      const key = keyOf ? keyOf({ id, tmdbId: row.tmdbId, tmdbType: row.tmdbType }) : id;
      if (key && key !== id) idMap.set(id, key);
      next[key || id] = row;
    });
    return next;
  }

  function rekeyFilm(film) {
    if (!film || !film.id) return;
    const keyOf = globalThis.Store && globalThis.Store.filmKey;
    const next = idMap.get(film.id) || (keyOf ? keyOf(film) : film.id);
    if (next && next !== film.id) {
      idMap.set(film.id, next);
      film.id = next;
    }
  }

  function mappedGraph(graph) {
    const nodes = (graph && graph.nodes || []).map((node) => ({
      ...node,
      id: idMap.get(node.id) || node.id,
    }));
    return { ...(graph || {}), nodes };
  }

  function rekeyGraphPoints() {
    if (!graphPoints) return;
    const next = {};
    Object.entries(graphPoints).forEach(([id, point]) => {
      next[idMap.get(id) || id] = point;
    });
    graphPoints = next;
  }

  function rememberGraph(graph) {
    if (!graphPoints) graphPoints = {};
    (graph && graph.nodes || []).forEach((node) => {
      const id = idMap.get(node.id) || node.id;
      if (Number.isFinite(node.x) && Number.isFinite(node.y)) graphPoints[id] = { x: node.x, y: node.y };
    });
  }

  async function ensureGraphPoints() {
    if (graphPoints) return graphPoints;
    graphPoints = {};
    try {
      const response = await fetch('data/graph.json');
      if (response.ok) rememberGraph(await response.json());
    } catch {
      /* ohne Startdatei bleiben nur die eigenen Positionen */
    }
    return graphPoints;
  }

  function positionMap() {
    const map = {};
    if (graphPoints) {
      Object.entries(graphPoints).forEach(([id, point]) => {
        map[id] = { x: point.x, y: point.y };
      });
    }
    if (archive && archive.positions) {
      Object.entries(archive.positions).forEach(([id, point]) => {
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) map[id] = { x: point.x, y: point.y };
      });
    }
    return map;
  }

  function seatProvisional(film) {
    if (!archive || !globalThis.Layout || !film) return;
    const current = archive.positions[film.id];
    if (current && Number.isFinite(current.x) && Number.isFinite(current.y)) return;
    const placed = globalThis.Layout.placeOne(fullOf(film), FILMS.map((item) => fullOf(item)), positionMap());
    archive.positions[film.id] = { x: placed.x, y: placed.y };
    persist();
  }

  function applyLayoutNodes(nodes) {
    if (!archive || !nodes) return;
    nodes.forEach((node) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
      archive.positions[node.id] = { x: node.x, y: node.y };
    });
    persist();
    if (network && networkReady && mode === 'network') network.glide(archive.positions);
    else if (network && networkReady) pendingGlide = true;
  }

  function ensureLayoutWorker() {
    if (relayoutWorker) return relayoutWorker;
    relayoutWorker = new Worker('layout.worker.js');
    relayoutWorker.onerror = () => {
      relayoutPending.forEach((resolve) => resolve());
      relayoutPending.clear();
    };
    relayoutWorker.onmessage = (event) => {
      const data = event.data || {};
      const resolve = relayoutPending.get(data.id);
      if (!resolve) return;
      relayoutPending.delete(data.id);
      if (data.id === relayoutJob && !relayoutDirty && data.nodes) applyLayoutNodes(data.nodes);
      resolve();
    };
    return relayoutWorker;
  }

  function startLayoutJob() {
    const id = relayoutJob + 1;
    relayoutJob = id;
    const films = FILMS.map((film) => fullOf(film));
    const positions = positionMap();
    return new Promise((resolve) => {
      relayoutPending.set(id, resolve);
      ensureLayoutWorker().postMessage({ id, films, positions });
    });
  }

  function runRelayout() {
    if (!archive || !FILMS.length || !globalThis.Layout) return Promise.resolve();
    if (relayoutWait) {
      relayoutDirty = true;
      return relayoutWait;
    }
    relayoutDirty = false;
    relayoutWait = ensureGraphPoints().then(() => startLayoutJob()).finally(() => {
      relayoutWait = null;
      if (!relayoutDirty) return null;
      relayoutDirty = false;
      return runRelayout();
    });
    return relayoutWait;
  }

  function cancelRelayoutIdle() {
    if (!relayoutIdle) return;
    if (relayoutIdleTimer) window.clearTimeout(relayoutIdle);
    else if (window.cancelIdleCallback) window.cancelIdleCallback(relayoutIdle);
    relayoutIdle = 0;
  }

  function deferRelayout() {
    relayoutTimer = 0;
    if (mode === 'network') {
      runRelayout();
      return;
    }
    cancelRelayoutIdle();
    if (window.requestIdleCallback) {
      relayoutIdleTimer = false;
      relayoutIdle = window.requestIdleCallback(() => {
        relayoutIdle = 0;
        runRelayout();
      });
      return;
    }
    relayoutIdleTimer = true;
    relayoutIdle = window.setTimeout(() => {
      relayoutIdle = 0;
      runRelayout();
    }, 400);
  }

  function scheduleRelayout() {
    if (!archive || !FILMS.length || !globalThis.Layout) return;
    window.clearTimeout(relayoutTimer);
    relayoutTimer = window.setTimeout(deferRelayout, 2000);
  }

  function flushRelayout() {
    const pending = relayoutTimer || relayoutIdle || relayoutWait;
    window.clearTimeout(relayoutTimer);
    relayoutTimer = 0;
    cancelRelayoutIdle();
    if (!pending) return Promise.resolve();
    return runRelayout();
  }

  function renderMisses(node, misses, status) {
    node.replaceChildren();
    if (!misses.length) return;
    node.append(el('h3', null, 'Nicht gefunden'));
    const again = choiceButton('nochmals suchen');
    again.addEventListener('click', async () => {
      const queries = [...node.querySelectorAll('.miss-row input')].map((input) => input.value.trim()).filter(Boolean);
      if (!queries.length) return;
      again.disabled = true;
      importCancel = false;
      importBusy = true;
      const result = await importQueries(queries, (done, total) => {
        status.textContent = `${done} / ${total}`;
      });
      importBusy = false;
      again.disabled = false;
      showRoster();
      renderMisses(node, result.misses, status);
      if (!result.misses.length) closeSheet();
    });
    const rows = misses.map((miss) => {
      const row = document.createElement('div');
      row.className = 'miss-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = miss.query;
      const search = document.createElement('button');
      search.type = 'button';
      search.textContent = 'suchen';
      const note = el('p', 'miss-note', miss.message);
      search.addEventListener('click', async () => {
        const query = input.value.trim();
        if (!query) return;
        search.disabled = true;
        try {
          const data = await fetchFilm(query);
          if (placeImported(data.film, data.facets)) {
            row.remove();
            showRoster();
            status.textContent = 'Abgelegt.';
          } else {
            note.textContent = 'Den Film gibt es schon.';
            row.remove();
          }
        } catch (error) {
          note.textContent = error && error.message ? error.message : 'Dazu finde ich keinen Film.';
        } finally {
          search.disabled = false;
        }
      });
      row.append(input, search, note);
      return row;
    });
    node.append(again, ...rows);
  }

  function openListImport(options) {
    const gate = Boolean(options && options.gate);
    const box = document.createElement('div');
    box.append(el('h2', null, 'Eigene Liste einfügen'));
    const field = document.createElement('textarea');
    field.placeholder = 'Ein Titel pro Zeile. Optional: Titel (Jahr) oder ein Link.';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.csv,text/csv';
    file.className = 'sr';
    const pick = choiceButton('CSV-Datei');
    let csvText = '';
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const chosen = file.files && file.files[0];
      if (!chosen) return;
      csvText = await readFile(chosen);
      pick.textContent = chosen.name;
    });
    const status = el('p', 'sheet-status', '');
    status.setAttribute('role', 'status');
    const go = choiceButton('Liste holen');
    const cancel = choiceButton(gate ? 'Zurück' : 'Abbrechen');
    const misses = document.createElement('div');
    box.append(field, pick, file, status, go, cancel, misses);
    openSheet(box);
    cancel.addEventListener('click', () => {
      if (importBusy) {
        requestCancel();
        cancel.disabled = true;
        status.textContent = 'Wird abgebrochen …';
        return;
      }
      if (gate && !archive) openSheet(gateView());
      else closeSheet();
    });
    go.addEventListener('click', async () => {
      const queries = csvText ? queriesFromCsv(csvText) : queriesFromText(field.value);
      if (!queries.length) {
        status.textContent = 'Trag mindestens einen Titel ein.';
        return;
      }
      if (!archive) adoptArchive(globalThis.Store.create('leer'));
      go.disabled = true;
      importCancel = false;
      importBusy = true;
      cancel.textContent = 'Abbrechen';
      const result = await importQueries(queries, (done, total) => {
        status.textContent = `${done} / ${total}`;
      });
      importBusy = false;
      cancel.disabled = false;
      cancel.textContent = 'Schließen';
      await startApp();
      showRoster();
      const parts = [];
      if (result.addedCount) parts.push(`${result.addedCount} hinzugefügt`);
      if (result.skipped) parts.push(`${result.skipped} übersprungen`);
      if (result.misses.length) parts.push(`${result.misses.length} nicht gefunden`);
      if (importCancel) parts.unshift('Abgebrochen');
      status.textContent = parts.join(', ') || 'Nichts Neues.';
      if (result.misses.length && !importCancel) renderMisses(misses, result.misses, status);
      else closeSheet();
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-empty]');
    if (!button) return;
    if (button.dataset.empty === 'add') openAdd();
    else openListImport();
  });

  function readyCloud() {
    if (globalThis.Cloud && globalThis.Cloud.ready) return Promise.resolve(globalThis.Cloud);
    return new Promise((resolve) => {
      window.addEventListener('cloud:ready', () => resolve(globalThis.Cloud), { once: true });
    });
  }

  function lockScreen() {
    document.documentElement.classList.add('needs-auth');
    const gate = document.getElementById('gate');
    if (gate) gate.hidden = false;
  }

  function unlockScreen() {
    document.documentElement.classList.remove('needs-auth');
    const gate = document.getElementById('gate');
    if (gate) gate.hidden = true;
  }

  function authText(error) {
    if (!error) return 'Keine Verbindung.';
    const message = String(error.message || error.error_description || error.msg || '');
    if (error.name === 'TypeError' || /failed to fetch|network|load failed/i.test(message)) return 'Keine Verbindung.';
    if (/vergeben|already registered|already been registered/i.test(message)) return 'Dieser Benutzername ist vergeben.';
    if (/invalid login|invalid credentials/i.test(message)) return 'Das Passwort ist falsch.';
    if (/at least|too short|weak password|zu kurz/i.test(message)) return 'Das Passwort ist zu kurz.';
    if (/Benutzername|Passwort|stimmen nicht|Verbindung|Zeichen|eingerichtet|ungültig|eintragen/.test(message)) return message;
    return 'Keine Verbindung.';
  }

  function authField(label, type, name, autocomplete) {
    const wrap = document.createElement('label');
    wrap.append(document.createTextNode(label));
    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.autocomplete = autocomplete;
    input.autocapitalize = 'none';
    input.spellcheck = false;
    wrap.append(input);
    return { wrap, input };
  }

  function countWord(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
  }

  function starterIds() {
    const ids = [];
    (window.FILMS || []).forEach((film) => { if (film && film.id) ids.push(film.id); });
    starterAdded.forEach((film) => { if (film && film.id && !ids.includes(film.id)) ids.push(film.id); });
    return ids;
  }

  function findFilmRecord(id) {
    return byId.get(id)
      || added.find((film) => film && film.id === id)
      || (archive && archive.added || []).find((film) => film && film.id === id)
      || (window.FILMS || []).find((film) => film && film.id === id)
      || starterAdded.find((film) => film && film.id === id)
      || null;
  }

  function catalogRow(id) {
    const film = findFilmRecord(id);
    if (!film || !film.title) return null;
    const base = (baseFacets && baseFacets[id])
      || (archive && archive.facetOverrides[id])
      || (globalThis.FILM_FACETS || {})[id]
      || null;
    const score = base && typeof base.tmdbRating === 'number' ? base.tmdbRating : null;
    const votes = base && typeof base.tmdbVotes === 'number' ? base.tmdbVotes : null;
    return {
      id,
      imdb_id: base && base.imdbId ? base.imdbId : null,
      title: film.title,
      original_title: film.original || null,
      year: film.year ? String(film.year) : null,
      kind: /^tmdb:tv:/.test(id) ? 'tv' : 'movie',
      poster: (base && base.poster) || film.poster || null,
      tmdb_rating: score,
      tmdb_votes: Number.isFinite(votes) ? votes : null,
      facets: base,
    };
  }

  async function recoveryEnabled() {
    if (recoveryOn != null) return recoveryOn;
    try {
      const response = await fetch('/api/recovery?action=status');
      const data = response.ok ? await response.json() : null;
      recoveryOn = Boolean(data && data.enabled);
    } catch {
      recoveryOn = false;
    }
    return recoveryOn;
  }

  function profileRoot() {
    return document.getElementById('profile');
  }

  function scoreText(value) {
    return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',');
  }

  function profileFail(error) {
    if (error && (error.name === 'TypeError' || /failed to fetch|network/i.test(String(error.message || '')))) {
      return 'Keine Verbindung.';
    }
    return 'Das Profil konnte nicht gespeichert werden.';
  }

  function pinsOf() {
    const raw = account && account.pinned_people;
    return {
      actors: raw && Array.isArray(raw.actors) ? raw.actors.filter((name) => typeof name === 'string').slice(0, 5) : [],
      directors: raw && Array.isArray(raw.directors) ? raw.directors.filter((name) => typeof name === 'string').slice(0, 5) : [],
    };
  }

  function defaultTopFilms() {
    return FILMS.filter((film) => entry(film.id).rating != null).sort((a, b) => {
      const diff = entry(b.id).rating - entry(a.id).rating;
      if (diff) return diff;
      return (Date.parse(entry(b.id).ratedAt) || 0) - (Date.parse(entry(a.id).ratedAt) || 0);
    }).slice(0, 5);
  }

  function shownTopFilms() {
    const custom = account && Array.isArray(account.top_films) ? account.top_films : [];
    if (!custom.length) return { custom: false, films: defaultTopFilms() };
    return { custom: true, films: custom.map((id) => byId.get(id)).filter(Boolean).slice(0, 5) };
  }

  function personMaps() {
    const actors = new Map();
    const directors = new Map();
    const add = (map, name, rating) => {
      const key = String(name || '').trim();
      if (!key) return;
      const row = map.get(key) || { name: key, sum: 0, count: 0 };
      row.sum += rating;
      row.count += 1;
      map.set(key, row);
    };
    FILMS.forEach((film) => {
      const row = entry(film.id);
      if (row.rating == null) return;
      const full = fullOf(film);
      (full.cast || []).forEach((name) => add(actors, name, row.rating));
      if (full.director) add(directors, full.director, row.rating);
    });
    return { actors, directors };
  }

  function rankedPeople(map, pinnedNames) {
    const pins = (pinnedNames || []).filter((name) => typeof name === 'string' && name).slice(0, 5);
    const ranked = [...map.values()]
      .filter((person) => person.count >= 2)
      .map((person) => ({ name: person.name, avg: person.sum / person.count, count: person.count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
    const shown = [];
    pins.forEach((name) => {
      if (shown.length >= 5) return;
      const known = map.get(name);
      shown.push({
        name,
        avg: known && known.count ? known.sum / known.count : 0,
        count: known ? known.count : 0,
        pinned: true,
      });
    });
    ranked.forEach((person) => {
      if (shown.length >= 5) return;
      if (shown.some((item) => item.name === person.name)) return;
      shown.push({ ...person, pinned: false });
    });
    return shown;
  }

  function statNode(value, label, onClick) {
    const node = document.createElement(onClick ? 'button' : 'div');
    if (onClick) node.type = 'button';
    node.className = 'profile-stat';
    const num = document.createElement('b');
    num.textContent = value;
    const caption = document.createElement('span');
    caption.textContent = label;
    node.append(num, caption);
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  function lineButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-line';
    button.textContent = label;
    return button;
  }

  async function refreshProfileDot() {
    const dot = modeProfile && modeProfile.querySelector('.profile-dot');
    if (!dot || !globalThis.Cloud || !globalThis.Cloud.client) return;
    try {
      const session = await globalThis.Cloud.getSession();
      const id = session && session.user && session.user.id;
      if (!id) return;
      const result = await globalThis.Cloud.client.from('follows')
        .select('follower', { count: 'exact', head: true })
        .eq('followee', id)
        .eq('status', 'pending');
      if (result.error) return;
      followDot = Boolean(result.count);
      applyProfileDot();
    } catch {
      /* der Punkt bleibt, wie er ist */
    }
  }

  function applyFollowLists(names) {
    if (!names) return;
    profileLists = {
      followers: names.followers || [],
      following: names.following || [],
      requests: names.requests || [],
    };
    followDot = (names.pending || 0) > 0;
    applyProfileDot();
  }

  function applyProfileDot() {
    const dot = modeProfile && modeProfile.querySelector('.profile-dot');
    if (dot) dot.hidden = !(followDot || wishDot);
  }

  async function refreshFollowLists() {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.followNames) return;
    applyFollowLists(await cloud.followNames());
  }

  function followFail(error) {
    if (error && (error.name === 'TypeError' || /failed to fetch|network/i.test(String(error.message || '')))) {
      return 'Keine Verbindung.';
    }
    return 'Das hat nicht geklappt.';
  }

  function repaintList() {
    if (listKind === 'followers') paintNames('Follower', profileLists.followers, 'followers');
    else if (listKind === 'following') paintNames('Folgt', profileLists.following, 'following');
  }

  async function changeFollow(id, action) {
    const cloud = globalThis.Cloud;
    if (!cloud || !id) return;
    try {
      if (action === 'follow') await cloud.follow(id);
      else if (action === 'unfollow') await cloud.unfollow(id);
      else if (action === 'remove') await cloud.removeFollower(id);
      else if (action === 'accept') await cloud.acceptFollow(id);
      else if (action === 'decline') await cloud.declineFollow(id);
      otherCache.delete(id);
      followedCache = null;
      await refreshFollowLists();
      refreshProfileDot();
      if (profileMode === 'other' && viewingId === id) openOther(id, true);
      else if (profileMode === 'home') paintProfile();
      else if (profileMode === 'list') repaintList();
      if (compareId === id) {
        const person = (profileLists.following || []).find((item) => item.id === id);
        if (person) applyCompare(person);
        else stopCompare();
      }
      const node = panel.querySelector('.followed-row');
      if (node && panelFilm && !panel.hidden) fillFollowed(panelFilm.id, node);
    } catch (error) {
      const note = profileRoot() && profileRoot().querySelector('.profile-status');
      const text = followFail(error);
      if (note) note.textContent = text;
      else if (profileMode === 'home') {
        profileStatus = text;
        paintProfile();
      }
    }
  }

  function filmFromCatalog(row) {
    const facets = row.facets && typeof row.facets === 'object' ? row.facets : {};
    const yearNum = Number(String(row.year || '').slice(0, 4));
    const genres = Array.isArray(facets.genres) ? facets.genres : [];
    const score = row.tmdb_rating == null ? null : Number(row.tmdb_rating);
    return {
      id: row.id,
      title: row.title || 'Film',
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
      facets,
    };
  }

  function shapePack(raw) {
    const filmRows = new Map((raw.films || []).map((row) => [row.id, row]));
    const entryRows = new Map();
    (raw.entries || []).forEach((row) => {
      if (!row || row.hidden || row.in_archive === false) return;
      entryRows.set(row.film_id, row);
    });
    const films = [];
    entryRows.forEach((row, id) => {
      const catalog = filmRows.get(id);
      if (catalog && catalog.poster && !posters.get(id)) posters.set(id, catalog.poster);
      const local = byId.get(id)
        || (window.FILMS || []).find((item) => item.id === id)
        || starterAdded.find((item) => item.id === id);
      if (local) {
        films.push(local);
        return;
      }
      films.push(catalog ? filmFromCatalog(catalog) : {
        id,
        title: 'Film',
        genres: [],
        cast: [],
        director: '',
        year: '',
        imdbLabel: '–',
        poster: '',
      });
    });
    const entryOf = (filmId) => {
      const row = entryRows.get(filmId) || {};
      const rating = Number(row.rating);
      return {
        rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
        watched: !!row.watched,
        next: !!row.next,
        favorite: !!row.favorite,
        updatedAt: row.updated_at || '',
        facetOverrides: row.facet_overrides && typeof row.facet_overrides === 'object' ? row.facet_overrides : null,
      };
    };
    const catalogFilms = new Map((raw.headFilms || []).map((row) => [row.id, filmFromCatalog(row)]));
    const headFilms = (raw.head && Array.isArray(raw.head.top_films) ? raw.head.top_films : [])
      .map((id) => catalogFilms.get(id))
      .filter(Boolean);
    headFilms.forEach((film) => {
      if (film.poster && !posters.get(film.id)) posters.set(film.id, film.poster);
    });
    return { ...raw, films, entryOf, headFilms };
  }

  async function packFor(id, fresh) {
    if (!fresh && otherCache.has(id)) return otherCache.get(id);
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.loadOther) return null;
    const raw = await cloud.loadOther(id);
    if (!raw) return null;
    const pack = shapePack(raw);
    otherCache.set(id, pack);
    return pack;
  }

  function theirFull(film, row) {
    const base = {};
    if (film.facets && typeof film.facets === 'object') Object.assign(base, film.facets);
    const local = (globalThis.FILM_FACETS || {})[film.id];
    if (local && typeof local === 'object') Object.assign(base, local);
    if (row && row.facetOverrides) Object.assign(base, row.facetOverrides);
    const merge = globalThis.Facets && globalThis.Facets.mergeFilm;
    return merge ? merge(film, base) : film;
  }

  function theirPeople(pack) {
    const actors = new Map();
    const directors = new Map();
    const add = (map, name, rating) => {
      const key = String(name || '').trim();
      if (!key) return;
      const row = map.get(key) || { name: key, sum: 0, count: 0 };
      row.sum += rating;
      row.count += 1;
      map.set(key, row);
    };
    pack.films.forEach((film) => {
      const row = pack.entryOf(film.id);
      if (row.rating == null) return;
      const full = theirFull(film, row);
      (full.cast || []).forEach((name) => add(actors, name, row.rating));
      if (full.director) add(directors, full.director, row.rating);
    });
    return { actors, directors };
  }

  function theirPins(pack) {
    const raw = pack.sensitive && pack.sensitive.pinned_people;
    return {
      actors: raw && Array.isArray(raw.actors) ? raw.actors.filter((name) => typeof name === 'string').slice(0, 5) : [],
      directors: raw && Array.isArray(raw.directors) ? raw.directors.filter((name) => typeof name === 'string').slice(0, 5) : [],
    };
  }

  function theirGroups(pack) {
    const groups = new Map();
    pack.films.forEach((film) => {
      const bucket = ratingBucket(pack.entryOf(film.id).rating);
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket).push(film);
    });
    return [...groups.keys()]
      .sort((a, b) => {
        if (a === 'none') return 1;
        if (b === 'none') return -1;
        return b - a;
      })
      .map((bucket) => ({
        label: ratingLabel(bucket),
        films: groups.get(bucket).slice().sort((a, b) => (
          (pack.entryOf(b.id).rating ?? -1) - (pack.entryOf(a.id).rating ?? -1)
          || String(a.title || '').localeCompare(b.title || '', 'de')
        )),
      }));
  }

  function theirPoster(film, pack) {
    const row = pack.entryOf(film.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster';
    button.dataset.id = film.id;
    button.classList.toggle('is-rated', row.rating != null);
    button.classList.toggle('is-favorite', !!row.favorite);
    button.classList.toggle('is-selected', film.id === selectedId);
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.src = posterSrc(film);
    const tint = document.createElement('span');
    tint.className = 'tint';
    tint.style.background = row.rating == null ? '' : ratingColor(row.rating);
    const score = document.createElement('span');
    score.className = 'poster-score';
    score.textContent = row.rating == null ? '' : `★  ${row.rating.toFixed(1).replace('.', ',')}`;
    button.append(image, tint, score);
    button.addEventListener('click', () => openFilm(film));
    return button;
  }

  function paintTheirWall(pack) {
    if (!pack.films.length) return el('p', 'profile-note', 'Noch keine Filme.');
    const wallBox = el('div', 'their-wall');
    theirGroups(pack).forEach((group) => {
      const bar = document.createElement('div');
      bar.className = 'genre-bar';
      const scores = group.films.map((film) => pack.entryOf(film.id).rating).filter((value) => value != null);
      const avg = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
      bar.append(
        el('span', 'genre-name', group.label),
        el('span', 'genre-count', group.films.length === 1 ? '1 Film' : `${group.films.length} Filme`),
        el('span', 'genre-score', avg == null ? '' : `★  ${avg.toFixed(1).replace('.', ',')}`),
      );
      wallBox.append(bar);
      group.films.forEach((film) => wallBox.append(theirPoster(film, pack)));
    });
    return wallBox;
  }

  function paintTheirNext(pack) {
    const block = document.createElement('section');
    block.append(el('h2', 'profile-kicker', 'Als Nächstes'));
    const films = pack.films.filter((film) => pack.entryOf(film.id).next);
    if (!films.length) {
      block.append(el('p', 'profile-note', 'Noch nichts.'));
      return block;
    }
    const row = el('div', 'mini-row');
    films.forEach((film) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mini-card';
      card.setAttribute('aria-label', film.title);
      const image = document.createElement('img');
      image.alt = '';
      image.src = posterSrc(film);
      card.append(image);
      card.addEventListener('click', () => openFilm(film));
      row.append(card);
    });
    block.append(row);
    return block;
  }

  function paintHeadTop(pack) {
    const block = document.createElement('section');
    block.append(el('h2', 'profile-kicker', 'Top 5'));
    const films = pack.headFilms || [];
    if (!films.length) {
      block.append(el('p', 'profile-note', 'Noch zu wenig Wertungen'));
      return block;
    }
    const row = el('div', 'top-row');
    films.forEach((film, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'top-card';
      card.setAttribute('aria-label', `${index + 1}. ${film.title}`);
      const image = document.createElement('img');
      image.alt = '';
      image.src = posterSrc(film);
      card.append(el('span', 'top-rank', String(index + 1)), image);
      card.addEventListener('click', () => openFilm(film));
      row.append(card);
    });
    block.append(row);
    return block;
  }

  function paintTheirTop(pack) {
    const block = document.createElement('section');
    block.append(el('h2', 'profile-kicker', 'Top 5'));
    const custom = pack.sensitive && Array.isArray(pack.sensitive.top_films) ? pack.sensitive.top_films : [];
    const films = custom.length
      ? custom.map((id) => pack.films.find((film) => film.id === id)).filter(Boolean).slice(0, 5)
      : pack.films.filter((film) => pack.entryOf(film.id).rating != null).sort((a, b) => {
        const diff = pack.entryOf(b.id).rating - pack.entryOf(a.id).rating;
        if (diff) return diff;
        return (Date.parse(pack.entryOf(b.id).updatedAt) || 0) - (Date.parse(pack.entryOf(a.id).updatedAt) || 0);
      }).slice(0, 5);
    if (!films.length) {
      block.append(el('p', 'profile-note', custom.length
        ? 'Die ausgewählten Filme sind nicht mehr im Archiv.'
        : 'Noch zu wenig Wertungen'));
      return block;
    }
    const row = el('div', 'top-row');
    films.forEach((film, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'top-card';
      card.setAttribute('aria-label', `${index + 1}. ${film.title}`);
      const image = document.createElement('img');
      image.alt = '';
      image.src = posterSrc(film);
      card.append(el('span', 'top-rank', String(index + 1)), image);
      card.addEventListener('click', () => openFilm(film));
      row.append(card);
    });
    block.append(row);
    return block;
  }

  function meanScore(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function paintComparison(pack) {
    const section = document.createElement('section');
    const myScores = [];
    FILMS.forEach((film) => {
      const row = entry(film.id);
      if (row.rating != null) myScores.push(row.rating);
    });
    const theirScores = [];
    let both = 0;
    const gaps = [];
    const high = [];
    pack.films.forEach((film) => {
      const row = pack.entryOf(film.id);
      const mine = entry(film.id);
      const seen = byId.has(film.id);
      if (row.rating != null) theirScores.push(row.rating);
      if (row.watched && seen && mine.watched) both += 1;
      if (row.rating != null && seen && mine.rating != null) {
        gaps.push({
          film,
          mine: mine.rating,
          theirs: row.rating,
          gap: Math.abs(mine.rating - row.rating),
        });
      }
      if (row.rating != null && row.rating >= 8 && !(seen && mine.watched)) high.push(film);
    });
    const mineAvg = meanScore(myScores);
    const theirAvg = meanScore(theirScores);
    section.append(el('p', 'compare-line', `Ihr habt beide gesehen: ${both}`));
    section.append(el('p', 'compare-line', `Durchschnitt: du ${mineAvg == null ? '–' : scoreText(mineAvg)} · sie ${theirAvg == null ? '–' : scoreText(theirAvg)}`));
    gaps.sort((a, b) => b.gap - a.gap || String(a.film.title || '').localeCompare(b.film.title || '', 'de'));
    const picked = gaps.slice(0, 3);
    if (picked.length) {
      const block = document.createElement('div');
      block.append(el('p', 'profile-kicker', 'Euer grösster Unterschied'));
      picked.forEach((item) => {
        const line = el('button', 'text-line', `${item.film.title} · du ${scoreText(item.mine)} · sie ${scoreText(item.theirs)}`);
        line.type = 'button';
        line.addEventListener('click', () => openFilm(item.film));
        block.append(line);
      });
      section.append(block);
    }
    high.sort((a, b) => pack.entryOf(b.id).rating - pack.entryOf(a.id).rating || String(a.title || '').localeCompare(b.title || '', 'de'));
    const posters = high.slice(0, 10);
    if (posters.length) {
      const block = document.createElement('div');
      block.append(el('p', 'profile-kicker', 'Hat sie hoch bewertet, du noch nicht gesehen'));
      const row = el('div', 'mini-row');
      posters.forEach((film) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'mini-card';
        card.setAttribute('aria-label', film.title);
        const image = document.createElement('img');
        image.alt = '';
        image.src = posterSrc(film);
        card.append(image);
        card.addEventListener('click', () => openFilm(film));
        row.append(card);
      });
      block.append(row);
      section.append(block);
    }
    return section;
  }

  function paintOther(pack) {
    const root = profileRoot();
    if (!root || !pack || !pack.profile) return;
    const person = pack.profile;
    root.classList.remove('profile-list');
    root.replaceChildren();
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = 'Zurück';
    back.addEventListener('click', () => renderProfile());
    root.append(back);
    root.append(el('h1', null, person.display_name || person.username || 'Profil'));
    root.append(el('p', 'handle', person.username ? `@${person.username}` : ''));
    const follow = lineButton(pack.follow === 'accepted' ? 'Entfolgen' : pack.follow === 'pending' ? 'Angefragt' : 'Folgen');
    follow.addEventListener('click', () => changeFollow(person.id, pack.follow === 'none' ? 'follow' : 'unfollow'));
    root.append(follow);
    const status = el('p', 'profile-status', '');
    status.setAttribute('role', 'status');
    root.append(status);
    const stats = pack.stats || {};
    const numbers = el('div', 'profile-stats');
    numbers.append(
      statNode(String(Number(stats.films) || 0), 'Filme'),
      statNode(String(Number(stats.followers) || 0), 'Follower'),
      statNode(String(Number(stats.following) || 0), 'Folgt'),
    );
    root.append(numbers);
    if (!pack.canView) {
      if (person.is_private) {
        root.append(el('p', 'profile-note', 'Dieses Profil ist privat'));
        return;
      }
      if (pack.head) {
        root.append(paintHeadTop(pack));
        const pins = theirPins({ sensitive: pack.head });
        if (pins.actors.length) root.append(paintPeople('actors', 'Lieblingsschauspieler', new Map(), { readOnly: true, pins }));
        if (pins.directors.length) root.append(paintPeople('directors', 'Lieblingsregie', new Map(), { readOnly: true, pins }));
      }
      return;
    }
    root.append(paintComparison(pack));
    root.append(paintTheirTop(pack));
    const people = theirPeople(pack);
    const pins = theirPins(pack);
    root.append(paintPeople('actors', 'Lieblingsschauspieler', people.actors, { readOnly: true, pins }));
    root.append(paintPeople('directors', 'Lieblingsregie', people.directors, { readOnly: true, pins }));
    root.append(paintTheirWall(pack));
    root.append(paintTheirNext(pack));
  }

  function showOther(id) {
    if (!id) return;
    if (mode !== 'profile') {
      skipProfileHome = true;
      setMode('profile');
    }
    openOther(id);
  }

  function openOther(id, fresh) {
    viewingId = id;
    profileMode = 'other';
    listKind = '';
    const token = ++otherToken;
    const root = profileRoot();
    if (!root) return;
    root.classList.remove('profile-list');
    if (!fresh && otherCache.has(id)) {
      paintOther(otherCache.get(id));
      return;
    }
    if (fresh) otherCache.delete(id);
    root.replaceChildren(el('p', 'profile-note', '…'));
    packFor(id, true).then((pack) => {
      if (token !== otherToken || viewingId !== id) return;
      if (!pack) {
        root.replaceChildren(el('p', 'profile-note', 'Dieses Profil gibt es nicht.'));
        return;
      }
      paintOther(pack);
    }).catch(() => {
      if (token !== otherToken) return;
      root.replaceChildren(el('p', 'profile-note', 'Keine Verbindung.'));
    });
  }

  function openProfileByName(name) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.profileByUsername) return;
    cloud.profileByUsername(name).then((row) => {
      if (!row || !row.id || (account && row.id === account.id)) return;
      closeSheet();
      showOther(row.id);
      showWishHints();
    }).catch(() => {});
  }

  function clearInviteParam() {
    const url = new URL(location.href);
    if (!url.searchParams.has('profil')) return;
    url.searchParams.delete('profil');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function queueInvite() {
    if (!pendingInvite || !account) return;
    const name = String(pendingInvite).trim().toLowerCase();
    pendingInvite = '';
    clearInviteParam();
    if (!name || name === String(account.username || '').toLowerCase()) return;
    openProfileByName(name);
  }

  function paintFinder() {
    const block = el('div', 'profile-find');
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Profile suchen';
    input.setAttribute('aria-label', 'Profile suchen');
    input.autocomplete = 'off';
    const hits = el('div', 'profile-hits');
    let token = 0;
    input.addEventListener('input', () => {
      const query = input.value.trim();
      window.clearTimeout(searchTimer);
      if (query.length < 2) {
        hits.replaceChildren();
        return;
      }
      searchTimer = window.setTimeout(async () => {
        const mine = token + 1;
        token = mine;
        const cloud = globalThis.Cloud;
        if (!cloud || !cloud.searchProfiles) return;
        try {
          const rows = await cloud.searchProfiles(query);
          if (mine !== token) return;
          hits.replaceChildren();
          const list = (rows || []).filter((row) => !account || row.id !== account.id).slice(0, 10);
          if (!list.length) {
            hits.append(el('p', 'profile-note', 'Keine Profile.'));
            return;
          }
          list.forEach((row) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'hit-row';
            button.append(document.createTextNode(row.display_name || row.username), el('small', null, `@${row.username}`));
            button.addEventListener('click', () => showOther(row.id));
            hits.append(button);
          });
        } catch {
          if (mine === token) hits.replaceChildren(el('p', 'profile-note', 'Keine Verbindung.'));
        }
      }, 250);
    });
    const copy = lineButton('Einladungslink kopieren');
    const note = el('p', 'profile-status', '');
    note.setAttribute('role', 'status');
    copy.addEventListener('click', async () => {
      const name = account && account.username;
      if (!name) return;
      const url = `${location.origin}${location.pathname}?profil=${encodeURIComponent(name)}`;
      try {
        await navigator.clipboard.writeText(url);
        note.textContent = 'Link kopiert.';
      } catch {
        note.textContent = url;
      }
    });
    block.append(input, hits, copy, note);
    return block;
  }

  function paintRequests(root) {
    if (!account || !account.is_private) return;
    const rows = profileLists.requests || [];
    if (!rows.length) return;
    const block = document.createElement('section');
    block.append(el('h2', 'profile-kicker', 'Anfragen'));
    rows.forEach((person) => {
      const line = el('div', 'request-line');
      const name = el('button', 'text-line', person.name || person.username || 'Profil');
      name.type = 'button';
      if (person.id) name.addEventListener('click', () => showOther(person.id));
      const accept = lineButton('Annehmen');
      accept.addEventListener('click', () => changeFollow(person.id, 'accept'));
      const decline = lineButton('Ablehnen');
      decline.addEventListener('click', () => changeFollow(person.id, 'decline'));
      line.append(name, accept, decline);
      block.append(line);
    });
    root.append(block);
  }

  function addForeignFilm(film) {
    if (!globalThis.Store || !film) return;
    if (!archive) {
      adoptArchive(globalThis.Store.create('leer'));
      closeSheet();
      started = true;
      loadPosters();
      loadStoredFacets();
    }
    const facets = film.facets || (globalThis.FILM_FACETS || {})[film.id] || {};
    const existing = byId.get(film.id) || findExisting(film, facets);
    if (existing) {
      const kept = adopt(existing);
      persist();
      if (network) {
        network.setFilms(FILMS);
        if (!network.pointOf(kept.id)) network.addFilm(kept);
      }
      renderPanel(kept);
      paint();
      return;
    }
    const next = { ...film, genres: film.genres || [], cast: film.cast || [] };
    if (facets && Object.keys(facets).length) rememberFacets(next.id, facets);
    if (next.poster) posters.set(next.id, next.poster);
    added.push(next);
    persist();
    FILMS.push(next);
    byId.set(next.id, next);
    seatProvisional(next);
    if (network) {
      network.setFilms(FILMS);
      network.addFilm(next);
    }
    scheduleRelayout();
    renderPanel(next);
    paint();
    if (mode !== 'network' && mode !== 'profile') buildWall();
  }

  function fillFollowed(filmId, node) {
    if (!node) return;
    followedRatings().then((map) => {
      if (!panelFilm || panelFilm.id !== filmId || !node.isConnected) return;
      const rows = (map && map.get(filmId)) || [];
      if (!rows.length) {
        node.hidden = true;
        node.replaceChildren();
        return;
      }
      node.hidden = false;
      node.replaceChildren(el('span', 'profile-kicker', 'Gefolgte'));
      const line = el('p', 'followed-names');
      rows.forEach((person, index) => {
        if (index) line.append(document.createTextNode(' · '));
        const button = el('button', null, `${person.username} ${scoreText(person.rating)}`);
        button.type = 'button';
        button.addEventListener('click', () => showOther(person.id));
        line.append(button);
      });
      node.append(line);
    }).catch(() => {});
  }

  async function followedRatings() {
    if (followedCache) return followedCache;
    const map = new Map();
    if (!(profileLists.following || []).length && globalThis.Cloud && globalThis.Cloud.followNames) {
      const names = await globalThis.Cloud.followNames().catch(() => null);
      if (names) applyFollowLists(names);
    }
    await Promise.all((profileLists.following || []).map(async (person) => {
      const pack = await packFor(person.id);
      if (!pack || !pack.canView) return;
      pack.films.forEach((film) => {
        const row = pack.entryOf(film.id);
        if (row.rating == null) return;
        const list = map.get(film.id) || [];
        list.push({
          id: person.id,
          username: person.username || person.name || 'Profil',
          rating: row.rating,
        });
        map.set(film.id, list);
      });
    }));
    followedCache = map;
    return map;
  }

  async function openCompareMenu() {
    const pop = document.getElementById('compare-pop');
    if (!pop || !netCompare) return;
    if (!(profileLists.following || []).length && globalThis.Cloud && globalThis.Cloud.followNames) {
      const names = await globalThis.Cloud.followNames().catch(() => null);
      if (names) applyFollowLists(names);
    }
    pop.replaceChildren();
    const people = profileLists.following || [];
    if (!people.length) pop.append(el('p', null, 'Du folgst noch niemandem.'));
    else {
      people.forEach((person) => {
        const button = el('button', null, person.username || person.name || 'Profil');
        button.type = 'button';
        button.addEventListener('click', () => applyCompare(person));
        pop.append(button);
      });
    }
    pop.hidden = false;
    netCompare.setAttribute('aria-expanded', 'true');
  }

  async function applyCompare(person) {
    compareId = person.id;
    compareName = person.username || person.name || 'Profil';
    const pack = await packFor(person.id);
    const map = new Map();
    if (pack && pack.canView) {
      pack.films.forEach((film) => {
        const row = pack.entryOf(film.id);
        if (row.rating != null && byId.has(film.id)) map.set(film.id, row.rating);
      });
    }
    ensureNetwork();
    if (network && network.setCompare) network.setCompare(map);
    if (netCompare) {
      netCompare.setAttribute('aria-pressed', 'true');
      netCompare.setAttribute('aria-expanded', 'false');
    }
    const bar = document.getElementById('compare-bar');
    if (bar) {
      bar.hidden = false;
      const label = bar.querySelector('span');
      if (label) label.textContent = `Vergleich mit ${compareName}`;
    }
    const pop = document.getElementById('compare-pop');
    if (pop) pop.hidden = true;
  }

  function stopCompare() {
    compareId = null;
    compareName = '';
    if (network && network.setCompare) network.setCompare(null);
    if (netCompare) {
      netCompare.setAttribute('aria-pressed', 'false');
      netCompare.setAttribute('aria-expanded', 'false');
    }
    const bar = document.getElementById('compare-bar');
    if (bar) bar.hidden = true;
    const pop = document.getElementById('compare-pop');
    if (pop) pop.hidden = true;
  }

  function watchFollows(userId) {
    refreshProfileDot();
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.client || followChannel || !userId) return;
    const bump = (payload) => {
      const row = payload && ((payload.new && payload.new.follower) ? payload.new : payload.old);
      const other = row && (row.follower === userId ? row.followee : row.follower);
      if (other) otherCache.delete(other);
      followedCache = null;
      followedFilmCache = null;
      refreshProfileDot();
      refreshFollowLists().then(() => {
        const typing = document.activeElement && document.activeElement.getAttribute('aria-label') === 'Profile suchen';
        if (profileMode === 'home' && !typing) paintProfile();
        else if (profileMode === 'list') repaintList();
        else if (profileMode === 'other' && viewingId && (!other || viewingId === other)) openOther(viewingId, true);
        if (compareId && (!other || compareId === other)) {
          const person = (profileLists.following || []).find((item) => item.id === compareId);
          if (person) applyCompare(person);
          else stopCompare();
        }
        const node = panel.querySelector('.followed-row');
        if (node && panelFilm && !panel.hidden) fillFollowed(panelFilm.id, node);
      }).catch(() => {});
    };
    followChannel = cloud.client.channel(`profile-follows-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'follows',
        filter: `followee=eq.${userId}`,
      }, bump)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'follows',
        filter: `follower=eq.${userId}`,
      }, bump)
      .subscribe();
  }

  async function loadProfileCloud(token) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.profileExtra) return;
    const [extra, names, mail, enabled] = await Promise.all([
      cloud.profileExtra().catch(() => null),
      cloud.followNames().catch(() => null),
      cloud.recoveryEmail().catch(() => null),
      recoveryEnabled(),
    ]);
    if (token !== profileToken || !account) return;
    if (extra) {
      const stats = extra.stats || {};
      profileStats = {
        films: Number(stats.films) || 0,
        followers: Number(stats.followers) || 0,
        following: Number(stats.following) || 0,
      };
      const sensitive = extra.sensitive || {};
      account.top_films = Array.isArray(sensitive.top_films)
        ? sensitive.top_films.filter((id) => typeof id === 'string')
        : [];
      const pinned = sensitive.pinned_people || {};
      account.pinned_people = {
        actors: Array.isArray(pinned.actors) ? pinned.actors.filter((name) => typeof name === 'string').slice(0, 5) : [],
        directors: Array.isArray(pinned.directors) ? pinned.directors.filter((name) => typeof name === 'string').slice(0, 5) : [],
      };
    }
    if (names) applyFollowLists(names);
    profileMail = mail;
    if (profileMode === 'home') paintProfile();
  }

  function paintNames(title, names, kind) {
    const root = profileRoot();
    if (!root) return;
    profileMode = 'list';
    listKind = kind || '';
    viewingId = null;
    root.classList.add('profile-list');
    root.replaceChildren();
    root.append(el('h1', null, title));
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = 'Zurück';
    back.addEventListener('click', () => {
      profileMode = 'home';
      listKind = '';
      paintProfile();
    });
    root.append(back);
    const rows = names || [];
    if (!rows.length) {
      root.append(el('p', 'profile-note', 'Noch niemand.'));
      return;
    }
    rows.forEach((person) => {
      const line = el('div', 'name-line');
      const open = el('button', 'text-line', person.name || person.username || 'Profil');
      open.type = 'button';
      if (person.id) open.addEventListener('click', () => showOther(person.id));
      line.append(open);
      if (kind === 'followers' && person.id) {
        const remove = lineButton('Entfernen');
        remove.addEventListener('click', () => changeFollow(person.id, 'remove'));
        line.append(remove);
      } else if (kind === 'following' && person.id) {
        const remove = lineButton('Entfolgen');
        remove.addEventListener('click', () => changeFollow(person.id, 'unfollow'));
        line.append(remove);
      }
      root.append(line);
    });
  }

  function paintPeople(kind, title, map, source) {
    const pins = source && source.pins ? source.pins : pinsOf();
    const readOnly = Boolean(source && source.readOnly);
    const shown = rankedPeople(map, pins[kind]);
    const block = document.createElement('section');
    block.append(el('h2', 'profile-kicker', title));
    if (!shown.length) {
      block.append(el('p', 'profile-note', 'Noch zu wenig Wertungen'));
      return block;
    }
    shown.forEach((person) => {
      const line = el('div', 'person-line');
      const pin = document.createElement(readOnly ? 'span' : 'button');
      if (!readOnly) pin.type = 'button';
      pin.className = person.pinned ? 'pin is-on' : 'pin';
      if (readOnly) pin.style.cursor = 'default';
      else {
        pin.setAttribute('aria-label', person.pinned ? `${person.name} lösen` : `${person.name} anpinnen`);
        pin.addEventListener('click', () => togglePin(kind, person.name, person.pinned));
      }
      pin.append(document.createElement('i'));
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'person-name';
      name.textContent = person.name;
      name.addEventListener('click', () => highlight({
        title: kind === 'directors' ? `Regie: ${person.name}` : `Mit: ${person.name}`,
        style: kind === 'directors' ? 'director' : 'cast',
        ids: filmsWith(kind === 'directors' ? 'director' : 'cast', person.name),
      }));
      const meta = person.count
        ? `${scoreText(person.avg)} · ${person.count === 1 ? '1 Film' : `${person.count} Filme`}`
        : (readOnly ? '' : '0 Filme');
      line.append(pin, name);
      if (meta) line.append(el('small', null, meta));
      block.append(line);
    });
    return block;
  }

  async function togglePin(kind, name, pinned) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.updateProfile) return;
    const current = pinsOf();
    const list = current[kind].slice();
    if (pinned) {
      const index = list.indexOf(name);
      if (index >= 0) list.splice(index, 1);
    } else if (!list.includes(name) && list.length < 5) {
      list.unshift(name);
    } else return;
    const next = { ...current, [kind]: list };
    const previous = pinsOf();
    account.pinned_people = next;
    profileStatus = '';
    paintProfile();
    try {
      await cloud.updateProfile({ pinned_people: next });
    } catch (error) {
      account.pinned_people = previous;
      profileStatus = profileFail(error);
      paintProfile();
    }
  }

  function paintTop(root) {
    const block = document.createElement('section');
    block.append(el('h2', 'profile-kicker', 'Top 5'));
    const chosen = shownTopFilms();
    if (!chosen.films.length) {
      const rated = FILMS.some((film) => entry(film.id).rating != null);
      block.append(el('p', 'profile-note', !chosen.custom && !rated
        ? 'Bewerte Filme, dann erscheinen hier deine Top 5'
        : 'Die ausgewählten Filme sind nicht mehr im Archiv.'));
    } else {
      const row = el('div', 'top-row');
      chosen.films.forEach((film, index) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'top-card';
        card.setAttribute('aria-label', `${index + 1}. ${film.title}`);
        const image = document.createElement('img');
        image.alt = '';
        image.src = posterSrc(film);
        card.append(el('span', 'top-rank', String(index + 1)), image);
        card.addEventListener('click', () => openFilm(film));
        row.append(card);
      });
      block.append(row);
    }
    const edit = lineButton('Top 5 bearbeiten');
    edit.addEventListener('click', () => paintTopEditor());
    block.append(edit);
    root.append(block);
  }

  function paintTopEditor() {
    const root = profileRoot();
    if (!root) return;
    profileMode = 'edit';
    root.classList.remove('profile-list');
    const chosen = shownTopFilms();
    const ids = chosen.films.map((film) => film.id);
    const redraw = () => draw();
    function draw() {
      root.replaceChildren();
      root.append(el('h1', null, 'Top 5'));
      const row = el('div', 'top-row is-sorting');
      ids.forEach((id, index) => {
        const film = byId.get(id);
        if (!film) return;
        const card = el('div', 'top-card');
        card.dataset.top = id;
        const image = document.createElement('img');
        image.alt = '';
        image.src = posterSrc(film);
        const tools = el('div', 'top-tools');
        const left = lineButton('‹');
        left.setAttribute('aria-label', 'Nach links');
        left.disabled = index === 0;
        left.addEventListener('click', () => shiftTop(ids, index, -1, redraw));
        const right = lineButton('›');
        right.setAttribute('aria-label', 'Nach rechts');
        right.disabled = index === ids.length - 1;
        right.addEventListener('click', () => shiftTop(ids, index, 1, redraw));
        const remove = lineButton('×');
        remove.setAttribute('aria-label', 'Entfernen');
        remove.addEventListener('click', () => {
          ids.splice(index, 1);
          redraw();
        });
        tools.append(left, right, remove);
        card.append(el('span', 'top-rank', String(index + 1)), image, tools);
        row.append(card);
      });
      bindTopDrag(row, ids, redraw);
      root.append(row);
      const search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Im Archiv suchen';
      search.setAttribute('aria-label', 'Im Archiv suchen');
      search.autocomplete = 'off';
      const hits = document.createElement('div');
      const status = el('p', 'profile-status', ids.length >= 5 ? 'Höchstens 5 Filme.' : '');
      status.setAttribute('role', 'status');
      search.addEventListener('input', () => {
        const query = search.value.trim().toLocaleLowerCase('de');
        hits.replaceChildren();
        if (!query) return;
        FILMS.filter((film) => (
          !ids.includes(film.id)
          && `${film.title || ''} ${film.original || ''}`.toLocaleLowerCase('de').includes(query)
        )).slice(0, 8).forEach((film) => {
          const hit = document.createElement('button');
          hit.type = 'button';
          hit.className = 'hit-row';
          hit.textContent = film.year ? `${film.title} · ${film.year}` : film.title;
          hit.addEventListener('click', () => {
            if (ids.length >= 5) {
              status.textContent = 'Höchstens 5 Filme.';
              return;
            }
            ids.push(film.id);
            redraw();
          });
          hits.append(hit);
        });
      });
      const save = lineButton('Speichern');
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await globalThis.Cloud.updateProfile({ top_films: ids.slice(0, 5) });
          account.top_films = ids.slice(0, 5);
          profileStatus = '';
          profileMode = 'home';
          paintProfile();
        } catch (error) {
          status.textContent = profileFail(error);
          save.disabled = false;
        }
      });
      const reset = lineButton('Zurücksetzen');
      reset.addEventListener('click', async () => {
        reset.disabled = true;
        try {
          await globalThis.Cloud.updateProfile({ top_films: [] });
          account.top_films = [];
          profileStatus = '';
          profileMode = 'home';
          paintProfile();
        } catch (error) {
          status.textContent = profileFail(error);
          reset.disabled = false;
        }
      });
      const back = lineButton('Zurück');
      back.addEventListener('click', () => {
        profileMode = 'home';
        paintProfile();
      });
      [save, reset, back].forEach((button) => button.classList.add('editor-action'));
      root.append(search, hits, status, save, reset, back);
    }
    draw();
  }

  function shiftTop(ids, index, delta, redraw) {
    const next = index + delta;
    if (next < 0 || next >= ids.length) return;
    const [item] = ids.splice(index, 1);
    ids.splice(next, 0, item);
    redraw();
  }

  function bindTopDrag(row, ids, redraw) {
    let drag = null;
    row.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const card = event.target.closest('[data-top]');
      if (!card) return;
      drag = {
        id: card.dataset.top,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        pointer: event.pointerId,
      };
    });
    row.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.moved = true;
      if (!row.hasPointerCapture(event.pointerId)) row.setPointerCapture(event.pointerId);
      const cards = [...row.querySelectorAll('[data-top]')];
      const over = cards.find((card) => {
        const box = card.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX <= box.right;
      });
      if (!over || over.dataset.top === drag.id) return;
      const from = ids.indexOf(drag.id);
      const to = ids.indexOf(over.dataset.top);
      if (from < 0 || to < 0 || from === to) return;
      const card = cards.find((item) => item.dataset.top === drag.id);
      ids.splice(from, 1);
      ids.splice(to, 0, drag.id);
      if (card) {
        if (from < to) over.after(card);
        else over.before(card);
      }
      [...row.querySelectorAll('.top-rank')].forEach((node, index) => {
        node.textContent = String(index + 1);
      });
    });
    const end = (event) => {
      if (!drag || (event && event.pointerId !== drag.pointer)) return;
      const moved = drag.moved;
      drag = null;
      if (moved) redraw();
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  }

  function paintSettings() {
    const details = document.createElement('details');
    details.className = 'profile-settings';
    details.open = settingsOpen;
    details.addEventListener('toggle', () => { settingsOpen = details.open; });
    const summary = document.createElement('summary');
    summary.textContent = 'Einstellungen';
    const stack = el('div', 'stack');
    const nameLabel = el('label', null, 'Anzeigename');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = (account && account.display_name) || '';
    nameInput.autocomplete = 'nickname';
    nameInput.maxLength = 80;
    nameLabel.append(nameInput);
    const saveName = document.createElement('button');
    saveName.type = 'button';
    saveName.textContent = 'Speichern';
    const nameStatus = el('p', 'profile-status', '');
    nameStatus.setAttribute('role', 'status');
    saveName.addEventListener('click', async () => {
      const displayName = nameInput.value.trim();
      if (!displayName) {
        nameStatus.textContent = 'Bitte einen Anzeigenamen eintragen.';
        return;
      }
      saveName.disabled = true;
      try {
        await globalThis.Cloud.updateProfile({ display_name: displayName });
        account.display_name = displayName;
        profileStatus = '';
        paintProfile();
      } catch (error) {
        nameStatus.textContent = profileFail(error);
        saveName.disabled = false;
      }
    });
    const privacy = document.createElement('button');
    privacy.type = 'button';
    privacy.className = 'switch';
    privacy.setAttribute('aria-pressed', account && account.is_private ? 'true' : 'false');
    const mark = document.createElement('i');
    privacy.append(mark, el('span', null, 'Privates Profil'));
    privacy.addEventListener('click', async () => {
      const next = privacy.getAttribute('aria-pressed') !== 'true';
      privacy.disabled = true;
      try {
        await globalThis.Cloud.updateProfile({ is_private: next });
        account.is_private = next;
        privacy.setAttribute('aria-pressed', next ? 'true' : 'false');
      } catch (error) {
        nameStatus.textContent = profileFail(error);
      } finally {
        privacy.disabled = false;
      }
    });
    stack.append(
      nameLabel,
      saveName,
      nameStatus,
      privacy,
      el('p', 'profile-note', 'Folge-Anfragen müssen bestätigt werden. Ohne bestätigte Folge bleibt das Archiv unsichtbar.'),
    );
    if (recoveryOn) stack.append(paintRecovery());
    stack.append(paintReset(), paintDelete());
    const out = document.createElement('button');
    out.type = 'button';
    out.textContent = 'Abmelden';
    out.addEventListener('click', () => { leave(); });
    stack.append(out);
    details.append(summary, stack);
    return details;
  }

  function paintRecovery() {
    const block = document.createElement('div');
    block.append(el('h2', 'profile-kicker', 'Wiederherstellungs-E-Mail'));
    if (profileMail && profileMail.email) {
      block.append(el('p', null, profileMail.email));
      block.append(el('p', 'profile-note', profileMail.verified ? 'bestätigt' : 'Bestätigung ausstehend'));
    }
    const input = document.createElement('input');
    input.type = 'email';
    input.autocomplete = 'email';
    input.placeholder = 'E-Mail (freiwillig, nur zum Zurücksetzen)';
    input.value = profileMail && profileMail.email ? profileMail.email : '';
    input.setAttribute('aria-label', 'E-Mail (freiwillig, nur zum Zurücksetzen)');
    const status = el('p', 'profile-status', '');
    status.setAttribute('role', 'status');
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = profileMail && profileMail.email ? 'Ändern' : 'Hinzufügen';
    save.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = 'Die E-Mail sieht ungültig aus.';
        return;
      }
      save.disabled = true;
      try {
        const session = await globalThis.Cloud.getSession();
        const response = await fetch('/api/recovery?action=verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session && session.access_token ? session.access_token : ''}`,
          },
          body: JSON.stringify({ email }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error((data && data.error) || 'fail');
        profileMail = { email, verified: false };
        paintProfile();
      } catch (error) {
        status.textContent = profileFail(error);
        save.disabled = false;
      }
    });
    block.append(input, save, status);
    if (profileMail && profileMail.email) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Entfernen';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await globalThis.Cloud.removeRecoveryEmail();
          profileMail = null;
          paintProfile();
        } catch (error) {
          status.textContent = profileFail(error);
          remove.disabled = false;
        }
      });
      block.append(remove);
    }
    return block;
  }

  function paintReset() {
    const block = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = 'zurücksetzen';
    input.setAttribute('aria-label', 'zurücksetzen eingeben');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Archiv zurücksetzen';
    button.disabled = true;
    input.addEventListener('input', () => {
      button.disabled = input.value.trim().toLocaleLowerCase('de') !== 'zurücksetzen';
    });
    button.addEventListener('click', async () => {
      button.disabled = true;
      const next = await globalThis.Store.reset();
      if (!next) return;
      adoptArchive(next);
      if (network) {
        network.setFilms(FILMS);
        if (networkReady) network.reflow();
      }
      settingsOpen = true;
      renderProfile();
    });
    block.append(input, button);
    return block;
  }

  function paintDelete() {
    const block = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = 'löschen';
    input.setAttribute('aria-label', 'löschen eingeben');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Konto löschen';
    button.disabled = true;
    const status = el('p', 'profile-status', '');
    status.setAttribute('role', 'status');
    input.addEventListener('input', () => {
      button.disabled = input.value.trim().toLocaleLowerCase('de') !== 'löschen';
    });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await globalThis.Cloud.deleteAccount();
        await leave();
      } catch (error) {
        status.textContent = profileFail(error);
        button.disabled = false;
      }
    });
    block.append(input, button, status);
    return block;
  }

  function readWishSeen() {
    wishSeen = { lists: {}, hints: [] };
    if (!account) return;
    try {
      const raw = JSON.parse(localStorage.getItem(`moviebylucia-wish-seen-${account.id}`) || '{}');
      wishSeen = {
        lists: raw && raw.lists && typeof raw.lists === 'object' ? raw.lists : {},
        hints: raw && Array.isArray(raw.hints) ? raw.hints.filter((id) => typeof id === 'string') : [],
      };
    } catch {
      wishSeen = { lists: {}, hints: [] };
    }
  }

  function writeWishSeen() {
    if (!account) return;
    try {
      localStorage.setItem(`moviebylucia-wish-seen-${account.id}`, JSON.stringify(wishSeen));
    } catch {
      /* der Merkzettel bleibt in dieser Sitzung */
    }
  }

  function wishFail(error, mutual) {
    const message = String(error && error.message || '');
    if (error && (error.name === 'TypeError' || /failed to fetch|network/i.test(message))) return 'Keine Verbindung.';
    if (mutual && (error.code === '42501' || /row-level security|permission/i.test(message))) {
      return 'Das geht nur bei gegenseitigem Folgen.';
    }
    return 'Das hat nicht geklappt.';
  }

  function isWishDuplicate(error) {
    const message = String(error && error.message || '');
    return Boolean(error && (error.code === '23505' || /duplicate|wishlist_items_film_key/i.test(message)));
  }

  function mutualPeople() {
    const followers = new Set((profileLists.followers || []).map((person) => person.id));
    return (profileLists.following || []).filter((person) => person.id && followers.has(person.id));
  }

  function facetsOf(film) {
    const stored = (globalThis.FILM_FACETS || {})[film && film.id];
    if (stored && typeof stored === 'object') return stored;
    if (film && film.facets && typeof film.facets === 'object') return film.facets;
    return null;
  }

  function filmCatalogPayload(film, facets) {
    const base = facets && typeof facets === 'object' ? facets : null;
    const score = base && typeof base.tmdbRating === 'number'
      ? base.tmdbRating
      : (typeof film.imdb === 'number' ? film.imdb : null);
    const votes = base && typeof base.tmdbVotes === 'number' ? base.tmdbVotes : null;
    return {
      id: film.id,
      imdb_id: base && base.imdbId ? base.imdbId : null,
      title: film.title || 'Film',
      original_title: film.original || null,
      year: film.year ? String(film.year) : null,
      kind: /^tmdb:tv:/.test(film.id) || film.kind === 'serie' ? 'tv' : 'movie',
      poster: (base && base.poster) || film.poster || null,
      tmdb_rating: score,
      tmdb_votes: Number.isFinite(votes) ? votes : null,
      facets: base,
    };
  }

  function wishFilmObject(item) {
    const local = byId.get(item.filmId);
    if (local) return local;
    if (item.film) return filmFromCatalog(item.film);
    return {
      id: item.filmId,
      title: 'Film',
      year: '',
      genres: [],
      cast: [],
      director: '',
      imdbLabel: '–',
    };
  }

  function wishUnseen(list, me) {
    const seenAt = Date.parse(wishSeen.lists[list.id] || '') || 0;
    return (list.stamps || []).some((item) => (
      item.addedBy && item.addedBy !== me && Date.parse(item.createdAt) > seenAt
    ));
  }

  function refreshWishDot() {
    const me = account && account.id;
    wishDot = wishLists.some((list) => wishUnseen(list, me));
    applyProfileDot();
  }

  function markListSeen(id) {
    wishSeen.lists[id] = new Date().toISOString();
    writeWishSeen();
    refreshWishDot();
  }

  function setWishStatus(text) {
    const node = document.getElementById('wish-status');
    if (node) node.textContent = text || '';
  }

  async function loadWishlists(options) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.wishOverview || !account) return;
    const token = wishBoot + 1;
    wishBoot = token;
    try {
      const lists = await cloud.wishOverview();
      if (token !== wishBoot || !account) return;
      wishLists = lists || [];
      refreshWishDot();
      bindWishRealtime();
      if (options && options.quiet) return;
      const typing = document.activeElement && document.activeElement.getAttribute('aria-label') === 'Profile suchen';
      if (profileMode === 'home' && !typing) paintProfile();
      else if (profileMode === 'wish' && wishOpenId) {
        if (!wishLists.some((list) => list.id === wishOpenId)) renderProfile();
        else paintWishlist();
      }
    } catch {
      /* die Übersicht bleibt, wie sie ist */
    }
  }

  function bindWishRealtime() {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.client || !account) return;
    const key = `${account.id}:${wishLists.map((list) => list.id).sort().join(',')}`;
    if (wishChannel && wishChannelKey === key) return;
    if (wishChannel) cloud.client.removeChannel(wishChannel);
    const channel = cloud.client.channel(`wishlists-${account.id}-${wishBoot}`);
    const listen = (table, filter) => {
      const spec = { event: '*', schema: 'public', table };
      if (filter) spec.filter = filter;
      channel.on('postgres_changes', spec, (payload) => onWishEvent(table, payload));
    };
    listen('wishlist_members', `user_id=eq.${account.id}`);
    wishLists.forEach((list) => {
      listen('wishlist_items', `wishlist_id=eq.${list.id}`);
      listen('wishlist_members', `wishlist_id=eq.${list.id}`);
    });
    listen('wishlist_votes');
    channel.subscribe();
    wishChannel = channel;
    wishChannelKey = key;
  }

  function onWishEvent(table, payload) {
    const eventName = payload && (payload.eventType || payload.event);
    const row = payload && payload.new && payload.new.id ? payload.new : null;
    if (table === 'wishlist_items' && eventName === 'INSERT' && row && row.added_by !== (account && account.id)) {
      wishFresh.add(row.id);
      window.setTimeout(() => {
        wishFresh.delete(row.id);
        const node = document.querySelector(`[data-wish-item="${row.id}"]`);
        if (node) node.classList.remove('is-fresh');
      }, 2600);
    }
    window.clearTimeout(wishReloadTimer);
    wishReloadTimer = window.setTimeout(() => loadWishlists(), 200);
  }

  function paintWishHome() {
    const block = document.createElement('section');
    block.append(el('h2', 'profile-kicker', 'Wunschlisten'));
    if (!wishLists.length) block.append(el('p', 'profile-note', 'Noch keine Liste.'));
    wishLists.forEach((list) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hit-row';
      const names = list.members.map((person) => person.username).filter(Boolean).join(' · ');
      const count = list.openCount === 1 ? '1 offen' : `${list.openCount} offen`;
      button.append(document.createTextNode(list.title), el('small', null, `${names} · ${count}`));
      button.addEventListener('click', () => openWishlist(list.id));
      block.append(button);
    });
    const add = lineButton('Neue Wunschliste');
    add.addEventListener('click', () => openNewWishlist());
    block.append(add);
    return block;
  }

  function openWishlist(id) {
    wishOpenId = id;
    profileMode = 'wish';
    wishItems = [];
    paintWishlist();
  }

  function sortedWishItems(items) {
    const rows = items.slice();
    if (wishSort === 'new') {
      rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } else {
      rows.sort((a, b) => b.votes.length - a.votes.length || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    return rows;
  }

  function wishFilmRow(item, list) {
    const film = wishFilmObject(item);
    const article = el('article', 'wish-film');
    article.dataset.wishItem = item.id;
    if (wishFresh.has(item.id)) article.classList.add('is-fresh');
    const poster = document.createElement('button');
    poster.type = 'button';
    poster.className = 'wish-poster';
    poster.setAttribute('aria-label', film.title || 'Film');
    const image = document.createElement('img');
    image.alt = '';
    image.src = posterSrc(film);
    poster.append(image);
    poster.addEventListener('click', () => openFilm(film));
    const body = el('div', 'wish-copy');
    const title = el('button', 'wish-title', film.title || 'Film');
    title.type = 'button';
    title.addEventListener('click', () => openFilm(film));
    const year = film.year ? `${film.year} · ` : '';
    body.append(title, el('p', 'wish-meta', `${year}hinzugefügt von ${item.addedName}`));
    const vote = el('button', 'wish-vote', `Will ich · ${item.votes.length}`);
    vote.type = 'button';
    vote.setAttribute('aria-pressed', item.mine ? 'true' : 'false');
    vote.addEventListener('click', () => changeWishVote(item));
    body.append(vote);
    if (item.votes.length) body.append(el('p', 'wish-voters', item.votes.map((row) => row.username).join(' · ')));
    const tools = el('div', 'wish-tools');
    const status = el('button', 'wish-status', item.status === 'geschaut' ? 'Wieder öffnen' : 'Zusammen geschaut');
    status.type = 'button';
    status.addEventListener('click', () => changeWishStatus(item));
    tools.append(status);
    const me = account && account.id;
    if (list.role === 'owner' || item.addedBy === me) {
      const remove = el('button', 'wish-remove', 'Entfernen');
      remove.type = 'button';
      remove.addEventListener('click', () => removeWishItem(item));
      tools.append(remove);
    }
    body.append(tools);
    article.append(poster, body);
    return article;
  }

  function fillWishItems(list) {
    const openHost = document.getElementById('wish-items');
    const doneHost = document.getElementById('wish-done');
    if (!openHost || !doneHost || !list) return;
    const open = sortedWishItems(wishItems.filter((item) => item.status !== 'geschaut'));
    const done = sortedWishItems(wishItems.filter((item) => item.status === 'geschaut'));
    openHost.replaceChildren();
    if (!open.length) {
      openHost.append(el('p', 'profile-note', wishItems.length ? 'Keine offenen Filme.' : 'Noch keine Filme.'));
    } else {
      open.forEach((item) => openHost.append(wishFilmRow(item, list)));
    }
    doneHost.replaceChildren();
    if (!done.length) return;
    const details = document.createElement('details');
    details.className = 'wish-done';
    const summary = document.createElement('summary');
    summary.textContent = 'Zusammen geschaut';
    details.append(summary);
    done.forEach((item) => details.append(wishFilmRow(item, list)));
    doneHost.append(details);
  }

  function paintWishlist() {
    const list = wishLists.find((item) => item.id === wishOpenId);
    const root = profileRoot();
    if (!list || !root) {
      renderProfile();
      return;
    }
    profileMode = 'wish';
    markListSeen(list.id);
    const searching = document.activeElement && document.activeElement.id === 'wish-search';
    if (!(searching && document.getElementById('wish-items'))) {
      root.classList.remove('profile-list');
      root.replaceChildren();
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'back';
      back.textContent = 'Zurück';
      back.addEventListener('click', () => renderProfile());
      root.append(back, el('h1', null, list.title));
      root.append(el('p', 'handle', list.members.map((person) => person.username).filter(Boolean).join(' · ')));
      root.append(paintWishManage(list));
      const sort = el('div', 'wish-sort');
      const byVotes = el('button', null, 'Stimmen');
      byVotes.type = 'button';
      byVotes.setAttribute('aria-pressed', wishSort === 'votes' ? 'true' : 'false');
      byVotes.addEventListener('click', () => {
        wishSort = 'votes';
        paintWishlist();
      });
      const byNew = el('button', null, 'Neueste');
      byNew.type = 'button';
      byNew.setAttribute('aria-pressed', wishSort === 'new' ? 'true' : 'false');
      byNew.addEventListener('click', () => {
        wishSort = 'new';
        paintWishlist();
      });
      sort.append(byVotes, byNew);
      root.append(sort);
      const add = lineButton('Film hinzufügen');
      const search = document.createElement('input');
      search.id = 'wish-search';
      search.type = 'search';
      search.placeholder = 'Film suchen';
      search.setAttribute('aria-label', 'Film suchen');
      search.autocomplete = 'off';
      search.hidden = true;
      const hits = el('div', 'profile-hits');
      let token = 0;
      add.addEventListener('click', () => {
        search.hidden = false;
        search.focus();
      });
      search.addEventListener('input', () => {
        const query = search.value.trim();
        window.clearTimeout(searchTimer);
        if (query.length < 2) {
          hits.replaceChildren();
          return;
        }
        searchTimer = window.setTimeout(async () => {
          const mine = token + 1;
          token = mine;
          try {
            const found = await wishSearch(query);
            if (mine !== token) return;
            hits.replaceChildren();
            if (!found.length) {
              hits.append(el('p', 'profile-note', 'Nichts gefunden.'));
              return;
            }
            found.forEach((hit) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'hit-row';
              const label = hit.film.year ? `${hit.sources.join(' · ')} · ${hit.film.year}` : hit.sources.join(' · ');
              button.append(document.createTextNode(hit.film.title || 'Film'), el('small', null, label));
              button.addEventListener('click', async () => {
                button.disabled = true;
                const message = await addFilmToList(list.id, hit.film, hit.facets);
                setWishStatus(message || 'Hinzugefügt.');
                if (!message) {
                  search.value = '';
                  hits.replaceChildren();
                } else button.disabled = false;
              });
              hits.append(button);
            });
          } catch {
            if (mine === token) hits.replaceChildren(el('p', 'profile-note', 'Keine Verbindung.'));
          }
        }, 250);
      });
      root.append(add, search, hits);
      const status = el('p', 'profile-status', '');
      status.id = 'wish-status';
      status.setAttribute('role', 'status');
      root.append(status);
      const items = el('div');
      items.id = 'wish-items';
      const done = el('div');
      done.id = 'wish-done';
      root.append(items, done);
    }
    const token = wishViewToken + 1;
    wishViewToken = token;
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.wishDetail) return;
    cloud.wishDetail(list.id).then((items) => {
      if (token !== wishViewToken || profileMode !== 'wish' || wishOpenId !== list.id) return;
      wishItems = items || [];
      fillWishItems(list);
    }).catch(() => {
      if (token === wishViewToken) setWishStatus('Keine Verbindung.');
    });
  }

  function paintWishManage(list) {
    const details = document.createElement('details');
    details.className = 'wish-manage';
    const summary = document.createElement('summary');
    summary.textContent = 'Verwalten';
    details.append(summary);
    const me = account && account.id;
    if (list.role === 'owner') {
      const name = document.createElement('input');
      name.type = 'text';
      name.value = list.title;
      name.setAttribute('aria-label', 'Titel');
      const rename = lineButton('Umbenennen');
      rename.addEventListener('click', async () => {
        const title = name.value.trim();
        if (!title) return;
        try {
          await globalThis.Cloud.renameWishlist(list.id, title);
          await loadWishlists();
        } catch (error) {
          setWishStatus(wishFail(error));
        }
      });
      details.append(name, rename);
      const add = lineButton('Mitglied hinzufügen');
      const box = el('div', 'wish-chips');
      box.hidden = true;
      add.addEventListener('click', () => {
        box.hidden = false;
        box.replaceChildren();
        const have = new Set(list.members.map((person) => person.id));
        const people = mutualPeople().filter((person) => !have.has(person.id));
        if (!people.length) {
          box.append(el('p', 'profile-note', 'Keine weiteren gegenseitigen Folgen.'));
          return;
        }
        people.forEach((person) => {
          const chip = el('button', 'wish-chip', person.username || person.name);
          chip.type = 'button';
          chip.addEventListener('click', async () => {
            chip.disabled = true;
            try {
              await globalThis.Cloud.addWishlistMember(list.id, person.id);
              await loadWishlists();
            } catch (error) {
              chip.disabled = false;
              setWishStatus(wishFail(error, true));
            }
          });
          box.append(chip);
        });
      });
      details.append(add, box);
      list.members.forEach((person) => {
        if (person.id === me) return;
        const line = el('div', 'name-line');
        line.append(el('span', null, person.username));
        const remove = lineButton('Entfernen');
        remove.addEventListener('click', async () => {
          try {
            await globalThis.Cloud.removeWishlistMember(list.id, person.id);
            await loadWishlists();
          } catch (error) {
            setWishStatus(wishFail(error));
          }
        });
        line.append(remove);
        details.append(line);
      });
      const wipe = document.createElement('input');
      wipe.type = 'text';
      wipe.placeholder = 'löschen';
      wipe.setAttribute('aria-label', 'löschen eingeben');
      const destroy = lineButton('Liste löschen');
      destroy.disabled = true;
      wipe.addEventListener('input', () => {
        destroy.disabled = wipe.value.trim().toLocaleLowerCase('de') !== 'löschen';
      });
      destroy.addEventListener('click', async () => {
        try {
          await globalThis.Cloud.deleteWishlist(list.id);
          wishOpenId = null;
          await loadWishlists();
          renderProfile();
        } catch (error) {
          setWishStatus(wishFail(error));
        }
      });
      details.append(wipe, destroy);
    } else {
      const leave = lineButton('Liste verlassen');
      leave.addEventListener('click', async () => {
        try {
          await globalThis.Cloud.leaveWishlist(list.id);
          wishOpenId = null;
          await loadWishlists();
          renderProfile();
        } catch (error) {
          setWishStatus(wishFail(error));
        }
      });
      details.append(leave);
    }
    return details;
  }

  async function changeWishVote(item) {
    try {
      await globalThis.Cloud.voteWishlist(item.id, !item.mine);
      await loadWishlists();
    } catch (error) {
      setWishStatus(wishFail(error));
    }
  }

  async function changeWishStatus(item) {
    try {
      await globalThis.Cloud.setWishlistStatus(item.id, item.status === 'geschaut' ? 'offen' : 'geschaut');
      await loadWishlists();
    } catch (error) {
      setWishStatus(wishFail(error));
    }
  }

  async function removeWishItem(item) {
    try {
      await globalThis.Cloud.removeWishlistItem(item.id);
      await loadWishlists();
    } catch (error) {
      setWishStatus(wishFail(error));
    }
  }

  async function addFilmToList(listId, film, facets) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.addWishlistItem || !film) return 'Keine Verbindung.';
    let next = film;
    const base = facets || facetsOf(film);
    if (!film.fromCatalog) {
      next = withCanonicalId({ ...film, genres: film.genres || [] }, base || {});
      try {
        await cloud.upsertFilm(filmCatalogPayload(next, base));
      } catch (error) {
        return wishFail(error);
      }
    }
    if (wishOpenId === listId && wishItems.some((item) => item.filmId === next.id)) return 'Schon auf der Liste';
    try {
      await cloud.addWishlistItem(listId, next.id);
    } catch (error) {
      if (isWishDuplicate(error)) return 'Schon auf der Liste';
      if (film.fromCatalog) {
        try {
          await cloud.upsertFilm(filmCatalogPayload(next, base));
          await cloud.addWishlistItem(listId, next.id);
        } catch (again) {
          if (isWishDuplicate(again)) return 'Schon auf der Liste';
          return wishFail(again);
        }
      } else return wishFail(error);
    }
    loadWishlists();
    return '';
  }

  async function followedFilmPool() {
    if (followedFilmCache) return followedFilmCache;
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.followedFilms) return [];
    if (!(profileLists.following || []).length && cloud.followNames) {
      const names = await cloud.followNames().catch(() => null);
      if (names) applyFollowLists(names);
    }
    const ids = (profileLists.following || []).map((person) => person.id);
    followedFilmCache = await cloud.followedFilms(ids);
    return followedFilmCache;
  }

  async function wishSearch(query) {
    const q = query.trim().toLocaleLowerCase('de');
    if (q.length < 2) return [];
    const hits = new Map();
    const add = (film, source, filmFacets, fromCatalog) => {
      if (!film || !film.id) return;
      const current = hits.get(film.id) || { film, sources: [], facets: filmFacets || null, fromCatalog: true };
      if (source && !current.sources.includes(source)) current.sources.push(source);
      if (filmFacets && !current.facets) current.facets = filmFacets;
      if (!fromCatalog) current.fromCatalog = false;
      current.film = { ...film, fromCatalog: current.fromCatalog };
      hits.set(film.id, current);
    };
    FILMS.forEach((film) => {
      const blob = `${film.title || ''} ${film.original || ''}`.toLocaleLowerCase('de');
      if (blob.includes(q)) add(film, 'Archiv', facetsOf(film), false);
    });
    const followed = await followedFilmPool();
    followed.forEach((row) => {
      const blob = `${row.film.title || ''} ${row.film.original_title || ''}`.toLocaleLowerCase('de');
      if (!blob.includes(q)) return;
      add({
        id: row.film.id,
        title: row.film.title,
        original: row.film.original_title,
        year: row.film.year || '',
        poster: row.film.poster || '',
        facets: row.film.facets,
        fromCatalog: true,
      }, (row.names || []).join(' · ') || 'Gefolgt', row.film.facets, true);
    });
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json().catch(() => null);
      if (response.ok && data && data.film) {
        const film = withCanonicalId(data.film, data.facets || {});
        if (!hits.has(film.id)) add({ ...film, fromCatalog: false }, 'TMDB', data.facets, false);
      }
    } catch {
      /* TMDB bleibt aus */
    }
    return [...hits.values()].slice(0, 12);
  }

  async function openNewWishlist() {
    clearSelection();
    if (mode !== 'profile') {
      skipProfileHome = true;
      setMode('profile');
    }
    if (globalThis.Cloud && globalThis.Cloud.followNames) {
      const names = await globalThis.Cloud.followNames().catch(() => null);
      if (names) applyFollowLists(names);
    }
    paintWishCreate();
  }

  function paintWishCreate() {
    const root = profileRoot();
    if (!root) return;
    profileMode = 'wish-new';
    wishOpenId = null;
    root.classList.remove('profile-list');
    root.replaceChildren();
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = 'Zurück';
    back.addEventListener('click', () => renderProfile());
    root.append(back, el('h1', null, 'Neue Wunschliste'));
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Titel';
    input.setAttribute('aria-label', 'Titel');
    root.append(input, el('h2', 'profile-kicker', 'Mitglieder'));
    const picked = new Set();
    const people = mutualPeople();
    if (!people.length) root.append(el('p', 'profile-note', 'Noch keine gegenseitigen Folgen.'));
    const chips = el('div', 'wish-chips');
    people.forEach((person) => {
      const chip = el('button', 'wish-chip', person.username || person.name);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        if (picked.has(person.id)) picked.delete(person.id);
        else picked.add(person.id);
        chip.setAttribute('aria-pressed', picked.has(person.id) ? 'true' : 'false');
      });
      chips.append(chip);
    });
    const save = lineButton('Anlegen');
    const status = el('p', 'profile-status', '');
    status.setAttribute('role', 'status');
    save.addEventListener('click', async () => {
      const title = input.value.trim();
      if (!title) {
        status.textContent = 'Titel eintragen.';
        return;
      }
      save.disabled = true;
      try {
        const id = await globalThis.Cloud.createWishlist(title, [...picked]);
        await loadWishlists({ quiet: true });
        openWishlist(id);
      } catch (error) {
        save.disabled = false;
        status.textContent = wishFail(error, true);
      }
    });
    root.append(chips, save, status);
  }

  function paintWishSlot(slot, film) {
    const button = lineButton('Zu Wunschliste hinzufügen');
    const box = el('div', 'wish-choices');
    button.addEventListener('click', async () => {
      box.replaceChildren();
      if (!wishLists.length) await loadWishlists({ quiet: true });
      if (!wishLists.length) {
        const link = lineButton('Neue Wunschliste');
        link.addEventListener('click', () => openNewWishlist());
        box.append(el('p', 'profile-note', 'Noch keine Wunschliste.'), link);
        return;
      }
      wishLists.forEach((list) => {
        const choice = lineButton(list.title);
        choice.addEventListener('click', async () => {
          choice.disabled = true;
          const message = await addFilmToList(list.id, film, facetsOf(film));
          box.replaceChildren(el('p', 'profile-status', message || 'Hinzugefügt.'));
        });
        box.append(choice);
      });
    });
    slot.append(button, box);
  }

  async function showWishHints() {
    const cloud = globalThis.Cloud;
    const host = document.getElementById('wish-hint');
    if (!cloud || !cloud.watchedWishItems || !host || !account) return;
    readWishSeen();
    let rows = [];
    try {
      rows = await cloud.watchedWishItems();
    } catch {
      return;
    }
    const pending = rows.filter((row) => row.id && !wishSeen.hints.includes(row.id));
    if (!pending.length) return;
    pending.forEach((row) => wishSeen.hints.push(row.id));
    writeWishSeen();
    host.replaceChildren();
    pending.forEach((row) => {
      const made = row.film ? filmFromCatalog(row.film) : null;
      const film = (made && byId.get(made.id)) || made || {
        id: row.filmId,
        title: 'diesen Film',
        year: '',
        genres: [],
        cast: [],
        director: '',
        imdbLabel: '–',
      };
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Ihr habt ${film.title} zusammen geschaut – jetzt bewerten`;
      button.addEventListener('click', () => {
        host.hidden = true;
        openFilm(film);
        requestAnimationFrame(() => {
          const slider = document.getElementById('own-rate');
          if (slider) slider.focus();
        });
      });
      host.append(button);
    });
    host.hidden = false;
  }

  function paintProfile() {
    const root = profileRoot();
    if (!root) return;
    root.classList.remove('profile-list');
    const name = (account && (account.display_name || account.username)) || 'Profil';
    const handle = account && account.username ? `@${account.username}` : '';
    const films = profileStats ? String(profileStats.films) : String(FILMS.length);
    const followers = profileStats ? String(profileStats.followers) : '–';
    const following = profileStats ? String(profileStats.following) : '–';
    root.replaceChildren();
    root.append(el('h1', null, name));
    root.append(el('p', 'handle', handle));
    root.append(paintFinder());
    const stats = el('div', 'profile-stats');
    stats.append(
      statNode(films, 'Filme'),
      statNode(followers, 'Follower', () => paintNames('Follower', profileLists.followers, 'followers')),
      statNode(following, 'Folgt', () => paintNames('Folgt', profileLists.following, 'following')),
    );
    root.append(stats);
    paintRequests(root);
    if (profileStatus) root.append(el('p', 'profile-status', profileStatus));
    paintTop(root);
    const people = personMaps();
    root.append(paintPeople('actors', 'Lieblingsschauspieler', people.actors));
    root.append(paintPeople('directors', 'Lieblingsregie', people.directors));
    root.append(paintWishHome());
    root.append(paintSettings());
  }

  function renderProfile() {
    viewingId = null;
    listKind = '';
    wishOpenId = null;
    profileMode = 'home';
    profileToken += 1;
    paintProfile();
    loadProfileCloud(profileToken);
  }

  async function leave() {
    if (leaving) return;
    leaving = true;
    relayoutJob += 1;
    if (followChannel && globalThis.Cloud && globalThis.Cloud.client) {
      globalThis.Cloud.client.removeChannel(followChannel);
    }
    followChannel = null;
    profileStats = null;
    profileLists = { followers: [], following: [], requests: [] };
    otherCache = new Map();
    followedCache = null;
    viewingId = null;
    listKind = '';
    stopCompare();
    wishLists = [];
    wishOpenId = null;
    wishItems = [];
    wishFresh = new Set();
    followedFilmCache = null;
    followDot = false;
    wishDot = false;
    if (wishReloadTimer) window.clearTimeout(wishReloadTimer);
    if (wishChannel && globalThis.Cloud && globalThis.Cloud.client) {
      globalThis.Cloud.client.removeChannel(wishChannel);
    }
    wishChannel = null;
    wishChannelKey = '';
    const hint = document.getElementById('wish-hint');
    if (hint) {
      hint.hidden = true;
      hint.replaceChildren();
    }
    profileMail = null;
    profileStatus = '';
    if (modeProfile) {
      const dot = modeProfile.querySelector('.profile-dot');
      if (dot) dot.hidden = true;
    }
    if (globalThis.Store && globalThis.Store.clearUser) globalThis.Store.clearUser();
    archive = null;
    FILMS = [];
    byId.clear();
    started = false;
    account = null;
    selectedId = null;
    wall.replaceChildren();
    wall.hidden = true;
    networkEl.hidden = true;
    panel.hidden = true;
    document.body.classList.remove('has-selection', 'is-network', 'is-rating', 'is-profile');
    const profile = document.getElementById('profile');
    if (profile) {
      profile.hidden = true;
      profile.replaceChildren();
    }
    closeSheet();
    if (network && network.setFilms) network.setFilms([]);
    try {
      if (globalThis.Cloud && globalThis.Cloud.signOut) await globalThis.Cloud.signOut();
    } catch {
      /* die lokale Sitzung ist schon zu */
    }
    lockScreen();
    renderAuth('in');
    leaving = false;
  }

  function finishImport() {
    try {
      if (localStorage.getItem('moviebylucia-import-pending') !== '1') return;
      localStorage.removeItem('moviebylucia-import-pending');
    } catch {
      return;
    }
    if (globalThis.Store && globalThis.Store.clearLegacy) globalThis.Store.clearLegacy();
  }

  async function retrySync() {
    if (!globalThis.Store) return;
    try {
      const empty = await globalThis.Store.cloudEmpty();
      if (empty === false) {
        await globalThis.Store.pull();
        const current = globalThis.Store.current();
        if (current) {
          adoptArchive(current);
          if (!started) await startApp();
          else showRoster();
        }
        showSyncState(false);
      } else {
        const ok = await globalThis.Store.flush();
        if (ok) finishImport();
      }
    } catch {
      showSyncState(true);
    }
  }

  function openImport() {
    const preview = globalThis.Store.legacyPreview(idMap, starterIds());
    if (!preview) {
      openSheet(gateView());
      return;
    }
    const box = document.createElement('div');
    box.append(el('h2', null, 'Lokales Archiv in dein Profil übernehmen?'));
    box.append(el('p', null, `${countWord(preview.ratings, 'Wertung', 'Wertungen')}, ${countWord(preview.films, 'Film', 'Filme')}, ${countWord(preview.corrections, 'Korrektur', 'Korrekturen')}`));
    const take = choiceButton('Übernehmen');
    const skip = choiceButton('Nicht übernehmen');
    take.addEventListener('click', async () => {
      take.disabled = true;
      skip.disabled = true;
      const installed = globalThis.Store.replace(preview.data);
      try { localStorage.setItem('moviebylucia-import-pending', '1'); } catch { /* die Übernahme bleibt im Cache */ }
      adoptArchive(installed);
      closeSheet();
      await startApp();
      const ok = await globalThis.Store.flush();
      if (ok) finishImport();
    });
    skip.addEventListener('click', () => openSheet(gateView()));
    box.append(take, skip);
    openSheet(box);
  }

  async function openSession(session, registered) {
    if (!session || !session.user || !globalThis.Cloud || !globalThis.Cloud.client) {
      lockScreen();
      renderAuth('in', 'Keine Verbindung.');
      return;
    }
    globalThis.Store.bind({
      userId: session.user.id,
      client: globalThis.Cloud.client,
      starterIds,
      catalog: catalogRow,
    });
    globalThis.Store.setSyncError(showSyncState);
    try {
      account = await globalThis.Cloud.profile();
      if (account && !account.id) account.id = session.user.id;
    } catch {
      const meta = session.user.user_metadata || {};
      account = {
        id: session.user.id,
        username: meta.username || '',
        display_name: meta.username || '',
        is_private: false,
      };
    }
    watchFollows(session.user.id);
    readWishSeen();
    loadWishlists();
    const cached = globalThis.Store.load();
    if (registered) {
      unlockScreen();
      openSheet(gateView());
      queueInvite();
      return;
    }
    if (cached) {
      unlockScreen();
      adoptArchive(cached);
      startApp();
      try {
        const empty = await globalThis.Store.cloudEmpty();
        if (empty === false) {
          await globalThis.Store.pull();
          adoptArchive(globalThis.Store.current());
          showRoster();
        } else {
          const ok = await globalThis.Store.flush();
          if (ok) finishImport();
        }
      } catch {
        showSyncState(true);
      }
      return;
    }
    let empty = null;
    try {
      empty = await globalThis.Store.cloudEmpty();
    } catch {
      empty = null;
    }
    if (empty === false) {
      try {
        await globalThis.Store.pull();
        unlockScreen();
        adoptArchive(globalThis.Store.current());
        startApp();
      } catch {
        unlockScreen();
        showSyncState(true);
        if (!started) openSheet(gateView());
        queueInvite();
      }
      return;
    }
    unlockScreen();
    if (empty === true && globalThis.Store.hasLegacy()) {
      openImport();
      return;
    }
    if (empty === null) showSyncState(true);
    openSheet(gateView());
    queueInvite();
  }

  function renderAuth(view, notice) {
    const card = document.getElementById('gate-card');
    if (!card) return;
    card.replaceChildren();
    const error = el('p', 'auth-error', notice || '');
    error.setAttribute('role', 'status');

    if (view === 'password') {
      card.append(el('h1', null, 'Neues Passwort setzen'));
      const first = authField('Neues Passwort', 'password', 'password', 'new-password');
      const second = authField('Passwort wiederholen', 'password', 'repeat', 'new-password');
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Passwort setzen';
      const form = document.createElement('form');
      form.append(first.wrap, second.wrap, error, save);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = first.input.value;
        if (password.length < 6) {
          error.textContent = 'Das Passwort ist zu kurz.';
          return;
        }
        if (password !== second.input.value) {
          error.textContent = 'Die Passwörter stimmen nicht überein.';
          return;
        }
        save.disabled = true;
        try {
          await globalThis.Cloud.updatePassword(password);
          const session = await globalThis.Cloud.getSession();
          await openSession(session, false);
        } catch (cause) {
          error.textContent = authText(cause);
          save.disabled = false;
        }
      });
      card.append(form);
      first.input.focus();
      return;
    }

    if (view === 'forgot') {
      card.append(el('h1', null, 'Passwort vergessen?'));
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Zurück zur Anmeldung';
      back.addEventListener('click', () => renderAuth('in'));
      recoveryEnabled().then((enabled) => {
        if (!enabled) {
          card.insertBefore(el('p', 'auth-note', 'Melde dich bei Luciano.'), back);
          return;
        }
        const name = authField('Benutzername', 'text', 'username', 'username');
        const send = document.createElement('button');
        send.type = 'submit';
        send.textContent = 'Link schicken';
        const form = document.createElement('form');
        form.append(name.wrap, error, send);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const username = name.input.value.trim().toLowerCase();
          if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            error.textContent = 'Der Benutzername braucht 3 bis 20 Zeichen: a–z, 0–9 oder _.';
            return;
          }
          send.disabled = true;
          try {
            const response = await fetch('/api/recovery?action=reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username }),
            });
            const data = await response.json().catch(() => null);
            if (response.status === 503) {
              error.textContent = 'Melde dich bei Luciano.';
              return;
            }
            error.textContent = (data && data.message) || 'Falls eine bestätigte E-Mail hinterlegt ist, wurde ein Link verschickt.';
          } catch {
            error.textContent = 'Keine Verbindung.';
            send.disabled = false;
          }
        });
        card.insertBefore(form, back);
        name.input.focus();
      });
      card.append(back);
      return;
    }

    const signingIn = view !== 'up';
    card.append(el('h1', null, signingIn ? 'Anmelden' : 'Registrieren'));
    const name = authField('Benutzername', 'text', 'username', 'username');
    const password = authField('Passwort', 'password', 'password', signingIn ? 'current-password' : 'new-password');
    const form = document.createElement('form');
    form.append(name.wrap, password.wrap);
    let repeat = null;
    let mail = null;
    let nameHint = null;
    if (!signingIn) {
      repeat = authField('Passwort wiederholen', 'password', 'repeat', 'new-password');
      form.append(repeat.wrap);
      nameHint = el('p', 'auth-hint', '');
      form.append(nameHint);
      let nameToken = 0;
      name.input.addEventListener('input', () => {
        const token = nameToken + 1;
        nameToken = token;
        const value = name.input.value.trim().toLowerCase();
        if (!value) {
          nameHint.textContent = '';
          return;
        }
        if (!/^[a-z0-9_]{3,20}$/.test(value)) {
          nameHint.textContent = '3 bis 20 Zeichen: a–z, 0–9 oder _.';
          return;
        }
        nameHint.textContent = '';
        window.setTimeout(async () => {
          if (token !== nameToken) return;
          try {
            const free = await globalThis.Cloud.usernameAvailable(value);
            if (token !== nameToken) return;
            nameHint.textContent = free ? '' : 'Dieser Benutzername ist vergeben.';
          } catch {
            if (token !== nameToken) return;
            nameHint.textContent = 'Keine Verbindung.';
          }
        }, 400);
      });
      recoveryEnabled().then((enabled) => {
        if (!enabled || !form.isConnected) return;
        mail = authField('E-Mail (freiwillig, nur zum Zurücksetzen)', 'email', 'email', 'email');
        form.insertBefore(mail.wrap, error);
      });
    }
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = signingIn ? 'Anmelden' : 'Registrieren';
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.textContent = signingIn ? 'Registrieren' : 'Anmelden';
    swap.addEventListener('click', () => renderAuth(signingIn ? 'up' : 'in'));
    form.append(error, submit, swap);
    if (signingIn) {
      const forgot = document.createElement('button');
      forgot.type = 'button';
      forgot.textContent = 'Passwort vergessen?';
      forgot.addEventListener('click', () => renderAuth('forgot'));
      form.append(forgot);
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = name.input.value.trim().toLowerCase();
      const secret = password.input.value;
      if (!username || !secret) {
        error.textContent = 'Bitte Benutzername und Passwort eintragen.';
        return;
      }
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        error.textContent = 'Der Benutzername braucht 3 bis 20 Zeichen: a–z, 0–9 oder _.';
        return;
      }
      if (secret.length < 6) {
        error.textContent = 'Das Passwort ist zu kurz.';
        return;
      }
      if (repeat && secret !== repeat.input.value) {
        error.textContent = 'Die Passwörter stimmen nicht überein.';
        return;
      }
      if (!signingIn && nameHint && nameHint.textContent === 'Dieser Benutzername ist vergeben.') {
        error.textContent = 'Dieser Benutzername ist vergeben.';
        return;
      }
      const email = mail && mail.input.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error.textContent = 'Die E-Mail sieht ungültig aus.';
        return;
      }
      submit.disabled = true;
      try {
        if (signingIn) {
          const data = await globalThis.Cloud.signIn(username, secret);
          await openSession(data.session, false);
          return;
        }
        const data = await globalThis.Cloud.signUp(username, secret, email || undefined);
        if (!data || !data.session) {
          error.textContent = 'Die Anmeldung ist noch nicht frei. Schalte die E-Mail-Bestätigung im Supabase-Dashboard aus.';
          submit.disabled = false;
          return;
        }
        if (email && data.session.access_token && await recoveryEnabled()) {
          try {
            await fetch('/api/recovery?action=verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${data.session.access_token}`,
              },
              body: JSON.stringify({ email }),
            });
          } catch {
            /* registriert, die Bestätigung kann später nochmal geschickt werden */
          }
        }
        await openSession(data.session, true);
      } catch (cause) {
        error.textContent = authText(cause);
        submit.disabled = false;
      }
    });
    form.append(el('p', 'auth-note', 'Notizen bleiben privat.'));
    card.append(form);
    name.input.focus();
  }

  async function enterAccount() {
    lockScreen();
    if (!document.querySelector('#gate-card form')) renderAuth('in');
    await readyCloud();
    if (!globalThis.Cloud || !globalThis.Cloud.enabled) {
      renderAuth('in', globalThis.Cloud && globalThis.Cloud.error ? 'Keine Verbindung.' : 'Anmeldung ist nicht eingerichtet.');
      return;
    }
    globalThis.Cloud.onAuthChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        lockScreen();
        renderAuth('password');
      }
    });
    let session = null;
    try {
      session = await globalThis.Cloud.getSession();
    } catch {
      renderAuth('in', 'Keine Verbindung.');
      return;
    }
    if (recoveryLink && session) {
      renderAuth('password');
      return;
    }
    if (!session) return;
    await openSession(session, false);
  }

  async function boot() {
    wall.hidden = true;
    networkEl.hidden = true;
    if (needsProfile()) renderAuth('in');
    try {
      const response = await fetch('data/added-films.json');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) starterAdded = data.filter((film) => film && film.id && film.title);
      }
    } catch {
      /* ohne Zusatzfilme bleibt die Startliste bei films.js */
    }
    let facetTable = {};
    try {
      const facetsResponse = await fetch('data/facets.json');
      if (facetsResponse.ok) {
        const data = await facetsResponse.json();
        if (data && typeof data === 'object' && !Array.isArray(data)) facetTable = canonicalFacets(data);
      }
    } catch {
      /* ohne Facetten bleiben die alten IDs */
    }
    (window.FILMS || []).forEach(rekeyFilm);
    starterAdded.forEach(rekeyFilm);
    await ensureGraphPoints();
    rekeyGraphPoints();
    overlayFacets(facetTable);
    if (needsProfile()) {
      await enterAccount();
      return;
    }
    const existing = globalThis.Store.load();
    if (existing && globalThis.Store.migrateIds) globalThis.Store.migrateIds(idMap);
    if (existing) {
      adoptArchive(existing);
      startApp();
      return;
    }
    openSheet(gateView());
  }

  boot();
})();
