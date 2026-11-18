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
  const netRating = document.getElementById('net-rating');
  const MODE_KEY = 'moviebylucia-view-v1';

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
  let selectedId = null;
  let links = [];
  let activeLinkId = null;
  let spotlight = null;
  let lastTapAt = 0;
  let lastTapId = null;

  function showStoreError() {
    const note = document.getElementById('store-note');
    if (!note) return;
    note.hidden = false;
    note.textContent = 'Der Speicher ist voll. Neue Änderungen bleiben nur in dieser Sitzung.';
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
    return {
      watched: !!row.watched,
      favorite: !!row.favorite,
      next: !!row.next,
      rating: typeof row.rating === 'number' && Number.isFinite(row.rating) && row.rating > 0 ? row.rating : null,
      memo: typeof row.memo === 'string' ? row.memo : '',
    };
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
    state[id] = { ...entry(id), ...patch };
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

  function posterSrc(film) {
    return posters.get(film.id) || placeholder(film);
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
    const row = entry(film.id);
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
    if (film.genres.length) {
      const pills = el('ul', 'pills');
      film.genres.forEach((genre) => pills.append(el('li', null, genre)));
      genreRow.append(pills);
    }
    genreRow.append(remove);
    head.append(genreRow);
    panel.append(head);

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
    const edit = el('button', 'text-button', 'Bearbeiten');
    edit.type = 'button';
    edit.addEventListener('click', () => beginEdit(film));
    const needsReview = full.source === 'tmdb' && full.reviewed === false;
    if (!editing && !needsReview) heading.append(edit);
    section.append(heading);
    if (!editing && needsReview) {
      const note = el('p', 'review-note');
      note.append(document.createTextNode('Merkmale aus TMDB übernommen – bitte prüfen'));
      note.append(edit);
      section.append(note);
    }
    section.append(editing ? traitEditor(film) : traitView(full));
    panel.append(section);
  }

  function savedMode() {
    try {
      const raw = localStorage.getItem(MODE_KEY);
      if (raw === 'director' || raw === 'rating' || raw === 'network') return raw;
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
    if (next !== 'network') {
      spotlight = null;
      renderBar();
    }
    mode = next;
    ratingView = next === 'rating';
    rememberMode(next);
    modeNetwork.setAttribute('aria-selected', next === 'network' ? 'true' : 'false');
    modeDirector.setAttribute('aria-selected', next === 'director' ? 'true' : 'false');
    modeRating.setAttribute('aria-selected', next === 'rating' ? 'true' : 'false');
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
      Object.entries(data.posters || {}).forEach(([id, url]) => {
        if (typeof url === 'string' && url && posters.get(id) !== url) {
          posters.set(id, url);
          const image = wall.querySelector(`[data-id="${id}"] img`);
          if (image) image.src = url;
          changed = true;
        }
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
  netRating.addEventListener('click', () => {
    netRatingOn = !netRatingOn;
    netRating.setAttribute('aria-pressed', netRatingOn ? 'true' : 'false');
    if (network) network.setRating(netRatingOn);
  });

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

  async function loadStoredFacets() {
    try {
      const response = await fetch('data/facets.json');
      if (!response.ok) return;
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      overlayFacets(canonicalFacets(data));
      FILMS.forEach(patchFilmFromFacets);
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
    if (started) return Promise.resolve(showRoster());
    started = true;
    const ready = setMode(savedMode());
    loadPosters();
    loadStoredFacets();
    ensureVocab().catch(() => {
      /* Bearbeiten holt das Vokabular erneut */
    });
    return ready;
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

  async function boot() {
    wall.hidden = true;
    networkEl.hidden = true;
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
