(() => {
  const ADDED_KEY = 'moviebylucia-added-v1';
  const REMOVED_KEY = 'moviebylucia-removed-v1';
  let removed = new Set(loadRemoved());
  let FILMS = (window.FILMS || []).filter((film) => !removed.has(film.id));
  const STORE = 'moviebylucia-v1';
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

  const state = loadState();
  const byId = new Map(FILMS.map((film) => [film.id, film]));
  const posters = new Map();
  let added = loadAdded().filter((film) => !removed.has(film.id) && !FILMS.some((item) => item.id === film.id));
  FILMS = FILMS.concat(added);
  added.forEach((film) => byId.set(film.id, film));
  added.forEach((film) => {
    if (film.poster) posters.set(film.id, film.poster);
  });

  let mode = 'network';
  let ratingView = false;
  let network = null;
  let networkReady = false;
  let netRatingOn = false;
  let selectedId = null;
  let links = [];
  let activeLinkId = null;
  let spotlight = null;
  let lastTapAt = 0;
  let lastTapId = null;
  let wires = null;

  function loadRemoved() {
    try {
      const raw = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string' && id) : [];
    } catch {
      return [];
    }
  }

  function saveRemoved() {
    try {
      localStorage.setItem(REMOVED_KEY, JSON.stringify([...removed]));
    } catch {
      /* private mode can refuse storage; the session still works */
    }
  }

  function loadAdded() {
    try {
      const raw = JSON.parse(localStorage.getItem(ADDED_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((film) => film && film.id && film.title) : [];
    } catch {
      return [];
    }
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
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
    removed.add(id);
    saveRemoved();
    added = added.filter((film) => film.id !== id);
    try {
      localStorage.setItem(ADDED_KEY, JSON.stringify(added));
    } catch {
      /* private mode can refuse storage; the session still works */
    }
    delete state[id];
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {
      /* private mode can refuse storage; the session still works */
    }
    FILMS = FILMS.filter((film) => film.id !== id);
    byId.delete(id);
    posters.delete(id);
    clearSelection();
    if (network) {
      network.setFilms(FILMS);
      network.dropFilm(id);
    }
    if (mode !== 'network') buildWall();
  }

  function writeEntry(id, patch) {
    state[id] = { ...entry(id), ...patch };
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {
      /* private mode can refuse storage; the session still works */
    }
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
    wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wires.setAttribute('class', 'wires');
    wires.setAttribute('aria-hidden', 'true');
    wall.append(wires);
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
      requestAnimationFrame(drawLink);
    }
  }

  function setActiveLink(id) {
    if (!id || id === activeLinkId || !links.some((link) => link.id === id)) return;
    activeLinkId = id;
    panel.querySelectorAll('.link').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.id === id);
    });
    drawLink();
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
    requestAnimationFrame(() => requestAnimationFrame(drawLink));
  }

  function drawLink() {
    if (!wires) return;
    wires.replaceChildren();
    const active = links.find((link) => link.id === activeLinkId) || links[0];
    if (!selectedId || !active) return;
    const from = wall.querySelector(`[data-id="${selectedId}"]`);
    const to = wall.querySelector(`[data-id="${active.id}"]`);
    if (!from || !to) return;
    const base = wall.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(a.left - base.left + a.width / 2));
    line.setAttribute('y1', String(a.top - base.top + a.height / 2));
    line.setAttribute('x2', String(b.left - base.left + b.width / 2));
    line.setAttribute('y2', String(b.top - base.top + b.height / 2));
    line.setAttribute('stroke', '#fff');
    line.setAttribute('stroke-width', '1.4');
    if (active.tier === 'mid') line.setAttribute('stroke-dasharray', '7 8');
    if (active.tier === 'weak') line.setAttribute('stroke-dasharray', '2 9');
    wires.append(line);
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
    remove.setAttribute('aria-label', 'Film entfernen');
    remove.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.4h6v2.2H9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3.8 6.4h16.4v2.1H3.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.6 8.5h12.8l-.9 12.1H6.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11.4v6.2M12 11.4v6.2M15 11.4v6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    remove.addEventListener('click', () => removeFilm(film.id));
    panel.append(remove);

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
    if (film.genres.length) {
      const pills = el('ul', 'pills');
      film.genres.forEach((genre) => pills.append(el('li', null, genre)));
      head.append(pills);
    }
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
    appendTraits(full);

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

    const close = el('button', 'close', 'Schließen');
    close.type = 'button';
    close.addEventListener('click', clearSelection);
    panel.append(close);
  }

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

  function appendTraits(full) {
    const chips = [];
    (full.genres || []).forEach((value) => chips.push(traitChip('Genre', value, 'genre')));
    (full.subgenres || []).forEach((value) => chips.push(traitChip('Subgenre', value, 'subgenre')));
    (full.themes || []).forEach((value) => chips.push(traitChip('Thema', value, 'theme')));
    (full.tone || []).forEach((value) => chips.push(traitChip('Ton', value, 'tone')));
    (full.narrative || []).forEach((value) => chips.push(traitChip('Erzählweise', value, 'narrative')));
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
      chips.push(button);
    }
    if (full.epoch) chips.push(traitChip('Epoche', full.epoch, 'epoch'));
    if (full.place) chips.push(traitChip('Ort', full.place, 'place'));
    if (!chips.length) return;
    const section = el('section', 'group');
    section.append(el('h2', null, 'Merkmale'));
    const list = el('div', 'chips');
    chips.forEach((chip) => list.append(chip));
    section.append(list);
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
        const graph = response.ok ? await response.json() : { nodes: [] };
        view.loadGraph(graph);
      } catch {
        view.loadGraph({ nodes: [] });
      }
      view.build();
      networkReady = true;
      applyNetworkFocus();
      return;
    }
    view.paint();
    view.resize();
    applyNetworkFocus();
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
    if (next === 'network') return showNetwork();
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
      if (changed) {
        requestAnimationFrame(drawLink);
        if (network) network.paint();
      }
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
  const addForm = document.getElementById('add-form');
  const addQuery = document.getElementById('add-query');
  const addStatus = document.getElementById('add-status');

  function closeAdd() {
    addForm.hidden = true;
    addButton.setAttribute('aria-expanded', 'false');
    addStatus.textContent = '';
  }

  function placeFilm(film) {
    if (removed.delete(film.id)) saveRemoved();
    if (byId.has(film.id)) {
      closeAdd();
      openFilm(byId.get(film.id), true);
      return;
    }
    added.push(film);
    localStorage.setItem(ADDED_KEY, JSON.stringify(added));
    FILMS.push(film);
    byId.set(film.id, film);
    if (film.poster) posters.set(film.id, film.poster);
    closeAdd();
    if (mode === 'network' && network) {
      network.setFilms(FILMS);
      network.addFilm(film);
      openFilm(film, true);
      return;
    }
    buildWall();
    openFilm(film, true);
  }

  addButton.addEventListener('click', () => {
    const open = addForm.hidden;
    addForm.hidden = !open;
    addButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) addQuery.focus();
  });

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = addQuery.value.trim();
    if (!query) {
      addStatus.textContent = 'Titel oder IMDb-Link eintragen.';
      return;
    }
    addStatus.textContent = 'Ich hole Cover und IMDb-Wertung.';
    addForm.querySelector('button[type=submit]').disabled = true;
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(query)}`);
      const data = response.ok ? await response.json() : null;
      if (!data?.film) {
        addStatus.textContent = 'Dazu finde ich keinen Film.';
        return;
      }
      addQuery.value = '';
      placeFilm(data.film);
    } catch {
      addStatus.textContent = 'Der Abruf ist gerade nicht möglich.';
    } finally {
      addForm.querySelector('button[type=submit]').disabled = false;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      results.hidden = true;
      if (!addForm.hidden) {
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
    drawLink();
    if (mode === 'network' && network) network.resize();
  });

  async function loadStoredFacets() {
    try {
      const response = await fetch('data/facets.json');
      if (!response.ok) return;
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      globalThis.FILM_FACETS = data;
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

  setMode(savedMode());
  loadPosters();
  loadStoredFacets();
})();
