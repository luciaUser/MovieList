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

  const GROUP_TEXT = {
    'Gleiche Handschrift': 'Same handwriting',
    'Ähnliche Geschichte': 'Similar stories',
    'Ähnliche Stimmung': 'Similar mood',
    'Gleiche Welt': 'Same world',
  };

  function t(key, vars) {
    const api = globalThis.I18n;
    if (!api || typeof key !== 'string') return key;
    return api.any ? api.any(key, vars) : api.t(key, vars);
  }

  function uiLang() {
    const value = globalThis.I18n && globalThis.I18n.lang ? globalThis.I18n.lang() : 'en';
    return value === 'de' ? 'de' : 'en';
  }

  const wall = document.getElementById('wall');
  const panel = document.getElementById('panel');
  const search = document.getElementById('search');
  const results = document.getElementById('results');
  const networkEl = document.getElementById('network');
  const modeNetwork = document.getElementById('mode-network');
  const modeDirector = document.getElementById('mode-director');
  const modeRating = document.getElementById('mode-rating');
  const modeProfile = document.getElementById('mode-profile');
  const modeWish = document.getElementById('mode-wish');
  const netRating = document.getElementById('net-rating');
  const netCompare = document.getElementById('net-compare');
  const MODE_KEY = 'moviebylucia-view-v1';
  const SORT_KEY = 'moviebylucia-wall-sort-v1';
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
  let wallSort = 'director';
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
  let profileLists = { followers: [], following: [], requests: [], outgoing: [] };
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
  let pathOn = false;
  let pathLock = false;
  let pathEpoch = 0;
  let pathSeq = 1;
  let pathState = null;
  let pathSeen = new Set();
  let pathObserver = null;
  let pathHeld = false;
  let pathScrollY = 0;
  const pathPages = new Map();
  let compareId = null;
  let lensId = null;
  let panelList = null;
  let panelListHold = false;
  let wishBoardToken = 0;
  const wishCollapsed = new Set();
  let lensPack = null;
  let guestNet = false;
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
  let wishSearchList = null;
  let upcomingFeedPool = null;
  let wishMarkedId = null;
  let wishFocusId = null;
  let wishUndoTimer = 0;
  const posterFilled = new Set();
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
    note.textContent = t('Der Speicher ist voll. Neue Änderungen bleiben nur in dieser Sitzung.');
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
    retry.textContent = t('erneut versuchen');
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

  function viewEntry(id) {
    if (lensPack && lensPack.entryOf) return lensPack.entryOf(id);
    return entry(id);
  }

  function activeFilms() {
    return lensPack ? lensPack.films : FILMS;
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

  function standardScoreGradient() {
    return 'linear-gradient(90deg, #e4231a 0%, #e4231a 50%, #f08a1a 62%, #f0d04a 74%, #8fce3a 86%, #12a34a 100%)';
  }

  function colorChannels(color) {
    const text = String(color || '').trim();
    if (text.charAt(0) === '#') return hex(text);
    const hsl = hslParts(text);
    if (!hsl) return [207, 207, 207];
    const sat = hsl.s / 100;
    const light = hsl.l / 100;
    const chroma = (1 - Math.abs((2 * light) - 1)) * sat;
    const hp = (((hsl.h % 360) + 360) % 360) / 60;
    const x = chroma * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) { r = chroma; g = x; }
    else if (hp < 2) { r = x; g = chroma; }
    else if (hp < 3) { g = chroma; b = x; }
    else if (hp < 4) { g = x; b = chroma; }
    else if (hp < 5) { r = x; b = chroma; }
    else { r = chroma; b = x; }
    const shift = light - (chroma / 2);
    return [r + shift, g + shift, b + shift].map((channel) => Math.round(channel * 255));
  }

  function profileColorOn() {
    if (!account || !account.id) return false;
    try {
      return localStorage.getItem('moviebylucia-profilecolor:' + account.id) === '1';
    } catch {
      return false;
    }
  }

  function profileGradientStops(avatar) {
    const colors = avatarColors(avatar);
    return [
      { at: 0, color: colors.outer },
      { at: 0.28, color: colors.outer },
      { at: 0.4, color: colors.under },
      { at: 0.52, color: colors.mid },
      { at: 0.68, color: colors.mid },
      { at: 0.84, color: colors.core },
      { at: 1, color: colors.core },
    ];
  }

  function profileGradientCss(avatar) {
    const parts = profileGradientStops(avatar).map((stop) => `${stop.color} ${Math.round(stop.at * 100)}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }

  function profileRatingColor(score, avatar) {
    const stops = profileGradientStops(avatar);
    const place = Math.max(0, Math.min(1, Number(score) / 10));
    if (!Number.isFinite(place)) return stops[0].color;
    let index = 1;
    while (index < stops.length && place > stops[index].at) index += 1;
    const next = stops[Math.min(index, stops.length - 1)];
    const prev = stops[Math.max(0, index - 1)];
    const span = next.at - prev.at;
    const t = span <= 0 ? 0 : (place - prev.at) / span;
    const from = colorChannels(prev.color);
    const to = colorChannels(next.color);
    return `rgb(${from.map((channel, i) => Math.round(channel + (to[i] - channel) * t)).join(',')})`;
  }

  function coverTint(score) {
    if (score == null || Number.isNaN(Number(score))) return '#cfcfcf';
    if (profileColorOn()) return profileRatingColor(score, account && account.avatar);
    return ratingColor(score);
  }

  function applyScoreBar(bar, avatar) {
    const on = profileColorOn();
    bar.classList.toggle('is-profile', on);
    bar.style.setProperty('--score-gradient', on ? profileGradientCss(avatar) : standardScoreGradient());
  }

  function avatarForBar(bar) {
    const row = bar.closest('.member-rate');
    const personId = row && row.dataset.user;
    if (!personId || (account && personId === account.id)) return account && account.avatar;
    const person = panelList && (panelList.members || []).find((member) => member.id === personId);
    return person ? person.avatar : null;
  }

  function readPosterScore(button) {
    const text = (button.querySelector('.poster-score') || {}).textContent || '';
    const match = text.match(/(\d+)[,.](\d)/);
    if (!match) return null;
    return Number(match[1] + '.' + match[2]);
  }

  function refreshForeignTints() {
    document.querySelectorAll('.their-wall .poster, #wish-board .poster').forEach((button) => {
      const score = readPosterScore(button);
      if (score == null) return;
      const tint = button.querySelector('.tint');
      if (tint) tint.style.background = coverTint(score);
      paintWear(button, score);
    });
  }

  function setProfileColor(on) {
    if (account && account.id) {
      try {
        localStorage.setItem('moviebylucia-profilecolor:' + account.id, on ? '1' : '0');
      } catch {
        /* der Schalter bleibt, bis der Speicher wieder geht */
      }
    }
    document.body.classList.toggle('is-profile-color', Boolean(on));
    document.querySelectorAll('#panel .score-bar').forEach((bar) => applyScoreBar(bar, avatarForBar(bar)));
    paint();
    refreshForeignTints();
  }

  function markBox(dashed, checked) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '4.2');
    rect.setAttribute('y', '4.2');
    rect.setAttribute('width', '15.6');
    rect.setAttribute('height', '15.6');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'currentColor');
    rect.setAttribute('stroke-width', '1.6');
    if (dashed) rect.setAttribute('stroke-dasharray', '2.6 2.2');
    svg.append(rect);
    if (checked) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M7.6 12.2 10.5 15.1 16.5 8.7');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.6');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
    }
    return svg;
  }

  function profileColorSwitch() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-color';
    const on = profileColorOn();
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.append(markBox(false, on), el('span', null, t('Profile color')));
    button.addEventListener('click', () => {
      const next = !profileColorOn();
      setProfileColor(next);
      button.setAttribute('aria-pressed', next ? 'true' : 'false');
      const icon = button.querySelector('svg');
      if (icon) icon.replaceWith(markBox(false, next));
    });
    return button;
  }

  // Dreck beginnt knapp unter 5.0 und nimmt stufenlos bis 0 zu.
  // Jede Ebene kriecht vom Rand nach innen: harte Elemente erscheinen zuerst aussen,
  // mit sinkendem Rating wächst die Fläche bis zur Mitte.
  const GRIME_STARTS = [5, 4, 3, 2];
  const GRIME_RAMP = 2;
  const GRIME_FEATHER = 30;

  // -1 = Ebene aus, sonst Fortschritt 0 (nur Rand) bis 1 (ganze Fläche)
  function grimeLayerProgress(rating, level) {
    if (typeof rating !== 'number') return -1;
    const start = GRIME_STARTS[level - 1];
    if (start == null || rating >= start) return -1;
    return Math.min(1, (start - rating) / GRIME_RAMP);
  }

  function grimeTurn(id) {
    const text = String(id || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
    return hash % 4;
  }

  function readPosterLift(id) {
    if (!id) return null;
    try {
      const raw = localStorage.getItem('posterLift:' + id);
      if (raw == null || raw === '') return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  function writePosterLift(id, value) {
    try {
      localStorage.setItem('posterLift:' + id, String(value));
    } catch {
      /* der Faktor wird beim nächsten Poster erneut gemessen */
    }
  }

  const liftJobs = new Set();

  function applyLiftValue(id, factor) {
    const rounded = String(Math.round(factor * 1000) / 1000);
    let nodes = [];
    try {
      nodes = document.querySelectorAll('[data-id="' + CSS.escape(id) + '"]');
    } catch {
      return;
    }
    nodes.forEach((node) => {
      if (!node.classList.contains('poster') && !node.classList.contains('net-film')) return;
      if (!node.classList.contains('is-low')) return;
      node.style.setProperty('--lift', rounded);
    });
  }

  function ensurePosterLift(id, image) {
    if (!id || liftJobs.has(id)) return;
    const cached = readPosterLift(id);
    if (cached != null) {
      applyLiftValue(id, cached);
      return;
    }
    const src = image && (image.currentSrc || image.getAttribute('src') || '');
    if (!src || src.startsWith('data:')) return;
    liftJobs.add(id);
    const finish = (factor) => {
      writePosterLift(id, factor);
      applyLiftValue(id, factor);
    };
    const measure = (source) => {
      let factor = 1;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 48;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('canvas');
        ctx.drawImage(source, 0, 0, 32, 48);
        const data = ctx.getImageData(0, 0, 32, 48).data;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 16) continue;
          sum += ((0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2])) / 255;
          count += 1;
        }
        if (count) {
          const mean = sum / count;
          factor = mean > 0.001 ? 0.42 / mean : 1;
          factor = Math.min(1.8, Math.max(0.8, factor));
        }
      } catch {
        factor = 1;
      }
      finish(factor);
    };
    if (image && image.complete && image.naturalWidth) {
      measure(image);
      return;
    }
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => measure(probe);
    probe.onerror = () => finish(1);
    probe.src = src;
  }

  function paintWear(host, rating) {
    if (!host) return;
    let grime = host.querySelector(':scope > .grime');
    if (!grime) {
      grime = document.createElement('span');
      grime.className = 'grime';
      const tint = host.querySelector(':scope > .tint');
      if (tint) tint.after(grime);
      else host.append(grime);
    }
    grime.dataset.turn = String(grimeTurn(host.dataset.id));
    for (let level = 1; level <= 4; level += 1) {
      let layer = grime.querySelector(':scope > .grime-layer[data-level="' + level + '"]');
      if (!layer) {
        layer = document.createElement('span');
        layer.className = 'grime-layer';
        layer.dataset.level = String(level);
        grime.append(layer);
      }
      const progress = grimeLayerProgress(rating, level);
      if (progress < 0) {
        layer.style.display = 'none';
      } else {
        const reach = 125 * (1 - progress);
        layer.style.display = '';
        layer.style.setProperty('--r', reach.toFixed(1) + '%');
        layer.style.setProperty('--rs', (reach - GRIME_FEATHER).toFixed(1) + '%');
      }
    }
    const low = typeof rating === 'number' && rating <= 5 && !profileColorOn();
    host.classList.toggle('is-low', low);
    if (!low) {
      host.style.removeProperty('--lift');
      return;
    }
    const cached = readPosterLift(host.dataset.id);
    if (cached != null) host.style.setProperty('--lift', String(cached));
    else ensurePosterLift(host.dataset.id, host.querySelector('img'));
  }

  function preloadGrime() {
    [1, 2, 3, 4].forEach((level) => {
      const image = new Image();
      image.src = 'textures/DirtLvlNew' + level + '.png';
    });
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
      activeFilms().forEach((film) => {
        const bucket = ratingBucket(viewEntry(film.id).rating);
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
            (viewEntry(b.id).rating ?? -1) - (viewEntry(a.id).rating ?? -1)
            || a.title.localeCompare(b.title, 'de')
          )),
        }));
    }
    const groups = new Map();
    activeFilms().forEach((film) => {
      const keys = wallKeys(film);
      keys.forEach((key) => {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(film);
      });
    });
    return [...groups.entries()]
      .sort((a, b) => {
        if (wallSort === 'director') {
          if (a[0] === 'Ohne Regie') return 1;
          if (b[0] === 'Ohne Regie') return -1;
          const size = b[1].length - a[1].length;
          if (size) return size;
          return a[0].localeCompare(b[0], 'de');
        }
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

  function wallKeys(film) {
    const source = lensPack ? theirFull(film, lensPack.entryOf(film.id)) : film;
    if (wallSort === 'genre') return [source.cluster || (source.genres && source.genres[0]) || 'Andere'];
    if (wallSort === 'cast') {
      const facets = (globalThis.FILM_FACETS || {})[film.id];
      const names = (Array.isArray(source.cast) && source.cast.length ? source.cast : (facets && facets.cast) || [])
        .filter((name) => typeof name === 'string' && name.trim());
      return names.length ? [names[0]] : ['Ohne Besetzung'];
    }
    return [source.director || 'Ohne Regie'];
  }

  function watchedCount(list) {
    return list.reduce((sum, film) => sum + (viewEntry(film.id).watched ? 1 : 0), 0);
  }

  function myAverage(films) {
    const scores = films
      .map((film) => viewEntry(film.id))
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
      `<text x="250" y="${start + index * 56}" text-anchor="middle" fill="#f2f2f2" font-family="Gilroy, sans-serif" font-size="34">${escapeXml(part)}</text>`
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
    if (!activeFilms().length) {
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
      if (isUnreleased(film)) {
        if (selectedId !== film.id) openFilm(film, false);
        return;
      }
      if (lensPack) {
        openFilm(film, mode === 'network' ? 'near' : false);
        return;
      }
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
    bar.append(el('span', null, `${spotlight.title} · ${count === 1 ? t('1 movie') : t('{n} movies', { n: count })}`));
    const close = el('button', null, '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('Hervorhebung beenden'));
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
    if (mode !== 'network') await setMode('network');
    else resetView();
    spotlight = { title: spec.title, ids, style: spec.style || 'content' };
    renderBar();
    applyNetworkFocus();
    if (network) network.frame(ids);
  }

  function openFilm(film, focus) {
    if (!panelListHold) panelList = null;
    panelListHold = false;
    if (spotlight) {
      spotlight = null;
      renderBar();
    }
    selectedId = film.id;
    links = linksFor(film);
    activeLinkId = (links.find((link) => link.group) || links[0] || {}).id || null;
    const sheetOpening = phoneSheet() && mode === 'network' && panel.hidden;
    renderPanel(film);
    applyNetworkFocus();
    paint();
    if (mode === 'network' && network) {
      const run = () => {
        if (selectedId !== film.id || !network) return;
        network.frame([film.id], { minScale: network.nearScale() });
      };
      if (sheetOpening) window.setTimeout(run, 260);
      else {
        requestAnimationFrame(() => {
          requestAnimationFrame(run);
        });
      }
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

  function closeWishSearch() {
    wishSearchList = null;
    document.body.classList.remove('is-wish-search');
  }

  let panelScrollLock = null;
  let panelSheetToken = 0;
  let panelClosing = false;
  let panelDragging = false;
  let sheetPlace = 'half';
  let sheetFollow = 0;

  function phoneSheet() {
    return window.matchMedia('(max-width: 720px)').matches;
  }

  function panelScroller() {
    if (phoneSheet()) {
      const node = panel.querySelector('.panel-scroll');
      if (node) return node;
    }
    return panel;
  }

  function networkHalf() {
    return phoneSheet() && mode === 'network' && !pathOn;
  }

  function sheetOffset() {
    return Math.round((panel.offsetHeight || window.innerHeight) * 0.5);
  }

  function queueSheetFollow() {
    if (sheetFollow || mode !== 'network' || !network || !network.followPanel) return;
    sheetFollow = window.requestAnimationFrame(() => {
      sheetFollow = 0;
      if (mode === 'network' && network && network.followPanel && !panel.hidden) network.followPanel();
    });
  }

  function lockPanelScroll() {
    if (!phoneSheet() || panelScrollLock || document.body.classList.contains('is-wish-search')) return;
    panelScrollLock = { top: window.scrollY, left: window.scrollX };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${panelScrollLock.top}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }

  function unlockPanelScroll() {
    if (!panelScrollLock) return;
    const saved = panelScrollLock;
    panelScrollLock = null;
    document.documentElement.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(saved.left, saved.top);
  }

  function hidePanelNow() {
    clearGenreFit();
    panel.hidden = true;
    panel.replaceChildren();
    panel.classList.remove('is-sheet');
    panel.style.transition = '';
    panel.style.transform = '';
    panel.style.bottom = '';
    panel.style.maxHeight = '';
    panelDragging = false;
    panelClosing = false;
    sheetPlace = 'half';
    unlockPanelScroll();
  }

  function hidePanel() {
    const phone = phoneSheet() && panel.classList.contains('is-sheet') && !panel.hidden;
    if (!phone) {
      hidePanelNow();
      return;
    }
    if (panelClosing) return;
    panelClosing = true;
    const token = ++panelSheetToken;
    const ms = networkHalf() ? 240 : 260;
    panel.style.transition = `transform ${ms}ms ease-out`;
    panel.style.transform = 'translateY(100%)';
    window.setTimeout(() => {
      if (token !== panelSheetToken) return;
      hidePanelNow();
    }, ms);
  }

  function settleSheet(place) {
    sheetPlace = place === 'full' ? 'full' : 'half';
    const y = sheetPlace === 'full' ? 0 : sheetOffset();
    panel.style.transition = 'transform 240ms ease-out';
    panel.style.transform = `translateY(${y}px)`;
    queueSheetFollow();
    window.setTimeout(queueSheetFollow, 240);
  }

  function revealPanel() {
    panelSheetToken += 1;
    panelClosing = false;
    const phone = phoneSheet();
    const opening = panel.hidden;
    if (!phone) {
      panel.hidden = false;
      panel.classList.remove('is-sheet');
      panel.style.transition = '';
      panel.style.transform = '';
      unlockPanelScroll();
      return;
    }
    panel.classList.add('is-sheet');
    const peek = networkHalf();
    if (!opening) {
      panel.hidden = false;
      if (!panelDragging) {
        if (peek) settleSheet(sheetPlace);
        else {
          panel.style.transition = 'transform 260ms ease-out';
          panel.style.transform = 'translateY(0)';
        }
      }
      return;
    }
    lockPanelScroll();
    panel.style.transition = 'none';
    panel.style.transform = 'translateY(100%)';
    panel.hidden = false;
    if (peek) sheetPlace = 'half';
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (panel.hidden || panelDragging) return;
        if (peek) {
          settleSheet('half');
          return;
        }
        panel.style.transition = 'transform 260ms ease-out';
        panel.style.transform = 'translateY(0)';
      });
    });
  }

  function bindPanelDrag() {
    if (panel.dataset.drag === '1') return;
    panel.dataset.drag = '1';
    let drag = null;
    const finish = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const info = drag;
      drag = null;
      panelDragging = false;
      try { panel.releasePointerCapture(event.pointerId); } catch { /* schon losgelassen */ }
      if (!info.active) return;
      if (info.peek) {
        const height = panel.offsetHeight || window.innerHeight;
        const half = height * 0.5;
        const y = info.yNow;
        if (info.place === 'half') {
          if (y >= half + 90) {
            clearSelection();
            return;
          }
          settleSheet(y <= half - 70 ? 'full' : 'half');
          return;
        }
        settleSheet(y >= 70 ? 'half' : 'full');
        return;
      }
      if (info.pull >= 90) {
        clearSelection();
        return;
      }
      panel.style.transition = 'transform 260ms ease-out';
      panel.style.transform = 'translateY(0)';
    };
    panel.addEventListener('pointerdown', (event) => {
      if (!phoneSheet() || panel.hidden || !panel.classList.contains('is-sheet')) return;
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest('button, a, input, textarea, select')) return;
      const onGrab = Boolean(event.target.closest('.panel-bar'));
      if (!onGrab && panelScroller().scrollTop > 0) return;
      const peek = networkHalf();
      drag = {
        id: event.pointerId,
        y: event.clientY,
        pull: 0,
        onGrab,
        active: false,
        peek,
        place: sheetPlace,
        start: peek && sheetPlace === 'half' ? sheetOffset() : 0,
        yNow: peek && sheetPlace === 'half' ? sheetOffset() : 0,
      };
    });
    panel.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const delta = event.clientY - drag.y;
      if (!drag.active) {
        if (drag.peek && drag.onGrab) {
          if (Math.abs(delta) < 4) return;
        } else if (delta <= 0) return;
        else if (!drag.onGrab && (delta < 8 || panelScroller().scrollTop > 0)) return;
        drag.active = true;
        try { panel.setPointerCapture(event.pointerId); } catch { /* kein Capture */ }
      }
      if (!drag.peek && delta <= 0) {
        drag.pull = 0;
        panelDragging = false;
        panel.style.transition = 'none';
        panel.style.transform = 'translateY(0)';
        return;
      }
      const height = panel.offsetHeight || window.innerHeight;
      const next = drag.peek
        ? Math.max(0, Math.min(height, drag.start + delta))
        : Math.max(0, delta);
      panelDragging = true;
      drag.pull = drag.peek ? Math.abs(next - drag.start) : next;
      drag.yNow = next;
      panel.style.transition = 'none';
      panel.style.transform = `translateY(${Math.round(next)}px)`;
      if (drag.peek) queueSheetFollow();
      event.preventDefault();
    }, { passive: false });
    panel.addEventListener('pointerup', finish);
    panel.addEventListener('pointercancel', finish);
  }

  bindPanelDrag();

  function clearSelection() {
    editDraft = null;
    closeWishSearch();
    panelFilm = null;
    selectedId = null;
    if (placeQueue.length && mode === 'network') armPlaceQueue();
    links = [];
    activeLinkId = null;
    hidePanel();
    document.body.classList.remove('is-path-panel');
    if (pathOn) {
      paint();
      requestAnimationFrame(() => pathLayout());
      if (phoneSheet()) pathHeadIntro();
      return;
    }
    applyNetworkFocus();
    paint();
    if (mode === 'network' && network) requestAnimationFrame(() => network.resize());
  }

  function paint() {
    document.body.classList.toggle('has-selection', Boolean(selectedId));
    document.body.classList.toggle('is-rating', ratingView);
    document.querySelectorAll('.wish-coming-cover').forEach((button) => {
      button.classList.toggle('is-selected', Boolean(selectedId) && button.dataset.id === selectedId);
    });
    wall.querySelectorAll('.poster').forEach((button) => {
      const row = viewEntry(button.dataset.id);
      const selected = button.dataset.id === selectedId;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-rated', row.rating != null);
      button.classList.toggle('is-favorite', row.favorite);
      button.classList.toggle('is-next', row.next);
      const tint = button.querySelector('.tint');
      tint.style.background = row.rating == null ? '' : coverTint(row.rating);
      paintWear(button, row.rating);
      button.querySelector('.poster-score').textContent = row.rating == null
        ? ''
        : `★  ${row.rating.toFixed(1).replace('.', ',')}`;
    });
    document.querySelectorAll('.their-wall .poster').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.id === selectedId);
    });
    document.querySelectorAll('#wish-board .poster').forEach((button) => {
      if (button.classList.contains('wish-plus')) return;
      button.classList.toggle('is-selected', button.dataset.id === selectedId);
    });
    wall.querySelectorAll('.genre-bar').forEach((bar) => {
      const films = bar.dataset.ids.split(',').filter(Boolean).map((id) => (
        lensPack ? lensPack.films.find((film) => film.id === id) : byId.get(id)
      )).filter(Boolean);
      const avg = myAverage(films);
      bar.querySelector('.genre-score').textContent = avg == null ? '' : `★  ${avg.toFixed(1).replace('.', ',')}`;
      bar.querySelector('.genre-count').textContent = films.length === 1 ? t('1 movie') : t('{n} movies', { n: films.length });
    });
    if (network) network.paint();
  }

  let avatarSerial = 0;

  function mulberry32(seed) {
    let state = Number(seed) >>> 0;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hslParts(value) {
    const match = String(value || '').match(/hsl\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%\s*\)/i);
    if (!match) return null;
    return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
  }

  function derivedUnder(outer, mid, seed) {
    const base = hslParts(outer);
    const upper = hslParts(mid);
    const shift = (mulberry32(seed)() * 40) - 20;
    if (!base || !upper) {
      const hue = Math.round((220 + shift + 360) % 360);
      return `hsl(${hue} 40% 50%)`;
    }
    let delta = (upper.h - base.h) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const hue = Math.round((base.h + (delta / 2) + shift + 360) % 360);
    const sat = Math.round((base.s + upper.s) / 2);
    const light = Math.round((base.l + upper.l) / 2);
    return `hsl(${hue} ${sat}% ${light}%)`;
  }

  function avatarColors(avatar) {
    const row = avatar && typeof avatar === 'object' ? avatar : {};
    const outer = row.outer || 'hsl(220 18% 42%)';
    const mid = row.mid || 'hsl(220 12% 58%)';
    const core = row.core || 'hsl(220 8% 74%)';
    return {
      outer,
      mid,
      core,
      under: row.under || derivedUnder(outer, mid, row.seed),
    };
  }

  function avatarSpot(rand, x, y, rx, ry) {
    const nudge = (base, amount) => base + ((rand() * 2 - 1) * amount);
    const scale = (base) => base * (1 + ((rand() * 2 - 1) * 0.05));
    return {
      x: nudge(x, 2).toFixed(1),
      y: nudge(y, 2).toFixed(1),
      rx: scale(rx).toFixed(1),
      ry: scale(ry).toFixed(1),
    };
  }

  function avatarNode(avatar, size) {
    const colors = avatarColors(avatar);
    // gleiche Darstellung wie die Kugel in der Animation (WebGL); ohne WebGL bleibt das SVG
    if (globalThis.GateSky && globalThis.GateSky.sphereImage && globalThis.SphereColours) {
      const url = globalThis.GateSky.sphereImage(globalThis.SphereColours.avatarToWave(colors), 192);
      if (url) {
        const img = document.createElement('img');
        img.className = 'avatar';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.draggable = false;
        img.decoding = 'sync';
        img.width = size || 32;
        img.height = size || 32;
        img.src = url;
        return img;
      }
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const serial = ++avatarSerial;
    const rand = mulberry32(avatar && avatar.seed);
    const under = avatarSpot(rand, 50, 48, 52, 44);
    const mid = avatarSpot(rand, 50, 38, 54, 40);
    const top = avatarSpot(rand, 50, 30, 40, 32);
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', String(size || 32));
    svg.setAttribute('height', String(size || 32));
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('avatar');
    const clip = `av-clip-${serial}`;
    const blurUnder = `av-under-${serial}`;
    const blurMid = `av-mid-${serial}`;
    const blurTop = `av-top-${serial}`;
    const shadeUnder = `av-shade-under-${serial}`;
    const shadeMid = `av-shade-mid-${serial}`;
    const shadeTop = `av-shade-top-${serial}`;
    svg.innerHTML = `
      <defs>
        <clipPath id="${clip}"><circle cx="50" cy="50" r="50"></circle></clipPath>
        <radialGradient id="${shadeUnder}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${colors.under}" stop-opacity="1"></stop>
          <stop offset="50%" stop-color="${colors.under}" stop-opacity="0.85"></stop>
          <stop offset="80%" stop-color="${colors.under}" stop-opacity="0.35"></stop>
          <stop offset="100%" stop-color="${colors.under}" stop-opacity="0"></stop>
        </radialGradient>
        <radialGradient id="${shadeMid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${colors.mid}" stop-opacity="1"></stop>
          <stop offset="50%" stop-color="${colors.mid}" stop-opacity="0.85"></stop>
          <stop offset="80%" stop-color="${colors.mid}" stop-opacity="0.35"></stop>
          <stop offset="100%" stop-color="${colors.mid}" stop-opacity="0"></stop>
        </radialGradient>
        <radialGradient id="${shadeTop}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${colors.core}" stop-opacity="1"></stop>
          <stop offset="35%" stop-color="${colors.core}" stop-opacity="0.9"></stop>
          <stop offset="70%" stop-color="${colors.core}" stop-opacity="0.45"></stop>
          <stop offset="100%" stop-color="${colors.core}" stop-opacity="0"></stop>
        </radialGradient>
        <filter id="${blurUnder}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5"></feGaussianBlur>
        </filter>
        <filter id="${blurMid}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5"></feGaussianBlur>
        </filter>
        <filter id="${blurTop}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4"></feGaussianBlur>
        </filter>
      </defs>
      <g clip-path="url(#${clip})">
        <circle cx="50" cy="50" r="50" fill="${colors.outer}"></circle>
        <ellipse cx="${under.x}" cy="${under.y}" rx="${under.rx}" ry="${under.ry}" fill="url(#${shadeUnder})" filter="url(#${blurUnder})"></ellipse>
        <ellipse cx="${mid.x}" cy="${mid.y}" rx="${mid.rx}" ry="${mid.ry}" fill="url(#${shadeMid})" filter="url(#${blurMid})"></ellipse>
        <ellipse cx="${top.x}" cy="${top.y}" rx="${top.rx}" ry="${top.ry}" fill="url(#${shadeTop})" filter="url(#${blurTop})"></ellipse>
      </g>`;
    return svg;
  }

  const AVATAR_CACHE = 'moviebylucia-avatar-v1';

  function readAvatarCache(id) {
    if (!id) return null;
    try {
      const all = JSON.parse(localStorage.getItem(AVATAR_CACHE) || '{}');
      const row = all[id];
      return row && row.outer && row.mid && row.core ? row : null;
    } catch {
      return null;
    }
  }

  function writeAvatarCache(id, avatar) {
    if (!id || !avatar) return;
    try {
      const all = JSON.parse(localStorage.getItem(AVATAR_CACHE) || '{}');
      all[id] = avatar;
      localStorage.setItem(AVATAR_CACHE, JSON.stringify(all));
    } catch {
      /* die Anzeige bleibt, der nächste erfolgreiche Abruf schreibt neu */
    }
  }

  function spreadAvatar(avatar) {
    if (!account) return;
    account.avatar = avatar;
    paintAvatarTab();
    document.querySelectorAll('#panel .member-rate').forEach((row) => {
      const mine = row.querySelector('.rate') || (account.id && row.dataset.user === account.id);
      if (!mine) return;
      const svg = row.querySelector('.avatar');
      if (svg) svg.replaceWith(avatarNode(avatar, 28));
      const bar = row.querySelector('.score-bar');
      if (!bar) return;
      applyScoreBar(bar, avatar);
    });
    (wishLists || []).forEach((list) => {
      (list.members || []).forEach((person) => {
        if (person.id === account.id) person.avatar = avatar;
      });
    });
    const wishSize = window.matchMedia('(max-width: 720px)').matches ? 18 : 22;
    document.querySelectorAll('#wish-board .wish-person').forEach((node) => {
      if (node.dataset.id !== account.id) return;
      const svg = node.querySelector('.avatar');
      if (svg) svg.replaceWith(avatarNode(avatar, wishSize));
    });
    otherCache.forEach((pack) => {
      if (pack && pack.profile && pack.profile.id === account.id) pack.profile.avatar = avatar;
    });
    if (profileColorOn()) {
      paint();
      refreshForeignTints();
    }
  }

  function paintAvatarTab() {
    const slot = modeProfile && modeProfile.querySelector('.avatar-slot');
    if (!slot) return;
    slot.replaceChildren(avatarNode(account && account.avatar, 24));
  }

  function scoreBar(avatar, value, editable) {
    const wrap = el('div', 'score-bar');
    const amount = value == null ? 0 : Math.max(0, Math.min(10, Number(value)));
    wrap.style.setProperty('--p', `${amount * 10}%`);
    applyScoreBar(wrap, avatar);
    wrap.append(el('span', 'score-fill'));
    for (let level = 1; level <= 4; level += 1) {
      const dirt = el('span', 'score-dirt');
      dirt.dataset.level = String(level);
      wrap.append(dirt);
    }
    wrap.append(el('span', 'score-dim'), el('span', 'score-grip'));
    if (editable) {
      const range = document.createElement('input');
      range.id = 'own-rate';
      range.className = 'rate';
      range.type = 'range';
      range.min = '0';
      range.max = '10';
      range.step = '0.1';
      range.value = String(amount);
      wrap.append(range);
      wrap._range = range;
    }
    return wrap;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = typeof text === 'string' ? t(text) : text;
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

  function commitRating(film, rating, previous) {
    writeEntry(film.id, { rating });
    if (ratingView && ratingBucket(previous) !== ratingBucket(rating)) {
      buildWall();
      wall.querySelector(`[data-id="${film.id}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
    } else {
      paint();
    }
  }

  function memberRateLine(film, options) {
    const opts = options || {};
    const rateRow = el('div', 'member-rate');
    if (opts.userId) rateRow.dataset.user = opts.userId;
    const head = el('div', 'member-head');
    head.append(avatarNode(opts.avatar, 28), el('span', 'member-name', opts.name || ''));
    if (opts.mine) head.append(profileColorSwitch());
    const bar = scoreBar(opts.avatar, opts.value, Boolean(opts.mine));
    const value = el('output', 'rate-value', formatScore(opts.value));
    if (opts.mine && bar._range) {
      value.htmlFor = 'own-rate';
      bar._range.addEventListener('input', () => {
        const next = Math.round(Number(bar._range.value) * 10) / 10;
        const rating = next > 0 ? next : null;
        const previous = entry(film.id).rating;
        value.textContent = formatScore(rating);
        bar.style.setProperty('--p', `${next * 10}%`);
        commitRating(film, rating, previous);
        if (opts.onRate) opts.onRate(rating);
      });
    }
    rateRow.append(head, bar, value);
    return rateRow;
  }

  function ownRateBlock(film, row) {
    const block = document.createDocumentFragment();
    block.append(memberRateLine(film, {
      avatar: account && account.avatar,
      name: (account && (account.display_name || account.username)) || 'Ich',
      userId: account && account.id,
      value: row.rating,
      mine: true,
    }));
    return block;
  }

  function sharedRateBlock(film, list, row) {
    const block = el('div', 'member-rates');
    const average = el('p', 'rate-average', t('Average –'));
    block.append(average);
    const others = new Map();
    const paintAverage = (mine) => {
      const values = [...others.values()];
      if (mine != null && mine > 0) values.push(mine);
      const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      average.textContent = avg == null ? t('Average –') : t('Average {score}', { score: formatScore(avg) });
      const poster = document.querySelector(`#wish-board [data-id="${film.id}"]`);
      if (!poster) return;
      poster.classList.toggle('is-rated', avg != null);
      const tint = poster.querySelector('.tint');
      const score = poster.querySelector('.poster-score');
      if (tint) tint.style.background = avg == null ? '' : coverTint(avg);
      paintWear(poster, avg);
      if (score) score.textContent = avg == null ? '' : `★  ${avg.toFixed(1).replace('.', ',')}`;
    };
    const minePerson = (list.members || []).find((person) => account && person.id === account.id);
    block.append(memberRateLine(film, {
      avatar: (account && account.avatar) || (minePerson && minePerson.avatar),
      name: (account && (account.display_name || account.username)) || (minePerson && minePerson.username) || 'Ich',
      userId: (account && account.id) || (minePerson && minePerson.id),
      value: row.rating,
      mine: true,
      onRate: paintAverage,
    }));
    paintAverage(row.rating);
    const cloud = globalThis.Cloud;
    const memberIds = (list.members || []).map((person) => person.id).filter((id) => !account || id !== account.id);
    if (cloud && cloud.memberRatings && memberIds.length) {
      cloud.memberRatings(memberIds, [film.id]).then((rows) => {
        if (!block.isConnected) return;
        const byUser = new Map();
        (rows || []).forEach((item) => {
          const rating = Number(item.rating);
          if (rating > 0 && item.user_id) byUser.set(item.user_id, rating);
        });
        (list.members || []).forEach((person) => {
          if (!person || (account && person.id === account.id)) return;
          const rating = byUser.get(person.id);
          const existing = block.querySelector(`[data-user="${CSS.escape(person.id)}"]`);
          if (!(rating > 0)) {
            if (existing) existing.remove();
            others.delete(person.id);
            return;
          }
          others.set(person.id, rating);
          if (existing) {
            const output = existing.querySelector('.rate-value');
            const host = existing.querySelector('.score-bar');
            if (output) output.textContent = formatScore(rating);
            if (host) host.replaceWith(scoreBar(person.avatar, rating, false));
            return;
          }
          block.append(memberRateLine(film, {
            avatar: person.avatar,
            name: person.username || 'Profil',
            userId: person.id,
            value: rating,
          }));
        });
        paintAverage(entry(film.id).rating);
      }).catch(() => {});
    }
    return block;
  }

  let overviewToken = 0;
  let genreObserver = null;

  function sectionHead(title, options) {
    const opts = options || {};
    const head = el('div', 'section-head');
    const kicker = el(opts.tag || 'h2', opts.kicker ? `profile-kicker ${opts.kicker}` : 'profile-kicker', title);
    if (opts.htmlFor) kicker.htmlFor = opts.htmlFor;
    head.append(kicker, el('span', opts.rule || 'section-rule'));
    return head;
  }

  function clearGenreFit() {
    if (genreObserver) {
      genreObserver.disconnect();
      genreObserver = null;
    }
  }

  // Farbe pro Genre (Kontur an der oberen linken Ecke der Genre-Felder)
  const GENRE_COLORS = {
    action: '#ff4a1c',
    abenteuer: '#f4a12a',
    adventure: '#f4a12a',
    drama: '#c2407e',
    'komödie': '#ffd84a',
    comedy: '#ffd84a',
    krimi: '#6f93b8',
    crime: '#6f93b8',
    thriller: '#17b8a6',
    mystery: '#8e5cff',
    horror: '#d4142e',
    'sci-fi': '#2f8cff',
    'science fiction': '#2f8cff',
    'science-fiction': '#2f8cff',
    fantasy: '#e04bd8',
    romantik: '#ff6f9c',
    romance: '#ff6f9c',
    kriegsfilm: '#8f9e3c',
    war: '#8f9e3c',
    western: '#c98a4b',
    historie: '#c9a24a',
    history: '#c9a24a',
    biografie: '#d9c3a0',
    biography: '#d9c3a0',
    dokumentation: '#9fb3c8',
    documentary: '#9fb3c8',
    animation: '#3fd17a',
  };

  function genreColor(name) {
    const key = String(name || '').trim().toLocaleLowerCase('de');
    if (GENRE_COLORS[key]) return GENRE_COLORS[key];
    const alias = vocabulary && vocabulary.genreAliases && vocabulary.genreAliases[String(name || '').trim()];
    if (typeof alias === 'string' && GENRE_COLORS[alias.toLocaleLowerCase('de')]) return GENRE_COLORS[alias.toLocaleLowerCase('de')];
    return '';
  }

  function genrePill(name) {
    const item = el('li', null, name);
    const color = genreColor(name);
    if (color) {
      item.classList.add('has-genre-color');
      item.style.setProperty('--genre', color);
    }
    return item;
  }

  function paintGenrePills(list, names, scale) {
    const shown = names.join('\n');
    if (list.dataset.shown !== shown) {
      list.dataset.shown = shown;
      list.replaceChildren();
      names.forEach((name) => list.append(genrePill(name)));
    }
    list.style.setProperty('--pill-scale', String(scale));
  }

  function genreFits(list) {
    if (list.scrollWidth > list.clientWidth + 1) return false;
    const items = list.querySelectorAll('li');
    if (!items.length) return true;
    const host = list.getBoundingClientRect();
    const start = items[0].getBoundingClientRect();
    const end = items[items.length - 1].getBoundingClientRect();
    return start.left >= host.left - 1 && end.right <= host.right + 1;
  }

  function fitGenreRow(meta) {
    if (!meta || !meta.isConnected || meta.clientWidth < 8) return;
    const list = meta.querySelector('.pills');
    if (!list || list.clientWidth < 8) return;
    const names = String(list.dataset.genres || '').split('\n').filter(Boolean);
    if (!names.length) return;
    const scales = [];
    for (let step = 100; step >= 70; step -= 5) scales.push(step / 100);
    let count = names.length;
    let fitted = false;
    while (count >= 1 && !fitted) {
      for (let step = 0; step < scales.length; step += 1) {
        paintGenrePills(list, names.slice(0, count), scales[step]);
        if (genreFits(list)) {
          fitted = true;
          break;
        }
      }
      if (!fitted) count -= 1;
    }
    if (!fitted) paintGenrePills(list, names.slice(0, 1), 0.7);
  }

  function bindGenreFit(meta) {
    clearGenreFit();
    const run = () => fitGenreRow(meta);
    requestAnimationFrame(run);
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(() => {
        if (meta.isConnected) fitGenreRow(meta);
      }).catch(() => {});
    }
    if (typeof ResizeObserver !== 'function') return;
    genreObserver = new ResizeObserver(() => fitGenreRow(meta));
    genreObserver.observe(meta);
  }

  function storedOverview(id) {
    try {
      return localStorage.getItem(`moviebylucia-overview:${id}`) || '';
    } catch {
      return '';
    }
  }

  function storeOverview(id, text) {
    const value = String(text || '').trim();
    if (!id || !value) return;
    try {
      localStorage.setItem(`moviebylucia-overview:${id}`, value);
    } catch {
      /* voller Speicher */
    }
  }

  function overviewQuery(film) {
    if (!film) return '';
    const id = String(film.id || '');
    const direct = id.match(/^tmdb:(movie|tv):(\d+)$/) || id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (direct) return `https://www.themoviedb.org/${direct[1]}/${direct[2]}`;
    const stored = globalThis.FILM_FACETS || {};
    const facets = film.facets || stored[film.id] || stored[originalIdOf(film.id)] || {};
    if (facets.tmdbId) {
      const type = facets.tmdbType === 'tv' || film.kind === 'serie' ? 'tv' : 'movie';
      return `https://www.themoviedb.org/${type}/${facets.tmdbId}`;
    }
    const imdb = String(facets.imdbId || '').toLowerCase();
    if (/^tt\d+$/.test(imdb)) return imdb;
    return '';
  }

  function overviewNode(text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-overview';
    button.textContent = text;
    button.addEventListener('click', () => button.classList.toggle('is-open'));
    return button;
  }

  function paintOverview(film, slot, defer) {
    const known = String((film && film.overview) || storedOverview(film.id) || '').trim();
    if (known) {
      film.overview = known;
      storeOverview(film.id, known);
      slot.replaceChildren(overviewNode(known));
      return;
    }
    if (defer) return;
    const query = overviewQuery(film);
    if (!query) return;
    const token = overviewToken;
    const id = film.id;
    fetch(`/api/film?q=${encodeURIComponent(query)}&overview=1`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const text = String(data && data.overview || '').trim();
        if (!text || token !== overviewToken || !slot.isConnected) return;
        film.overview = text;
        storeOverview(id, text);
        slot.replaceChildren(overviewNode(text));
      })
      .catch(() => {});
  }

  function fitCastNames(node) {
    if (!node || !node.isConnected) return;
    const line = parseFloat(getComputedStyle(node).lineHeight);
    if (!Number.isFinite(line) || line <= 0) return;
    const limit = line * 2 + 1;
    const people = [...node.querySelectorAll('.cast-link')];
    while (people.length && node.scrollHeight > limit) {
      const last = people.pop();
      const prev = last.previousSibling;
      if (prev && prev.nodeType === Node.TEXT_NODE && /^,\s*$/.test(prev.textContent || '')) prev.remove();
      last.remove();
    }
  }

  let recToken = 0;
  const REC_WEEK = 7 * 24 * 60 * 60 * 1000;

  function recommendationQuery(film) {
    const known = overviewQuery(film);
    if (known) return known;
    const title = String(film && film.title || '').trim();
    if (!title) return '';
    const year = yearOf(film);
    return year ? `${title} (${year})` : title;
  }

  function recCacheKey(query) {
    return `moviebylucia-recs:${query}`;
  }

  function readRecCache(query) {
    try {
      const row = JSON.parse(localStorage.getItem(recCacheKey(query)) || 'null');
      if (!row || typeof row.at !== 'number' || Date.now() - row.at > REC_WEEK) return null;
      if (!row.pages || typeof row.pages !== 'object') return null;
      return row;
    } catch {
      return null;
    }
  }

  function writeRecCache(query, row) {
    try {
      localStorage.setItem(recCacheKey(query), JSON.stringify(row));
    } catch {
      /* Speicher voll */
    }
  }

  function cachedRecPage(query, page) {
    const row = readRecCache(query);
    const hit = row && row.pages && row.pages[String(page)];
    if (!hit) return null;
    return {
      director: row.director || '',
      films: Array.isArray(hit.films) ? hit.films : [],
      more: Boolean(hit.more),
    };
  }

  async function pullRecPage(query, page) {
    const hit = cachedRecPage(query, page);
    if (hit) return hit;
    const url = `/api/recommendations?q=${encodeURIComponent(query)}&page=${page}`;
    let response = await fetch(url);
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      response = await fetch(url);
    }
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.films)) return null;
    const pack = readRecCache(query) || { at: Date.now(), director: '', pages: {} };
    if (data.director) pack.director = data.director;
    pack.pages[String(page)] = { films: data.films, more: Boolean(data.more) };
    writeRecCache(query, pack);
    return {
      director: pack.director || '',
      films: data.films,
      more: Boolean(data.more),
    };
  }

  function recSameFilm(row, film) {
    if (!row || !film) return false;
    const ident = identityOf(film);
    if (ident.tmdb && ident.tmdb === Number(row.tmdbId)) return true;
    const parsed = String(film.id || '').match(/^tmdb[:\-](?:movie|tv)[:\-](\d+)$/i);
    if (parsed && Number(parsed[1]) === Number(row.tmdbId)) return true;
    const year = Number(row.year) || null;
    if (!year || ident.year !== year) return false;
    const names = [normTitle(row.title), normTitle(row.original)].filter(Boolean);
    return ident.titles.some((name) => names.includes(name));
  }

  function myListRecord() {
    return (wishLists || []).find((list) => String(list.title || '').trim().toLocaleLowerCase('de') === 'mylist') || null;
  }

  function recOnMyList(row) {
    const list = myListRecord();
    if (!list) return false;
    const kind = row.type === 'tv' ? 'tv' : 'movie';
    const keys = new Set([
      `tmdb:${kind}:${row.tmdbId}`,
      `tmdb-${kind}-${row.tmdbId}`,
    ]);
    if ((list.stamps || []).some((stamp) => keys.has(stamp.filmId))) return true;
    if (wishOpenId !== list.id) return false;
    const title = normTitle(row.title);
    const year = String(row.year || '');
    return (wishItems || []).some((item) => {
      const film = item && item.film;
      if (!film) return false;
      const filmYear = String(film.year || '').slice(0, 4);
      return normTitle(film.title) === title && (!year || !filmYear || filmYear === year);
    });
  }

  function recRank(row) {
    let score = 0;
    if (row.sameDirector) score += 10;
    score += (row.cast ? row.cast.length : 0) * 2;
    const sources = row.sources || [];
    if (sources.includes('recommendations') && sources.includes('similar')) score += 1;
    return score;
  }

  function recAbsorb(state, row) {
    if (!row || !row.tmdbId) return;
    const prev = state.map.get(row.tmdbId);
    if (!prev) {
      state.map.set(row.tmdbId, {
        ...row,
        sources: (row.sources || []).slice(),
        cast: (row.cast || []).slice(),
        sameDirector: Boolean(row.sameDirector),
      });
      return;
    }
    (row.sources || []).forEach((source) => {
      if (!prev.sources.includes(source)) prev.sources.push(source);
    });
    (row.cast || []).forEach((name) => {
      if (!prev.cast.includes(name)) prev.cast.push(name);
    });
    if (row.sameDirector) prev.sameDirector = true;
    if (row.poster && !prev.poster) prev.poster = row.poster;
    if (row.overview && !prev.overview) prev.overview = row.overview;
    if (row.genres && row.genres.length && (!prev.genres || !prev.genres.length)) prev.genres = row.genres.slice();
  }

  function recInArchive(row) {
    const kind = row.type === 'tv' ? 'tv' : 'movie';
    const id = `tmdb:${kind}:${row.tmdbId}`;
    if (byId.has(id)) return true;
    const tmdb = Number(row.tmdbId);
    return FILMS.some((item) => {
      if (!item || item.id === id) return Boolean(item);
      const known = identityOf(item);
      return Boolean(known.tmdb && known.tmdb === tmdb);
    });
  }

  function recRanked(state) {
    return [...state.map.values()].filter((row) => {
      if (recSameFilm(row, state.film)) return false;
      if (recInArchive(row)) return true;
      if (recOnMyList(row)) return false;
      return true;
    }).sort((a, b) => {
      const diff = recRank(b) - recRank(a);
      if (diff) return diff;
      return (Number(b.vote) || 0) - (Number(a.vote) || 0);
    });
  }

  function recHead(count) {
    const head = el('div', 'section-head');
    const row = el('div', 'rec-kicker');
    row.append(el('h2', 'profile-kicker', t('Recommendations')));
    row.append(el('span', 'rec-count', count > 0 ? String(count) : ''));
    head.append(row, el('span', 'section-rule'));
    return head;
  }

  function recSkeleton() {
    const row = el('div', 'rec-skel');
    const copy = el('span', 'rec-skel-copy');
    copy.append(el('span', 'rec-skel-line'), el('span', 'rec-skel-line'));
    row.append(el('span', 'rec-skel-poster'), copy);
    return row;
  }

  const filmCards = new Map();
  const cardTokens = new Map();

  function readFilmCard(id) {
    if (!id) return null;
    const mem = filmCards.get(id);
    if (mem) return mem;
    try {
      const row = JSON.parse(localStorage.getItem(`moviebylucia-filmcard:${id}`) || 'null');
      if (!row || typeof row.at !== 'number' || Date.now() - row.at > REC_WEEK) return null;
      filmCards.set(id, row);
      return row;
    } catch {
      return null;
    }
  }

  function writeFilmCard(id, card) {
    if (!id) return;
    const row = {
      at: Date.now(),
      ready: true,
      director: card.director || '',
      cast: Array.isArray(card.cast) ? card.cast : [],
      overview: card.overview || '',
      genres: Array.isArray(card.genres) ? card.genres : [],
    };
    filmCards.set(id, row);
    try {
      localStorage.setItem(`moviebylucia-filmcard:${id}`, JSON.stringify(row));
    } catch {
      /* Speicher voll */
    }
  }

  function filmFromRecommendation(row) {
    const kind = row.type === 'tv' ? 'tv' : 'movie';
    const id = `tmdb:${kind}:${row.tmdbId}`;
    const card = readFilmCard(id);
    const vote = Number(row.vote);
    const genres = (card && card.genres && card.genres.length) ? card.genres : (row.genres || []);
    const overview = (card && card.overview) || row.overview || '';
    return {
      id,
      tmdbId: row.tmdbId,
      tmdbType: kind,
      title: row.title,
      original: row.original || null,
      year: row.year || '',
      poster: row.poster || '',
      genres: genres.slice(0, 3),
      overview,
      director: (card && card.director) || '',
      cast: (card && card.cast) || [],
      imdb: Number.isFinite(vote) ? vote : null,
      imdbLabel: Number.isFinite(vote) ? formatScore(vote) : '–',
      kind: kind === 'tv' ? 'serie' : 'film',
      fromCatalog: false,
    };
  }

  function placeFilmCredits(film) {
    if (!panelFilm || panelFilm.id !== film.id) return;
    const copy = panel.querySelector('.panel-copy');
    if (!copy) return;
    let foot = copy.querySelector('.panel-copy-foot');
    const hasDirector = Boolean(foot && foot.querySelector('.credit-link'));
    const hasCast = Boolean(foot && foot.querySelector('.cast-link'));
    if (!foot && (film.director || (film.cast && film.cast.length))) {
      foot = el('div', 'panel-copy-foot');
      copy.append(foot);
    }
    if (foot && film.director && !hasDirector) {
      const director = el('p', 'panel-credit');
      director.append(el('span', 'panel-kicker', 'Director'));
      const name = el('button', 'credit-link', film.director);
      name.type = 'button';
      name.addEventListener('click', () => highlight({
        title: t('Director: {name}', { name: film.director }),
        style: 'director',
        ids: filmsWith('director', film.director),
      }));
      director.append(name);
      foot.prepend(director);
    }
    if (foot && film.cast && film.cast.length && !hasCast) {
      const cast = el('p', 'panel-credit panel-cast');
      cast.append(el('span', 'panel-kicker', 'Cast'));
      film.cast.filter(Boolean).forEach((personName, index) => {
        if (index) cast.append(document.createTextNode(', '));
        const person = el('button', 'cast-link', personName);
        person.type = 'button';
        person.addEventListener('click', () => highlight({
          title: t('With: {name}', { name: personName }),
          style: 'cast',
          ids: filmsWith('cast', personName),
        }));
        cast.append(person);
      });
      foot.append(cast);
      requestAnimationFrame(() => fitCastNames(cast));
    }
    const slot = panel.querySelector('.panel-overview-slot');
    if (slot && !slot.childNodes.length && film.overview) {
      storeOverview(film.id, film.overview);
      slot.replaceChildren(overviewNode(film.overview));
    }
    const meta = panel.querySelector('.panel-meta');
    if (meta && !meta.querySelector('.pills') && film.genres && film.genres.length) {
      const pills = el('ul', 'pills');
      const names = film.genres.filter(Boolean).slice(0, 3);
      pills.dataset.genres = names.join('\n');
      names.forEach((name) => pills.append(genrePill(name)));
      meta.append(pills);
      bindGenreFit(meta);
    }
  }

  function showRecommendation(row) {
    const film = filmFromRecommendation(row);
    if (!pathLock) {
      const fromOrigin = pathOn && pathState && pathState.origin && panelFilm && panelFilm.id === pathState.origin.id;
      if (fromOrigin) pathChoose(0, film);
      else if (pathOn) pathPick(film);
      else if (panelFilm) pathEnter(panelFilm, film);
    }
    panelList = null;
    renderPanel(film, { quiet: true });
    if (pathOn) document.body.classList.add('is-path-panel');
    loadFilmCard(film);
  }


  function closePath() {
    pathOn = false;
    pathLock = false;
    pathEpoch += 1;
    pathState = null;
    pathSeen = new Set();
    if (pathObserver) {
      pathObserver.disconnect();
      pathObserver = null;
    }
    document.body.classList.remove('is-path', 'is-path-panel');
    const node = document.getElementById('path-view');
    if (node) node.remove();
    if (pathHeld) {
      const y = pathScrollY;
      pathHeld = false;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }

  function exitPath() {
    if (!pathOn) return;
    closePath();
    document.body.classList.remove('is-path-panel');
    clearSelection();
  }

  // die Plotline-Zeile gleitet von oben herein, damit klar ist, wo man ist
  function pathHeadIntro() {
    const head = document.querySelector('#path-view .path-head');
    if (!head) return;
    head.classList.remove('is-arriving');
    void head.offsetWidth;
    head.classList.add('is-arriving');
    window.setTimeout(() => head.classList.remove('is-arriving'), 700);
  }

  // Ursprungsfilm unten in der Plotline: öffnet sein Fenster
  function pathOpenOrigin() {
    if (!pathOn || !pathState || !pathState.origin) return;
    const origin = pathState.origin;
    pathLock = true;
    panelList = null;
    renderPanel(byId.get(origin.id) || origin, { quiet: true });
    document.body.classList.add('is-path-panel');
    pathLock = false;
  }

  function pathRow(film) {
    return {
      tmdbId: film.tmdbId,
      type: film.tmdbType === 'tv' ? 'tv' : 'movie',
      title: film.title,
      original: film.original || '',
      year: film.year || '',
      poster: film.poster || '',
      vote: film.imdb,
      genres: film.genres || [],
      overview: film.overview || '',
    };
  }

  function pathChainFilms() {
    if (!pathState) return [];
    const films = [pathState.origin];
    pathState.steps.forEach((step) => {
      if (step.chosenFilm) films.push(step.chosenFilm);
    });
    return films;
  }

  function pathChainKey(films) {
    return (films || []).map((film) => (film.tmdbId != null ? String(film.tmdbId) : film.id)).join('.');
  }

  function pathCloneStep(step) {
    return {
      key: step.key,
      source: { ...step.source },
      chosenId: step.chosenId || null,
      chosenFilm: step.chosenFilm ? { ...step.chosenFilm } : null,
      candidates: step.candidates ? step.candidates.map((row) => ({ ...row })) : null,
      loading: false,
      error: false,
    };
  }

  function pathSaveCurrent() {
    if (!pathState) return;
    const films = pathChainFilms();
    if (films.length < 2) return;
    const key = pathChainKey(films);
    if (pathState.routes.some((route) => route.key === key)) return;
    pathState.routes.push({
      key,
      at: Date.now(),
      origin: { ...pathState.origin },
      films: films.map((film) => ({ ...film })),
      steps: pathState.steps.map(pathCloneStep),
    });
    while (pathState.routes.length > 10) pathState.routes.shift();
  }

  function pathOpenStep(film) {
    return {
      key: 's' + (pathSeq += 1),
      source: { ...film },
      candidates: null,
      chosenId: null,
      chosenFilm: null,
      loading: true,
      error: false,
    };
  }

  async function pathPull(query, page) {
    const key = query + '\n' + page;
    if (pathPages.has(key)) return pathPages.get(key);
    const cached = cachedRecPage(query, page);
    if (cached) {
      pathPages.set(key, cached);
      return cached;
    }
    const url = `/api/recommendations?q=${encodeURIComponent(query)}&page=${page}`;
    let response = await fetch(url);
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      response = await fetch(url);
    }
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.films)) return null;
    const pack = { films: data.films, more: Boolean(data.more) };
    pathPages.set(key, pack);
    return pack;
  }

  function pathEligible(map, source, allow) {
    return [...map.values()].filter((row) => {
      if (!row || !row.tmdbId) return false;
      if (recSameFilm(row, source)) return false;
      const id = Number(row.tmdbId);
      if (allow != null && id === allow) return true;
      if (recInArchive(row)) return false;
      if (pathSeen.has(id)) return false;
      return true;
    }).sort((a, b) => {
      const diff = recRank(b) - recRank(a);
      if (diff) return diff;
      return (Number(b.vote) || 0) - (Number(a.vote) || 0);
    });
  }

  function pathWindow(rows, allow) {
    const count = 7;
    const side = 3;
    if (!rows.length) return [];
    if (allow == null) return rows.slice(0, count);
    const index = rows.findIndex((row) => Number(row.tmdbId) === allow);
    if (index < 0) return rows.slice(0, count);
    let start = Math.max(0, index - side);
    if (start + count > rows.length) start = Math.max(0, rows.length - count);
    const slice = rows.slice(start, start + count);
    if (slice.some((row) => Number(row.tmdbId) === allow)) return slice;
    return rows.slice(Math.max(0, index - side), index + side + 1).slice(0, count);
  }

  async function pathCollect(source, chosen) {
    const query = recommendationQuery(source);
    if (!query) throw new Error('empty');
    const allow = chosen && chosen.tmdbId != null ? Number(chosen.tmdbId) : null;
    const map = new Map();
    let page = 0;
    let more = true;
    let guard = 0;
    let failed = false;
    while (more && guard < 8) {
      const eligible = pathEligible(map, source, allow);
      const ready = pathWindow(eligible, allow);
      const index = allow == null ? -1 : eligible.findIndex((row) => Number(row.tmdbId) === allow);
      const before = index < 0 ? 0 : index;
      const after = index < 0 ? 0 : eligible.length - index - 1;
      const holds = allow == null || index >= 0;
      const enough = allow == null ? ready.length >= 7 : holds && before >= 3 && after >= 3;
      if (enough) break;
      guard += 1;
      page += 1;
      const pack = await pathPull(query, page);
      if (!pack) {
        if (page === 1 && !map.size) failed = true;
        break;
      }
      more = Boolean(pack.more);
      (pack.films || []).forEach((row) => {
        if (!row || !row.tmdbId || map.has(row.tmdbId)) return;
        map.set(row.tmdbId, { ...row });
      });
    }
    const rows = pathWindow(pathEligible(map, source, allow), allow);
    if (allow != null && chosen && !rows.some((row) => Number(row.tmdbId) === allow)) {
      const row = pathRow(chosen);
      rows.splice(Math.min(3, rows.length), 0, row);
      while (rows.length > 7) {
        if (rows[rows.length - 1] === row) rows.shift();
        else rows.pop();
      }
    }
    if (!rows.length && failed) throw new Error('load');
    return rows;
  }

  function pathEnter(origin, chosen) {
    if (!origin || !chosen) return;
    pathOn = true;
    pathEpoch += 1;
    pathSeen = new Set();
    if (origin.tmdbId != null) pathSeen.add(Number(origin.tmdbId));
    pathState = {
      origin: { ...origin },
      steps: [],
      routes: [],
      queued: null,
    };
    document.body.classList.add('is-path');
    if (phoneSheet() && !pathHeld) {
      pathHeld = true;
      pathScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }
    pathState.steps.push({
      key: 's' + (pathSeq += 1),
      source: { ...origin },
      candidates: null,
      chosenId: chosen.id,
      chosenFilm: { ...chosen },
      loading: true,
      error: false,
    });
    pathEnsure();
    pathSync(false);
    pathLoadStep(0);
  }

  function pathPick(film) {
    if (!pathOn || !pathState || !film) return;
    const last = pathState.steps[pathState.steps.length - 1];
    if (!last) return;
    if (last.loading && last.chosenFilm) {
      pathState.queued = film;
      return;
    }
    pathChoose(pathState.steps.length - 1, film);
  }

  function pathChoose(index, film) {
    if (!pathState || !film) return false;
    const step = pathState.steps[index];
    if (!step || step.loading) {
      if (step) step.pendingFilm = film;
      return false;
    }
    if (step.chosenId === film.id) return false;
    if (index < pathState.steps.length - 1) {
      pathSaveCurrent();
      step.chosenId = film.id;
      step.chosenFilm = { ...film };
      pathState.steps = pathState.steps.slice(0, index + 1);
      pathState.steps.push(pathOpenStep(film));
      pathSync(true);
      pathLoadStep(pathState.steps.length - 1);
      return true;
    }
    if (!step.candidates) step.candidates = [];
    if (!step.candidates.some((row) => Number(row.tmdbId) === Number(film.tmdbId))) {
      const next = step.candidates.slice();
      next.splice(Math.min(3, next.length), 0, pathRow(film));
      step.candidates = next.slice(0, 7);
    }
    step.chosenId = film.id;
    step.chosenFilm = { ...film };
    if (film.tmdbId != null) pathSeen.add(Number(film.tmdbId));
    pathState.steps.push(pathOpenStep(film));
    pathSync(true);
    pathLoadStep(pathState.steps.length - 1);
    return true;
  }

  async function pathLoadStep(index) {
    const epoch = pathEpoch;
    const step = pathState && pathState.steps[index];
    if (!step) return;
    step.loading = true;
    step.error = false;
    pathPaintStep(step);
    try {
      const rows = await pathCollect(step.source, step.chosenFilm);
      if (epoch !== pathEpoch || !pathState || pathState.steps[index] !== step) return;
      step.candidates = rows;
      step.loading = false;
      rows.forEach((row) => pathSeen.add(Number(row.tmdbId)));
      if (step.chosenFilm && step.chosenFilm.tmdbId != null) pathSeen.add(Number(step.chosenFilm.tmdbId));
      pathPaintStep(step);
      const pending = step.pendingFilm;
      step.pendingFilm = null;
      if (pending) {
        pathChoose(index, pending);
        return;
      }
      if (step.chosenFilm && index === pathState.steps.length - 1) {
        const queued = pathState.queued;
        pathState.queued = null;
        const next = pathOpenStep(step.chosenFilm);
        if (queued) next.pendingFilm = queued;
        pathState.steps.push(next);
        pathSync(true);
        pathLoadStep(pathState.steps.length - 1);
        return;
      }
      pathRevealLatest();
    } catch {
      if (epoch !== pathEpoch || !pathState || !pathState.steps[index]) return;
      step.loading = false;
      step.error = true;
      pathPaintStep(step);
    }
  }

  function pathPoster(parent, poster, title, id) {
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'path-cover';
    cover.setAttribute('aria-label', title || t('Movie'));
    if (poster) {
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.loading = 'lazy';
      image.setAttribute('data-src', poster);
      cover.append(image);
    } else {
      cover.classList.add('is-blank');
      cover.style.setProperty('--blank', `hsl(${posterHue(id || title || 'film')} 25% 14%)`);
      cover.append(el('span', 'poster-title', title || t('Movie')));
    }
    parent.append(cover);
    return cover;
  }

  function pathEnsure() {
    if (document.getElementById('path-view')) return;
    const root = el('div', 'path-view');
    root.id = 'path-view';
    const head = el('div', 'path-head');
    const mark = el('span', 'path-mark');
    mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="2.25" fill="none" stroke="currentColor" stroke-width="1.6"></circle><circle cx="17" cy="12" r="2.25" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M9.2 12h5.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
    mark.append(el('span', 'path-name', 'PLOTLINE'));
    const leave = el('button', 'path-leave');
    leave.type = 'button';
    leave.setAttribute('aria-label', t('Leave Plotline'));
    leave.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
    leave.addEventListener('click', () => exitPath());
    head.append(mark, leave);
    const scroller = el('div', 'path-scroll');
    const row = el('div', 'path-row');
    const origin = el('div', 'path-origin');
    const film = pathState.origin;
    const cover = pathPoster(origin, film.poster, film.title, film.id);
    cover.classList.add('is-origin');
    cover.addEventListener('click', () => pathOpenOrigin());
    origin.append(el('div', 'path-routes'));
    row.append(origin);
    scroller.append(row);
    root.append(head, scroller);
    document.body.append(root);
    if (!phoneSheet()) requestAnimationFrame(pathHeadIntro);
    pathObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.querySelectorAll('img[data-src]').forEach((image) => {
          image.src = image.getAttribute('data-src');
          image.removeAttribute('data-src');
        });
      });
    }, { root: scroller, rootMargin: '80px' });
    pathObserver.observe(origin);
    pathArm(origin);
    scroller.addEventListener('wheel', (event) => {
      if (phoneSheet()) return;
      const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!horizontal && event.target.closest('.path-track')) return;
      scroller.scrollLeft += horizontal ? (event.deltaX || event.deltaY) : event.deltaY;
      event.preventDefault();
    }, { passive: false });
    scroller.addEventListener('pointerdown', (event) => {
      if (phoneSheet() || (event.button != null && event.button !== 0)) return;
      if (event.target.closest('.path-track, .path-cover, button')) return;
      const drag = { id: event.pointerId, x: event.clientX, left: scroller.scrollLeft };
      const move = (ev) => {
        if (ev.pointerId !== drag.id) return;
        const dx = ev.clientX - drag.x;
        if (Math.abs(dx) <= 6) return;
        if (!drag.held) {
          drag.held = true;
          try { scroller.setPointerCapture(ev.pointerId); } catch { /* already gone */ }
        }
        scroller.scrollLeft = drag.left - dx;
        ev.preventDefault();
      };
      const end = (ev) => {
        if (ev.pointerId !== drag.id) return;
        scroller.removeEventListener('pointermove', move);
        scroller.removeEventListener('pointerup', end);
        scroller.removeEventListener('pointercancel', end);
      };
      scroller.addEventListener('pointermove', move);
      scroller.addEventListener('pointerup', end);
      scroller.addEventListener('pointercancel', end);
    });
  }

  function pathCovers(track) {
    return [...track.querySelectorAll('.path-cover')];
  }

  function pathCenter(track, cover, phone) {
    if (!cover) return 0;
    if (phone) return Math.max(0, cover.offsetLeft - (track.clientWidth - cover.offsetWidth) / 2);
    return Math.max(0, cover.offsetTop - (track.clientHeight - cover.offsetHeight) / 2);
  }

  function pathCoast(track, velocity, axis) {
    let speed = velocity;
    if (Math.abs(speed) < 0.04) return;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(34, now - last);
      last = now;
      speed *= Math.exp(-dt / 260);
      if (Math.abs(speed) < 0.02) {
        track._pathFrame = 0;
        pathSettle(track);
        return;
      }
      const max = axis === 'left'
        ? track.scrollWidth - track.clientWidth
        : track.scrollHeight - track.clientHeight;
      const next = (axis === 'left' ? track.scrollLeft : track.scrollTop) + speed * dt;
      if (next <= 0 || next >= max - 0.5) {
        if (axis === 'left') track.scrollLeft = Math.max(0, Math.min(max, next));
        else track.scrollTop = Math.max(0, Math.min(max, next));
        track._pathFrame = 0;
        pathSettle(track);
        return;
      }
      if (axis === 'left') track.scrollLeft = next;
      else track.scrollTop = next;
      track._pathFrame = requestAnimationFrame(frame);
    };
    track._pathFrame = requestAnimationFrame(frame);
  }

  function pathSettle(track) {
    if (!track) return;
    const phone = phoneSheet();
    const prop = phone ? 'scrollLeft' : 'scrollTop';
    const value = track[prop];
    track.style.scrollSnapType = 'none';
    track[prop] = value;
    requestAnimationFrame(() => {
      track.style.scrollSnapType = '';
      track[prop] = value;
    });
  }

  function pathBindTrack(track) {
    if (track.dataset.bound === '1') return;
    track.dataset.bound = '1';
    let drag = null;
    track.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      if (track._pathFrame) {
        cancelAnimationFrame(track._pathFrame);
        track._pathFrame = 0;
      }
      track.dataset.dragged = '';
      drag = {
        id: event.pointerId,
        type: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        left: track.scrollLeft,
        top: track.scrollTop,
        moved: false,
        along: false,
        last: event.clientY,
        lastT: performance.now(),
        velocity: 0,
      };
    });
    track.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id || drag.type === 'touch' || phoneSheet()) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) <= 6) return;
      if (!drag.moved) {
        drag.moved = true;
        try { track.setPointerCapture(event.pointerId); } catch { /* already gone */ }
      }
      const now = performance.now();
      const dt = Math.max(8, now - drag.lastT);
      drag.velocity = (drag.last - event.clientY) / dt;
      drag.last = event.clientY;
      drag.lastT = now;
      drag.along = true;
      track.scrollTop = drag.top - dy;
      event.preventDefault();
    }, { passive: false });
    const end = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const moved = drag.moved || Math.hypot(dx, dy) > 6
        || Math.abs(track.scrollLeft - drag.left) > 3
        || Math.abs(track.scrollTop - drag.top) > 3;
      const velocity = drag.velocity;
      const along = drag.along;
      const type = drag.type;
      drag = null;
      if (!moved) return;
      track.dataset.dragged = '1';
      if (type === 'touch' || phoneSheet() || !along) return;
      if (Math.abs(velocity) >= 0.04) pathCoast(track, velocity, 'top');
      else pathSettle(track);
    };
    track.addEventListener('click', (event) => {
      if (track.dataset.dragged !== '1') return;
      track.dataset.dragged = '';
      event.preventDefault();
      event.stopPropagation();
    }, true);
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  }

  function pathLayout() {
    const root = document.getElementById('path-view');
    if (!root || !pathOn) return;
    const phone = phoneSheet();
    pathMarkLatest();
    root.querySelectorAll('.path-track').forEach((track) => {
      const covers = pathCovers(track);
      const cover = covers[0];
      if (!cover) return;
      if (track._pathFrame) {
        cancelAnimationFrame(track._pathFrame);
        track._pathFrame = 0;
      }
      if (phone ? track.clientWidth < 2 : track.clientHeight < 2) return;
      if (phone) {
        const prev = parseFloat(track.style.paddingLeft) || 0;
        const space = Math.max(0, (track.clientWidth - cover.offsetWidth) / 2);
        track.style.paddingLeft = `${space}px`;
        track.style.paddingRight = `${space}px`;
        track.style.paddingTop = '';
        track.style.paddingBottom = '';
        if (track.dataset.placed === '1') {
          track.scrollLeft += space - prev;
          return;
        }
        const pick = track.querySelector('.path-cover.is-pick');
        const index = pick ? covers.indexOf(pick) : Math.floor((covers.length - 1) / 2);
        track.scrollLeft = pathCenter(track, covers[index] || cover, true);
        track.dataset.placed = '1';
        return;
      }
      const prev = parseFloat(track.style.paddingTop) || 0;
      const space = Math.max(0, (track.clientHeight - cover.offsetHeight) / 2);
      track.style.paddingTop = `${space}px`;
      track.style.paddingBottom = `${space}px`;
      track.style.paddingLeft = '';
      track.style.paddingRight = '';
      if (track.dataset.placed === '1') {
        track.scrollTop += space - prev;
        return;
      }
      const pick = track.querySelector('.path-cover.is-pick');
      const index = pick ? covers.indexOf(pick) : Math.floor((covers.length - 1) / 2);
      track.scrollTop = pathCenter(track, covers[index] || cover, false);
      track.dataset.placed = '1';
    });
  }

  function pathMarkLatest() {
    const row = document.querySelector('#path-view .path-row');
    if (!row) return;
    const steps = [...row.querySelectorAll('.path-step')].filter((node) => !node.classList.contains('is-leaving'));
    steps.forEach((node, index) => node.classList.toggle('is-latest', index === steps.length - 1));
  }

  function pathRevealLatest() {
    const scroller = document.querySelector('#path-view .path-scroll');
    if (!scroller) return;
    const last = [...scroller.querySelectorAll('.path-step')].filter((node) => !node.classList.contains('is-leaving')).pop();
    if (!last) return;
    if (phoneSheet()) {
      const below = last.previousElementSibling;
      const top = last.offsetTop;
      const bottom = below ? below.offsetTop + below.offsetHeight : top + last.offsetHeight;
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;
      if (top >= viewTop - 4 && bottom <= viewBottom + 4) return;
      const span = bottom - top;
      const target = span > scroller.clientHeight || top < viewTop
        ? Math.max(0, top - 8)
        : Math.max(0, bottom - scroller.clientHeight + 8);
      scroller.scrollTo({ top: target, behavior: 'smooth' });
      return;
    }
    const right = last.offsetLeft + last.offsetWidth;
    if (last.offsetLeft >= scroller.scrollLeft && right <= scroller.scrollLeft + scroller.clientWidth) return;
    scroller.scrollTo({ left: Math.max(0, right - scroller.clientWidth + 16), behavior: 'smooth' });
  }

  function pathPaintStep(step) {
    const row = document.querySelector('#path-view .path-row');
    if (!row || !step) return;
    let node = row.querySelector(`.path-step[data-key="${step.key}"]`);
    if (!node) {
      node = el('div', 'path-step is-entering');
      node.dataset.key = step.key;
      node.append(el('span', 'path-link'));
      const track = el('div', 'path-track');
      node.append(track);
      row.append(node);
      pathBindTrack(track);
      if (pathObserver) pathObserver.observe(node);
      window.setTimeout(() => node.classList.remove('is-entering'), 240);
    }
    const track = node.querySelector('.path-track');
    node.classList.toggle('is-set', Boolean(step.chosenId));
    const ids = (step.candidates || []).map((item) => item.tmdbId).join(',');
    const mark = step.loading ? 'load' : step.error ? 'error' : ids;
    if (node.dataset.mark === mark) {
      track.querySelectorAll('.path-cover').forEach((cover) => {
        cover.classList.toggle('is-pick', cover.dataset.id === step.chosenId);
      });
      return;
    }
    node.dataset.mark = mark;
    track.replaceChildren();
    if (step.loading) {
      for (let i = 0; i < 7; i += 1) track.append(el('span', 'path-cover is-wait'));
      return;
    }
    if (step.error || !(step.candidates || []).length) {
      const retry = el('button', 'path-retry', t('Couldn\'t load recommendations'));
      retry.type = 'button';
      retry.addEventListener('click', () => pathLoadStep(pathState.steps.indexOf(step)));
      track.append(retry);
      return;
    }
    step.candidates.forEach((item) => {
      const film = filmFromRecommendation(item);
      const cover = pathPoster(track, item.poster, item.title, film.id);
      cover.dataset.id = film.id;
      cover.classList.toggle('is-pick', film.id === step.chosenId);
      cover.addEventListener('click', () => {
        if (track.dataset.dragged === '1') return;
        const index = pathState.steps.indexOf(step);
        if (index < 0) return;
        if (step.chosenId !== film.id) {
          pathChoose(index, film);
          return;
        }
        pathLock = true;
        showRecommendation(item);
        pathLock = false;
      });
    });
    pathArm(node);
    track.dataset.placed = '';
    requestAnimationFrame(() => pathLayout());
  }

  function pathArm(node) {
    const scroller = document.querySelector('#path-view .path-scroll');
    if (!node || !scroller) return;
    const box = node.getBoundingClientRect();
    const root = scroller.getBoundingClientRect();
    const visible = box.bottom > root.top - 80 && box.top < root.bottom + 80
      && box.right > root.left - 80 && box.left < root.right + 80;
    if (!visible) return;
    node.querySelectorAll('img[data-src]').forEach((image) => {
      image.src = image.getAttribute('data-src');
      image.removeAttribute('data-src');
    });
  }

  function pathSync(reveal) {
    if (!pathState) return;
    pathEnsure();
    const row = document.querySelector('#path-view .path-row');
    const keys = new Set(pathState.steps.map((step) => step.key));
    row.querySelectorAll('.path-step').forEach((node) => {
      if (keys.has(node.dataset.key) || node.classList.contains('is-leaving')) return;
      node.style.left = `${node.offsetLeft}px`;
      node.style.top = `${node.offsetTop}px`;
      node.style.width = `${node.offsetWidth}px`;
      node.style.height = `${node.offsetHeight}px`;
      node.style.position = 'absolute';
      node.classList.add('is-leaving');
      window.setTimeout(() => node.remove(), 220);
    });
    pathState.steps.forEach((step) => pathPaintStep(step));
    pathPaintRoutes();
    if (reveal) pathRevealLatest();
    requestAnimationFrame(() => requestAnimationFrame(pathLayout));
  }

  function pathPaintRoutes() {
    const host = document.querySelector('#path-view .path-routes');
    if (!host || !pathState) return;
    const currentKey = pathChainKey(pathChainFilms());
    const routes = pathState.routes.filter((route) => route.key !== currentKey);
    routes.push({
      key: currentKey,
      films: pathChainFilms(),
      steps: pathState.steps.map(pathCloneStep),
      origin: pathState.origin,
    });
    host.replaceChildren();
    routes.forEach((route) => {
      if (!route.films || route.films.length < 2) return;
      const active = route.key === currentKey;
      const node = el('div', 'path-route');
      if (active) node.classList.add('is-active');
      route.films.forEach((film, index) => {
        const bead = el('span', 'path-bead');
        if (active && index === route.films.length - 1) bead.classList.add('is-tip');
        node.append(bead);
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'path-x';
      close.setAttribute('aria-label', t('Remove route'));
      close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        pathDeleteRoute(route.key);
      });
      node.append(close);
      let hold = 0;
      let skipClick = false;
      node.addEventListener('pointerdown', (event) => {
        if (!phoneSheet() || (event.button != null && event.button !== 0)) return;
        window.clearTimeout(hold);
        hold = window.setTimeout(() => {
          host.querySelectorAll('.path-route.is-armed').forEach((item) => item.classList.remove('is-armed'));
          if (!node.classList.contains('is-active')) node.classList.add('is-armed');
          skipClick = true;
        }, 480);
      });
      const dropHold = () => window.clearTimeout(hold);
      node.addEventListener('pointerup', dropHold);
      node.addEventListener('pointercancel', dropHold);
      node.addEventListener('pointermove', dropHold);
      node.addEventListener('click', (event) => {
        if (event.target.closest('.path-x')) return;
        if (skipClick) {
          skipClick = false;
          return;
        }
        pathRestore(route);
      });
      host.append(node);
    });
  }

  function pathDeleteRoute(key) {
    if (!pathState || key === pathChainKey(pathChainFilms())) return;
    pathState.routes = pathState.routes.filter((route) => route.key !== key);
    pathPaintRoutes();
  }

  function pathRestore(route) {
    if (!pathState || !route || route.key === pathChainKey(pathChainFilms())) return;
    const saved = pathState.routes.find((item) => item.key === route.key) || route;
    pathSaveCurrent();
    pathState.origin = { ...(saved.origin || saved.films[0]) };
    pathState.steps = (saved.steps || []).map(pathCloneStep);
    pathState.queued = null;
    pathSync(true);
    pathState.steps.forEach((step, index) => {
      if (!step.candidates) pathLoadStep(index);
    });
    const films = saved.films || [];
    const last = films[films.length - 1];
    if (!last) return;
    pathLock = true;
    showRecommendation(pathRow(last));
    pathLock = false;
  }

  async function archiveRecommendation(row) {
    const kind = row.type === 'tv' ? 'tv' : 'movie';
    const query = `https://www.themoviedb.org/${kind}/${row.tmdbId}`;
    let payload = null;
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(query)}`);
      payload = await response.json().catch(() => null);
      if (!response.ok || !payload || !payload.film || !payload.facets) return false;
    } catch {
      return false;
    }
    let film = payload.film;
    const facets = payload.facets;
    if (isUnreleased(film)) return false;
    film = withCanonicalId({ ...film, poster: film.poster || row.poster || '' }, facets);
    if (!archive) {
      archive = globalThis.Store.create('leer');
      removed = new Set();
      facetOverrides = archive.facetOverrides || {};
      state = archive.entries || {};
      added = [];
      FILMS = [];
      byId.clear();
      started = true;
    }
    if (byId.has(film.id)) return true;
    const existing = findExisting(film, facets);
    if (existing && (byId.has(existing.id) || FILMS.some((item) => item.id === existing.id))) return true;
    if (film.poster) posters.set(film.id, film.poster);
    added.push(film);
    FILMS.push(film);
    byId.set(film.id, film);
    rememberFacets(film.id, facets);
    queueArchivePlace(film);
    return true;
  }

  function recGlyph(kind) {
    if (kind === 'check') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 12.5 10 16.5 18.5 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="miter"></polyline></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
  }

  function paintRecMark(button, on) {
    button.innerHTML = recGlyph(on ? 'check' : 'plus');
    button.setAttribute('aria-label', on ? t('In the archive') : t('Add to archive'));
    button.classList.toggle('is-in', on);
    button.disabled = on;
  }

  function recRow(row, state) {
    const line = el('div', 'link');
    const open = el('button', 'rec-open');
    open.type = 'button';
    const cover = el('span', 'link-poster');
    if (row.poster) {
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.loading = 'lazy';
      image.src = row.poster;
      cover.append(image);
    } else {
      cover.classList.add('is-blank');
      cover.style.setProperty('--blank', `hsl(${posterHue(row.tmdbId)} 25% 14%)`);
      cover.append(el('span', 'poster-title', row.title || t('Movie')));
    }
    const copy = el('span', 'link-copy');
    const foot = el('span', 'rec-foot');
    if (row.year) foot.append(el('span', 'rec-year', String(row.year)));
    foot.append(el('span', 'link-meta', `★ ${formatScore(row.vote)}`));
    copy.append(el('span', 'link-title', row.title), foot);
    open.append(cover, copy);
    open.addEventListener('click', () => showRecommendation(row));
    const plus = el('button', 'rec-add');
    plus.type = 'button';
    const held = recInArchive(row) || state.added.has(row.tmdbId);
    paintRecMark(plus, held);
    if (!held) {
      plus.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (plus.disabled) return;
        plus.disabled = true;
        const ok = await archiveRecommendation(row);
        if (state.token !== recToken || !plus.isConnected) return;
        if (!ok) {
          plus.disabled = false;
          return;
        }
        state.added.add(row.tmdbId);
        paintRecMark(plus, true);
      });
    }
    line.append(open, plus);
    return line;
  }

  function paintRec(state, group) {
    if (state.token !== recToken || !group.isConnected) return;
    const ranked = recRanked(state);
    if (!ranked.length && !state.more && !state.loading) {
      group.hidden = true;
      group.replaceChildren();
      return;
    }
    group.hidden = false;
    const shown = ranked.slice(0, state.shown);
    group.replaceChildren(recHead(ranked.length));
    const list = el('div', 'rec-list');
    if (state.loading && !shown.length) {
      list.append(recSkeleton(), recSkeleton(), recSkeleton());
    } else {
      shown.forEach((row) => list.append(recRow(row, state)));
    }
    group.append(list);
    if ((ranked.length > state.shown || state.more) && !(state.loading && !shown.length)) {
      const more = el('button', 'rec-more', t('Show more'));
      more.type = 'button';
      if (state.loading) more.disabled = true;
      more.addEventListener('click', () => {
        state.shown += 6;
        growRec(state, group);
      });
      group.append(more);
    }
    if (shown.length || state.loading) group.append(el('p', 'rec-note', 'Empfehlungen via TMDB'));
  }

  function takeCachedRec(state) {
    while (recRanked(state).length < state.shown && state.more) {
      const hit = cachedRecPage(state.query, state.page + 1);
      if (!hit) return;
      state.page += 1;
      if (hit.director) state.director = hit.director;
      hit.films.forEach((row) => recAbsorb(state, row));
      state.more = hit.more;
    }
  }

  async function growRec(state, group) {
    if (state.loading || state.token !== recToken) return;
    takeCachedRec(state);
    if (recRanked(state).length >= state.shown || !state.more) {
      paintRec(state, group);
      return;
    }
    state.loading = true;
    paintRec(state, group);
    let guard = 0;
    while (state.token === recToken && recRanked(state).length < state.shown && state.more && guard < 6) {
      guard += 1;
      const data = await pullRecPage(state.query, state.page + 1);
      if (state.token !== recToken) return;
      if (!data) {
        state.more = false;
        break;
      }
      state.page += 1;
      if (data.director) state.director = data.director;
      (data.films || []).forEach((row) => recAbsorb(state, row));
      state.more = Boolean(data.more);
    }
    state.loading = false;
    paintRec(state, group);
  }

  function mountRecommendations(film) {
    const query = recommendationQuery(film);
    if (!query) return;
    recToken += 1;
    const state = {
      token: recToken,
      film,
      query,
      director: '',
      map: new Map(),
      page: 0,
      more: true,
      shown: 6,
      added: new Set(),
      loading: false,
    };
    const group = el('section', 'group recs');
    (panel.querySelector('.panel-scroll') || panel).append(group);
    group.replaceChildren(recHead(0));
    const pending = el('div', 'rec-list');
    pending.append(recSkeleton(), recSkeleton(), recSkeleton());
    group.append(pending, el('p', 'rec-note', t('Recommendations via TMDB')));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (state.token !== recToken || !group.isConnected) return;
        growRec(state, group);
      });
    });
  }

  function listedWishItem(list, film) {
    if (!list || !film) return null;
    const keys = new Set();
    if (film.id) keys.add(film.id);
    const keyOf = globalThis.Store && globalThis.Store.filmKey;
    if (keyOf) {
      const canon = keyOf(film);
      if (canon) keys.add(canon);
    }
    const openItem = wishOpenId === list.id
      ? (wishItems || []).find((item) => item && keys.has(item.filmId))
      : null;
    if (openItem) {
      if (!openItem._posterFilm) openItem._posterFilm = film;
      return openItem;
    }
    const stamp = (list.stamps || []).find((item) => item && keys.has(item.filmId));
    if (!stamp) return null;
    return {
      id: stamp.id,
      filmId: stamp.filmId,
      createdAt: stamp.createdAt,
      addedBy: stamp.addedBy,
      _posterFilm: film,
    };
  }

  function listRemoveButton(film, list) {
    const button = el('button', 'panel-remove is-list');
    button.type = 'button';
    const name = (list && list.title) || t('List');
    const label = t('Remove from {name}', { name });
    button.title = label;
    button.setAttribute('aria-label', label);
    const sure = el('span', 'wish-sure', 'sure?');
    const main = el('span', 'panel-remove-main');
    main.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg><span>Remove</span>';
    button.append(sure, main);
    let timer = 0;
    const calm = () => {
      window.clearTimeout(timer);
      button.classList.remove('is-sure');
    };
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!button.classList.contains('is-sure')) {
        button.classList.add('is-sure');
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          endTransient(button);
          calm();
        }, 4000);
        openTransient(button, calm);
        return;
      }
      endTransient(button);
      window.clearTimeout(timer);
      button.disabled = true;
      const item = listedWishItem(list, film);
      const ok = item ? await removeWishItem(item, list, { holdBoard: true }) : false;
      if (!button.isConnected) return;
      if (!ok) {
        button.disabled = false;
        calm();
        if (!item) setWishStatus('Das hat nicht geklappt.');
        return;
      }
      clearSelection();
    });
    return button;
  }

  function renderPanel(film, options) {
    const quiet = Boolean(options && options.quiet);
    const stay = Boolean(options && options.stay) && !panel.hidden;
    const keptScroll = stay ? panelScroller().scrollTop : 0;
    const shownLinks = quiet ? [] : links;
    closeWishSearch();
    document.querySelectorAll('body > .wish-pick').forEach((node) => node.remove());
    panelFilm = film;
    const row = entry(film.id);
    const mine = byId.has(film.id);
    clearGenreFit();
    panel.replaceChildren();

    const remove = el('button', 'panel-remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', t('Aus meinem Archiv entfernen'));
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg><span>Remove</span>';
    remove.addEventListener('click', () => removeFilm(film.id));
    const closeIcon = el('button', 'panel-close');
    closeIcon.type = 'button';
    closeIcon.setAttribute('aria-label', t('Schließen'));
    closeIcon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    closeIcon.addEventListener('click', clearSelection);
    const wish = el('button', 'panel-wish');
    wish.type = 'button';
    wish.setAttribute('aria-label', t('To list'));
    wish.setAttribute('aria-expanded', 'false');
    wish.innerHTML = '<svg viewBox="11.6 8.9 23.8 21.2" aria-hidden="true"><path d="M34.1683 20.7058V29.0678H12.71V20.7058" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12.6153 21.0938L15.7784 15.5959" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M34.3842 21.0938L31.2211 15.5959" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12.7305 21.0974H29.6584M34.2682 21.0974H28.8838" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M23.4995 9.93219V18.6407" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M19.1455 14.2865L27.854 14.2865" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg><span>To list</span>';
    const pick = el('div', 'wish-pick');
    pick.hidden = true;
    const addedNote = el('span', 'panel-added');
    addedNote.hidden = true;
    wish.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!pick.hidden) {
        closeTransient();
        return;
      }
      const token = {};
      wish._pickToken = token;
      await fillWishPick(pick, film, wishWrap);
      if (wish._pickToken !== token || !wish.isConnected) return;
      placeWishPick(pick, wish);
      wish.setAttribute('aria-expanded', 'true');
      const onScroll = () => closeTransient();
      panelScroller().addEventListener('scroll', onScroll, { passive: true });
      openTransient(pick, () => {
        panelScroller().removeEventListener('scroll', onScroll);
        pick.hidden = true;
        wish.setAttribute('aria-expanded', 'false');
      }, (target) => wish.contains(target));
    });
    const full = fullOf(film);
    const head = el('div', 'panel-head');
    const bar = el('div', 'panel-bar');
    bar.append(el('span', 'panel-grab'), closeIcon);
    const sheet = el('div', 'panel-scroll');
    panel.append(bar, sheet);
    const hero = el('div', 'panel-hero');
    const poster = el('div', 'panel-poster');
    const known = knownPoster(film);
    if (known) {
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.src = known;
      poster.append(image);
    } else {
      poster.classList.add('is-blank');
      poster.style.setProperty('--blank', `hsl(${posterHue(film.id)} 25% 14%)`);
      poster.append(el('span', 'poster-title', film.title || t('Movie')));
    }
    const copy = el('div', 'panel-copy');
    const copyTop = el('div', 'panel-copy-top');
    if (film.year) copyTop.append(el('p', 'panel-year', String(film.year)));
    copyTop.append(el('h1', null, film.title));
    const copyFoot = el('div', 'panel-copy-foot');
    if (full.director) {
      const director = el('p', 'panel-credit');
      director.append(el('span', 'panel-kicker', 'Director'));
      const name = el('button', 'credit-link', full.director);
      name.type = 'button';
      name.addEventListener('click', () => highlight({
        title: t('Director: {name}', { name: full.director }),
        style: 'director',
        ids: filmsWith('director', full.director),
      }));
      director.append(name);
      copyFoot.append(director);
    }
    const names = (full.cast || []).filter(Boolean);
    let cast = null;
    if (names.length) {
      cast = el('p', 'panel-credit panel-cast');
      cast.append(el('span', 'panel-kicker', 'Cast'));
      names.forEach((name, index) => {
        if (index) cast.append(document.createTextNode(', '));
        const person = el('button', 'cast-link', name);
        person.type = 'button';
        person.addEventListener('click', () => highlight({
          title: t('With: {name}', { name }),
          style: 'cast',
          ids: filmsWith('cast', name),
        }));
        cast.append(person);
      });
      copyFoot.append(cast);
    }
    copy.append(copyTop);
    if (copyFoot.childNodes.length) copy.append(copyFoot);
    hero.append(poster, copy);
    head.append(hero);
    const meta = el('div', 'panel-meta');
    const score = el('p', 'panel-score');
    const localImdb = (window.FILMS || []).some((row) => row && row.id === film.id);
    score.append(
      el('span', 'star', '★'),
      el('span', 'panel-score-value', film.imdbLabel || '–'),
      el('span', 'panel-score-source', localImdb ? 'IMDb' : 'TMDB'),
    );
    meta.append(score);
    const genres = (film.genres || []).filter(Boolean).slice(0, 3);
    if (genres.length) {
      const pills = el('ul', 'pills');
      pills.dataset.genres = genres.join('\n');
      genres.forEach((genre) => pills.append(genrePill(genre)));
      meta.append(pills);
      bindGenreFit(meta);
    }
    head.append(meta);
    const blurb = el('div', 'panel-overview-slot');
    head.append(blurb);
    overviewToken += 1;
    paintOverview(film, blurb, quiet);
    if (needsProfile() && globalThis.Store && globalThis.Store.syncable && !globalThis.Store.syncable(film.id)) {
      head.append(el('p', 'unsynced', 'nicht synchronisiert'));
    }
    const actions = el('div', 'panel-actions');
    const wishWrap = el('div', 'panel-wish-wrap');
    wishWrap.append(wish, addedNote);
    actions.append(wishWrap);
    if (panelList) actions.append(listRemoveButton(film, panelList));
    else if (mine && !isUpcomingFilm(film)) actions.append(remove);
    else if (!mine && !isUnreleased(film)) actions.append(archiveAddButton(film, remove));
    head.append(actions);
    sheet.append(head);
    const followed = el('div', 'followed-row');
    followed.hidden = true;
    sheet.append(followed);
    if (!(quiet && !mine)) fillFollowed(film.id, followed);

    const shared = panelList && panelList.members && panelList.members.length > 1 ? panelList : null;
    const rateSection = el('section', 'group');
    if (isUnreleased(film)) {
      rateSection.append(sectionHead(t('Rating')));
      rateSection.append(el('p', 'release-note', releaseLine(film)));
    } else {
      rateSection.append(sectionHead(t('Rating'), { tag: 'label', htmlFor: 'own-rate' }));
      rateSection.append(shared ? sharedRateBlock(film, shared, row) : ownRateBlock(film, row));
    }
    const noteSection = el('section', 'group');
    noteSection.append(sectionHead(t('Note'), { tag: 'label', htmlFor: 'own-memo' }));
    const memo = document.createElement('textarea');
    memo.id = 'own-memo';
    memo.className = 'memo';
    memo.maxLength = 500;
    memo.value = row.memo;
    memo.addEventListener('input', () => writeEntry(film.id, { memo: memo.value }));
    noteSection.append(memo);
    sheet.append(rateSection);
    if (isCustomFilm(film)) suggestCustomLink(film);
    appendTraits(film, full);
    sheet.append(noteSection);
    mountRecommendations(film);

    [
      'Gleiche Handschrift',
      'Ähnliche Geschichte',
      'Ähnliche Stimmung',
      'Gleiche Welt',
    ].forEach((name) => {
      const items = shownLinks.filter((link) => link.group === name).slice(0, 6);
      if (!items.length) return;
      const group = el('section', 'group');
      group.append(sectionHead(t(GROUP_TEXT[name] || name)));
      items.forEach((link) => {
        const other = byId.get(link.id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'link';
        button.dataset.id = other.id;
        if (other.id === activeLinkId) button.classList.add('is-active');
        const cover = el('span', 'link-poster');
        const known = knownPoster(other);
        if (known) {
          const image = document.createElement('img');
          image.alt = '';
          image.draggable = false;
          image.decoding = 'async';
          image.loading = 'lazy';
          image.src = posterSrc(other);
          cover.append(image);
        } else {
          cover.classList.add('is-blank');
          cover.style.setProperty('--blank', `hsl(${posterHue(other.id)} 25% 14%)`);
          cover.append(el('span', 'poster-title', other.title || t('Movie')));
        }
        const copy = el('span', 'link-copy');
        copy.append(
          el('span', 'link-title', other.title),
          el('span', 'link-meta', link.reason),
        );
        button.append(cover, copy);
        button.addEventListener('pointerenter', (event) => {
          if (event.pointerType === 'touch') return;
          setActiveLink(other.id);
        });
        button.addEventListener('click', () => openFilm(other, true));
        group.append(button);
      });
      sheet.append(group);
    });
    if (stay) panelScroller().scrollTop = keptScroll;
    else if (quiet && !panel.hidden) panelScroller().scrollTop = 0;
    else revealPanel();
    if (cast) requestAnimationFrame(() => fitCastNames(cast));
  }

  const TRAIT_FIELDS = [
    ['genres', 'Genre', 'genre', 3],
    ['subgenres', 'Subgenre', 'subgenre', 2],
    ['themes', 'Theme', 'theme', 4],
    ['tone', 'Tone', 'tone', 2],
    ['narrative', 'Narrative', 'narrative', 2],
  ];

  function traitChip(label, value, kind) {
    const button = el('button', 'chip');
    button.type = 'button';
    button.append(el('small', null, label), el('span', null, value));
    button.addEventListener('click', () => highlight({
      title: `${label}: ${t(value)}`,
      style: 'content',
      ids: filmsWith(kind, value),
    }));
    return button;
  }

  function missingChip(label) {
    const node = el('span', 'chip is-missing');
    node.append(el('small', null, label), el('span', null, t('Missing')));
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
    find.placeholder = t('Suchen');
    find.setAttribute('aria-label', t('Search {label}', { label: t(label) }));
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
    select.append(new Option(t('Missing'), ''));
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
    block.append(el('p', 'facet-label', t('Intensity')));
    const row = el('div', 'chips');
    for (let mark = 1; mark <= 5; mark += 1) {
      const button = el('button', editDraft.intensity === mark ? 'chip is-on' : 'chip', String(mark));
      button.type = 'button';
      button.setAttribute('aria-label', t('Intensity {n} of 5', { n: mark }));
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
      form.append(facetEditor(field, t(label), limit));
    });
    form.append(intensityEditor());
    form.append(choiceEditor(t('Era'), 'epoch', (vocabulary && vocabulary.epoch) || []));
    form.append(choiceEditor(t('Setting'), 'place', (vocabulary && vocabulary.place) || []));
    const actions = el('div', 'trait-actions');
    const save = el('button', 'text-button', t('Save'));
    save.type = 'button';
    save.addEventListener('click', () => saveDraft(film));
    const cancel = el('button', 'text-button', t('Cancel'));
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
      const name = t(label);
      if (!values.length) {
        list.append(missingChip(name));
        return;
      }
      values.forEach((value) => list.append(traitChip(name, value, kind)));
    });
    if (typeof full.intensity === 'number' && full.intensity > 0) {
      const button = el('button', 'chip');
      button.type = 'button';
      button.setAttribute('aria-label', t('Intensity {n} of 5', { n: full.intensity }));
      const dots = el('span', 'dots');
      dots.setAttribute('aria-hidden', 'true');
      for (let mark = 1; mark <= 5; mark += 1) dots.append(el('span', mark <= full.intensity ? 'on' : ''));
      button.append(el('small', null, t('Intensity')), dots);
      button.addEventListener('click', () => highlight({
        title: t('Intensity: {n}', { n: full.intensity }),
        style: 'content',
        ids: filmsWith('intensity', full.intensity),
      }));
      list.append(button);
    } else {
      list.append(missingChip(t('Intensity')));
    }
    if (full.epoch) list.append(traitChip(t('Era'), full.epoch, 'epoch'));
    else list.append(missingChip(t('Era')));
    if (full.place) list.append(traitChip(t('Setting'), full.place, 'place'));
    else list.append(missingChip(t('Setting')));
    return list;
  }

  function appendTraits(film, full) {
    const editing = editDraft && editDraft.id === film.id;
    const section = el('section', 'group');
    section.append(sectionHead(t('Traits')));
    section.append(editing ? traitEditor(film) : traitView(full));
    (panel.querySelector('.panel-scroll') || panel).append(section);
  }

  function savedMode() {
    try {
      const raw = localStorage.getItem(MODE_KEY);
      if (raw === 'director' || raw === 'rating' || raw === 'network' || raw === 'profile' || raw === 'wish') return raw;
    } catch {
      /* private mode can refuse storage */
    }
    return 'network';
  }

  function savedWallSort() {
    try {
      const raw = localStorage.getItem(SORT_KEY);
      if (raw === 'director' || raw === 'genre' || raw === 'cast') return raw;
    } catch {
      /* private mode can refuse storage */
    }
    return 'director';
  }

  function rememberMode(next) {
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* private mode can refuse storage; the session still works */
    }
  }

  function rememberWallSort(next) {
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      /* private mode can refuse storage; the session still works */
    }
  }

  function hideSortMenu() {
    const modes = modeDirector && modeDirector.closest('.modes');
    const pop = document.getElementById('sort-pop');
    if (modes) modes.classList.remove('is-sort-open');
    if (pop) pop.setAttribute('aria-hidden', 'true');
    if (modeDirector) modeDirector.setAttribute('aria-expanded', 'false');
  }

  function closeSortMenu() {
    const pop = document.getElementById('sort-pop');
    if (transient && pop && transient.element === pop) return closeTransient();
    hideSortMenu();
  }

  function paintSortMenu() {
    const pop = document.getElementById('sort-pop');
    if (!pop) return;
    pop.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.sort === wallSort ? 'true' : 'false');
    });
  }

  function ensureNetwork() {
    if (network) return network;
    network = globalThis.Network.create({
      stage: networkEl,
      films: FILMS,
      posterSrc,
      ratingColor: (score) => coverTint(score),
      paintWear,
      entry: (id) => viewEntry(id),
      selectedId: () => selectedId,
      onChoose: choose,
      onBlank: blankNetwork,
    });
    return network;
  }

  function paintLensBar() {
    const bar = document.getElementById('lens-bar');
    if (!bar) return;
    const label = bar.querySelector('span');
    const person = lensPack && lensPack.profile;
    const visible = person && (mode === 'network' || mode === 'rating');
    bar.hidden = !visible;
    if (label) label.textContent = visible ? t('View of {name}', { name: person.display_name || person.username || t('Profile') }) : '';
  }

  function clearLens() {
    lensId = null;
    lensPack = null;
    paintLensBar();
  }

  async function openTheirView(id, kind) {
    if (!id || !account || id === account.id) return;
    resetView();
    const next = kind === 'rating' ? 'rating' : 'network';
    lensId = id;
    lensPack = null;
    const pack = await packFor(id).catch(() => null);
    if (lensId !== id) return;
    if (!pack || !pack.canView) {
      clearLens();
      showOther(id);
      return;
    }
    lensPack = pack;
    applyMode(next);
    paintLensBar();
  }

  async function showLensNetwork() {
    wall.hidden = true;
    networkEl.hidden = false;
    document.body.classList.add('is-network');
    if (!lensPack) return;
    if (!networkReady) {
      const savedId = lensId;
      const savedPack = lensPack;
      lensId = null;
      lensPack = null;
      await showNetwork();
      if (lensId !== null || savedId == null) return;
      lensId = savedId;
      lensPack = savedPack;
    }
    const view = ensureNetwork();
    const films = (lensPack.films || []).map((film) => theirFull(film, lensPack.entryOf(film.id)));
    view.showGuest(films);
    guestNet = true;
    refreshEmpty();
  }

  async function showNetwork() {
    if (lensPack) {
      showLensNetwork();
      return;
    }
    if (guestNet && network && network.restoreOwn) {
      network.restoreOwn();
      guestNet = false;
    }
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
    FILMS.forEach((film) => {
      if (!film || view.hasButton(film.id)) return;
      const point = archive && archive.positions ? archive.positions[film.id] : null;
      if (point) view.showFilm(film, point, { fade: false });
    });
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

  let transient = null;

  function closeTransient() {
    if (!transient) return false;
    const done = transient.onClose;
    transient = null;
    done();
    return true;
  }

  function endTransient(element) {
    if (!transient) return;
    if (!element || transient.element === element) transient = null;
  }

  function openTransient(element, onClose, keep) {
    if (!element) return;
    if (transient && transient.element === element) return;
    if (transient) closeTransient();
    transient = {
      element,
      onClose,
      keep: typeof keep === 'function' ? keep : null,
    };
  }

  function transientHolds(target) {
    if (!transient) return false;
    if (transient.element && transient.element.contains(target)) return true;
    return Boolean(transient.keep && transient.keep(target));
  }

  function resetView() {
    if (pathOn) closePath();
    document.body.classList.remove('is-path-panel');
    closeTransient();
    editDraft = null;
    spotlight = null;
    renderBar();
    closeWishSearch();
    panelFilm = null;
    selectedId = null;
    links = [];
    activeLinkId = null;
    hidePanel();
    document.body.classList.remove('has-selection', 'is-wish-search');
    if (network) {
      if (network.stopMotion) network.stopMotion();
      network.setFocus(null);
    }
    stopCompare();
    paint();
  }

  function blankNetwork() {
    if (spotlight) {
      spotlight = null;
      renderBar();
    }
    if (selectedId || !panel.hidden) clearSelection();
    else applyNetworkFocus();
  }

  function setMode(next) {
    clearLens();
    resetView();
    return applyMode(next);
  }

  function applyMode(next) {
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
    if (next !== 'wish' && wishSearchList) {
      closeWishSearch();
      if (!selectedId) hidePanel();
    }
    if (mode === 'network' && next !== 'network') flushPlaceQueue(false);
    mode = next;
    ratingView = next === 'rating';
    rememberMode(next);
    if (next !== 'director') closeSortMenu();
    modeNetwork.setAttribute('aria-selected', next === 'network' ? 'true' : 'false');
    modeDirector.setAttribute('aria-selected', next === 'director' ? 'true' : 'false');
    modeRating.setAttribute('aria-selected', next === 'rating' ? 'true' : 'false');
    if (modeProfile) modeProfile.setAttribute('aria-selected', next === 'profile' ? 'true' : 'false');
    if (modeWish) modeWish.setAttribute('aria-selected', next === 'wish' ? 'true' : 'false');
    const profile = document.getElementById('profile');
    const wishBoard = document.getElementById('wish-board');
    if (profile) profile.hidden = next !== 'profile';
    if (wishBoard) wishBoard.hidden = next !== 'wish';
    document.body.classList.toggle('is-profile', next === 'profile');
    document.body.classList.toggle('is-rating', ratingView);
    document.body.classList.toggle('is-wish', next === 'wish');
    paintLensBar();
    if (next === 'profile') {
      networkEl.hidden = true;
      wall.hidden = true;
      document.body.classList.remove('is-network');
      if (skipProfileHome) skipProfileHome = false;
      else renderProfile();
      return Promise.resolve();
    }
    if (next === 'wish') {
      networkEl.hidden = true;
      wall.hidden = true;
      document.body.classList.remove('is-network');
      paintWishBoard();
      return Promise.resolve();
    }
    if (wishBoard) wishBoard.hidden = true;
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
          title: person.kind === 'director' ? t('Director: {name}', { name: person.name }) : t('With: {name}', { name: person.name }),
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
  modeDirector.addEventListener('click', (event) => {
    event.stopPropagation();
    const modes = modeDirector.closest('.modes');
    const pop = document.getElementById('sort-pop');
    if (!modes || !pop) return;
    const willOpen = !modes.classList.contains('is-sort-open');
    if (!willOpen) {
      closeSortMenu();
      return;
    }
    const compare = document.getElementById('compare-pop');
    if (compare) compare.hidden = true;
    if (netCompare) netCompare.setAttribute('aria-expanded', 'false');
    paintSortMenu();
    modes.classList.add('is-sort-open');
    pop.setAttribute('aria-hidden', 'false');
    modeDirector.setAttribute('aria-expanded', 'true');
    openTransient(pop, hideSortMenu, (target) => modeDirector.contains(target));
  });
  document.getElementById('sort-pop').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !button.dataset.sort) return;
    event.stopPropagation();
    wallSort = button.dataset.sort;
    rememberWallSort(wallSort);
    paintSortMenu();
    closeSortMenu();
    resetView();
    if (mode === 'director') showWall();
    else setMode('director');
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('button, a, input, textarea, select, .poster, .genre-bar, .wish-invite, .wish-undo, .net-film')) return;
    const board = event.target.closest('#wall, #wish-board, .their-wall');
    if (!board) return;
    if (!selectedId && panel.hidden) return;
    clearSelection();
  });
  modeRating.addEventListener('click', () => setMode('rating'));
  if (modeWish) modeWish.addEventListener('click', () => setMode('wish'));
  if (modeProfile) modeProfile.addEventListener('click', () => setMode('profile'));
  const lensClose = document.getElementById('lens-close');
  if (lensClose) {
    lensClose.addEventListener('click', () => {
      const back = mode === 'rating' ? 'rating' : 'network';
      setMode(back);
    });
  }
  if (netRating) {
    netRating.addEventListener('click', () => {
      netRatingOn = !netRatingOn;
      netRating.setAttribute('aria-pressed', netRatingOn ? 'true' : 'false');
      if (network) network.setRating(netRatingOn);
    });
  }
  if (netCompare) {
    netCompare.addEventListener('click', (event) => {
      event.stopPropagation();
      const pop = document.getElementById('compare-pop');
      if (!pop) return;
      if (!pop.hidden) {
        if (!closeTransient()) {
          pop.hidden = true;
          netCompare.setAttribute('aria-expanded', 'false');
        }
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
  const addHits = el('div', 'add-hits');
  addHits.hidden = true;
  addFilm.append(addHits);
  let addRows = [];
  let addCursor = 0;
  let addShownFor = '';
  let addTimer = 0;
  let addToken = 0;
  let addPicking = false;
  let addBusy = false;
  const searchForm = document.getElementById('search-form');
  const searchOpen = document.getElementById('search-open');

  function resetAdd() {
    addFilm.classList.remove('is-open');
    addButton.setAttribute('aria-expanded', 'false');
    addQuery.disabled = true;
    addStatus.textContent = '';
    window.clearTimeout(addTimer);
    addRows = [];
    addCursor = 0;
    addShownFor = '';
    addHits.replaceChildren();
    addHits.hidden = true;
    addQuery.value = '';
  }

  function closeAdd() {
    if (transient && transient.element === addFilm) return closeTransient();
    resetAdd();
  }

  function addQueryIsLink(query) {
    return /^https?:\/\//i.test(query) || /themoviedb\.org|imdb\.com/i.test(query) || /^tt\d{5,}$/i.test(query);
  }

  function paintAddHits() {
    addHits.replaceChildren();
    addHits.hidden = !addRows.length;
    addRows.forEach((row, index) => {
      const film = row.film;
      const owned = row.source === 'archiv' || byId.has(film.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'add-hit';
      if (index === addCursor) button.classList.add('is-current');
      if (owned) button.classList.add('is-owned');
      button.setAttribute('aria-label', [film.title, film.year].filter(Boolean).join(' '));
      const frame = el('span', 'add-hit-poster');
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.src = posterSrc(film);
      frame.append(image);
      if (owned) frame.append(el('span', 'add-hit-check', '✓'));
      button.append(
        frame,
        el('span', 'add-hit-title', film.title || t('Movie')),
        el('span', 'add-hit-year', film.year ? String(film.year).slice(0, 4) : ''),
      );
      button.addEventListener('click', () => chooseAddHit(row));
      addHits.append(button);
    });
  }

  async function refreshAddHits(query) {
    const mine = ++addToken;
    addShownFor = query;
    if (query.length < 2 || addQueryIsLink(query)) {
      addRows = [];
      addCursor = 0;
      paintAddHits();
      return;
    }
    const found = await wishSearch(query).catch(() => []);
    if (mine !== addToken || addQuery.value.trim() !== query) return;
    addRows = found.slice(0, 3);
    addCursor = Math.max(0, Math.min(addCursor, Math.max(addRows.length - 1, 0)));
    if (!addRows.length) addCursor = 0;
    paintAddHits();
  }

  async function chooseAddHit(row) {
    if (!row || addPicking) return;
    addPicking = true;
    try {
      const shown = withCanonicalId({ ...row.film }, row.facets || {});
      const owned = row.source === 'archiv' || byId.has(shown.id) || findExisting(shown, row.facets || {});
      if (owned) {
        const existing = byId.get(shown.id) || findExisting(shown, row.facets || {}) || shown;
        closeAdd();
        revealFilm(adopt(existing));
        return;
      }
      addStatus.textContent = row.source === 'tmdb' ? 'Ich hole Daten von TMDB …' : '';
      const resolved = row.source === 'tmdb' ? await completeWishHit({ ...row, film: shown }) : { ...row, film: shown };
      const film = resolved.film || shown;
      const facets = resolved.facets || {};
      const already = byId.get(film.id) || findExisting(film, facets);
      if (already) {
        closeAdd();
        revealFilm(adopt(already));
        return;
      }
      addRows = [];
      paintAddHits();
      placeFilm(film, facets);
    } finally {
      addPicking = false;
    }
  }

  async function commitAdd() {
    if (addBusy) return;
    addBusy = true;
    try {
      const query = addQuery.value.trim();
      if (!query) {
        addStatus.textContent = t('Titel oder Link eintragen.');
        return;
      }
      if (!addQueryIsLink(query) && query.length >= 2) {
        window.clearTimeout(addTimer);
        if (addShownFor !== query) await refreshAddHits(query);
        if (addRows.length) {
          await chooseAddHit(addRows[addCursor] || addRows[0]);
          return;
        }
      }
      addStatus.textContent = t('Ich hole Daten von TMDB …');
      addForm.querySelector('button[type=submit]').disabled = true;
      try {
        const response = await fetch(`/api/film?q=${encodeURIComponent(query)}`);
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.film || !data?.facets) {
          addStatus.textContent = t((data && data.error) || 'Dazu finde ich keinen Film.');
          return;
        }
        placeFilm(data.film, data.facets);
      } catch {
        addStatus.textContent = t('Der Abruf ist gerade nicht möglich.');
      } finally {
        addForm.querySelector('button[type=submit]').disabled = false;
      }
    } finally {
      addBusy = false;
    }
  }

  function fitHeadLine(owner) {
    if (!owner) return;
    const slot = owner.querySelector('.line-slot');
    if (!slot) return;
    const icon = owner.getBoundingClientRect();
    const mid = icon.top + icon.height / 2;
    let edge = 0;
    document.querySelectorAll('header .brand, header .modes').forEach((node) => {
      const box = node.getBoundingClientRect();
      if (!box.width || box.top > mid || box.bottom < mid) return;
      edge = Math.max(edge, box.right);
    });
    // Linie endet mit Abstand vor «YOUR PLOT» (bzw. den Ansichts-Icons am Desktop).
    const room = Math.floor(icon.left - 10 - edge - 22);
    const cap = owner === searchForm ? 300 : 260;
    slot.style.setProperty('--line', `${Math.max(60, Math.min(cap, room))}px`);
  }

  window.addEventListener('resize', () => {
    if (addFilm.classList.contains('is-open')) fitHeadLine(addFilm);
    if (searchForm.classList.contains('is-open')) fitHeadLine(searchForm);
  });

  function openAdd() {
    closeSearch();
    addQuery.disabled = false;
    fitHeadLine(addFilm);
    addFilm.classList.add('is-open');
    addButton.setAttribute('aria-expanded', 'true');
    addQuery.focus();
    const query = addQuery.value.trim();
    if (query.length >= 2 && !addQueryIsLink(query)) refreshAddHits(query);
    openTransient(addFilm, resetAdd);
  }

  function resetSearch() {
    searchForm.classList.remove('is-open');
    searchOpen.setAttribute('aria-expanded', 'false');
    results.hidden = true;
    search.value = '';
    search.disabled = true;
  }

  function closeSearch() {
    if (transient && transient.element === searchForm) return closeTransient();
    resetSearch();
  }

  function openSearch() {
    closeAdd();
    search.disabled = false;
    fitHeadLine(searchForm);
    searchForm.classList.add('is-open');
    searchOpen.setAttribute('aria-expanded', 'true');
    search.focus();
    openTransient(searchForm, resetSearch);
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
    if (isUnreleased(film)) {
      addStatus.textContent = releaseLine(film);
      return;
    }
    film = withCanonicalId(film, facets);
    const existing = findExisting(film, facets);
    if (existing) {
      addStatus.textContent = t('Den Film gibt es schon.');
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
    if (genre && sub) addStatus.textContent = t('Filed as {genre} · {sub}', { genre: t(genre), sub: t(sub) });
    else if (genre) addStatus.textContent = t('Filed as {genre}', { genre: t(genre) });
    else addStatus.textContent = t('Eingeordnet.');
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
    if (transient && !transientHolds(event.target)) closeTransient();
  }, true);

  addQuery.addEventListener('input', () => {
    const query = addQuery.value.trim();
    window.clearTimeout(addTimer);
    addShownFor = '';
    if (query.length < 2 || addQueryIsLink(query)) {
      addRows = [];
      addCursor = 0;
      paintAddHits();
      return;
    }
    addTimer = window.setTimeout(() => refreshAddHits(query), 250);
  });

  addQuery.addEventListener('keydown', (event) => {
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && addRows.length) {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      addCursor = Math.max(0, Math.min(addRows.length - 1, addCursor + step));
      paintAddHits();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitAdd();
  });

  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    commitAdd();
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
      if (closeTransient()) return;
      if (editDraft) {
        const film = byId.get(editDraft.id);
        editDraft = null;
        if (film && selectedId === film.id) renderPanel(film);
        return;
      }
      if (profileMode === 'list' && listKind === 'friends') {
        closeFriends();
        return;
      }
      if (spotlight) {
        clearHighlight();
        return;
      }
      clearSelection();
    }
  });
  let profileShape = '';
  window.addEventListener('resize', () => {
    if (mode === 'network' && network) network.resize();
    if (pathOn) pathLayout();
    const shape = `${window.innerWidth < 1000 ? 'narrow' : 'wide'}:${topCap()}`;
    if (shape === profileShape) return;
    profileShape = shape;
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#profile input, #profile textarea');
    if (typing || document.querySelector('.profile-avatar.is-dirty')) return;
    if (mode === 'profile' && profileMode === 'home') paintProfile();
    else if (mode === 'profile' && profileMode === 'other' && viewingId && otherCache.has(viewingId)) {
      paintOther(otherCache.get(viewingId));
    }
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
    const count = lensPack ? lensPack.films.length : FILMS.length;
    node.hidden = count > 0 || mode !== 'network';
  }

  function showRoster() {
    if (mode === 'wish') {
      paintWishBoard();
      refreshEmpty();
      return;
    }
    if (lensPack) {
      if (mode === 'network') showLensNetwork();
      else if (mode !== 'profile') showWall();
      refreshEmpty();
      return;
    }
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
    wallSort = savedWallSort();
    paintSortMenu();
    paintAvatarTab();
    const ready = setMode('rating');
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

  const placeQueue = [];
  let placeTimer = 0;
  let placeIdle = 0;
  let netQuietAt = performance.now();

  function queueArchivePlace(film) {
    if (!film) return;
    if (mode !== 'network') {
      seatProvisional(film);
      scheduleRelayout();
      return;
    }
    placeQueue.push(film);
    armPlaceQueue();
  }

  function noteNetMotion() {
    netQuietAt = performance.now();
    if (!placeQueue.length) return;
    window.clearTimeout(placeTimer);
    if (placeIdle) {
      if (window.cancelIdleCallback) window.cancelIdleCallback(placeIdle);
      placeIdle = 0;
    }
    placeTimer = window.setTimeout(tryFlushPlaceQueue, 2000);
  }

  function armPlaceQueue() {
    if (!placeQueue.length) return;
    window.clearTimeout(placeTimer);
    if (placeIdle) {
      if (window.cancelIdleCallback) window.cancelIdleCallback(placeIdle);
      placeIdle = 0;
    }
    const wait = Math.max(0, 2000 - (performance.now() - netQuietAt));
    placeTimer = window.setTimeout(tryFlushPlaceQueue, wait);
  }

  function tryFlushPlaceQueue() {
    placeTimer = 0;
    if (!placeQueue.length) return;
    if (mode !== 'network') {
      flushPlaceQueue(false);
      return;
    }
    if (selectedId || performance.now() - netQuietAt < 2000) {
      const remain = 2000 - (performance.now() - netQuietAt);
      placeTimer = window.setTimeout(tryFlushPlaceQueue, selectedId ? 2000 : Math.max(200, remain));
      return;
    }
    const run = () => {
      placeIdle = 0;
      if (!placeQueue.length) return;
      if (mode !== 'network' || selectedId || performance.now() - netQuietAt < 2000) {
        armPlaceQueue();
        return;
      }
      flushPlaceQueue(true);
    };
    if (window.requestIdleCallback) {
      placeIdle = window.requestIdleCallback(run, { timeout: 2000 });
      return;
    }
    run();
  }

  function flushPlaceQueue(show) {
    window.clearTimeout(placeTimer);
    placeTimer = 0;
    if (placeIdle && window.cancelIdleCallback) window.cancelIdleCallback(placeIdle);
    placeIdle = 0;
    const batch = placeQueue.splice(0, placeQueue.length);
    batch.forEach((film) => seatProvisional(film));
    if (!show || mode !== 'network' || !network || !network.showFilm) return;
    batch.forEach((film) => {
      const point = archive && archive.positions ? archive.positions[film.id] : null;
      network.showFilm(film, point);
    });
  }

  if (networkEl) {
    const netDown = new Set();
    networkEl.addEventListener('wheel', noteNetMotion, { passive: true });
    networkEl.addEventListener('pointerdown', (event) => netDown.add(event.pointerId));
    networkEl.addEventListener('pointerup', (event) => netDown.delete(event.pointerId));
    networkEl.addEventListener('pointercancel', (event) => netDown.delete(event.pointerId));
    networkEl.addEventListener('pointermove', (event) => {
      if (event.buttons || netDown.has(event.pointerId)) noteNetMotion();
    });
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
      search.textContent = t('suchen');
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
            status.textContent = t('Abgelegt.');
          } else {
            note.textContent = t('Den Film gibt es schon.');
            row.remove();
          }
        } catch (error) {
          note.textContent = t(error && error.message ? error.message : 'Dazu finde ich keinen Film.');
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
    field.placeholder = t('Ein Titel pro Zeile. Optional: Titel (Jahr) oder ein Link.');
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
        status.textContent = t('Wird abgebrochen …');
        return;
      }
      if (gate && !archive) openSheet(gateView());
      else closeSheet();
    });
    go.addEventListener('click', async () => {
      const queries = csvText ? queriesFromCsv(csvText) : queriesFromText(field.value);
      if (!queries.length) {
        status.textContent = t('Trag mindestens einen Titel ein.');
        return;
      }
      if (!archive) adoptArchive(globalThis.Store.create('leer'));
      go.disabled = true;
      importCancel = false;
      importBusy = true;
      cancel.textContent = t('Abbrechen');
      const result = await importQueries(queries, (done, total) => {
        status.textContent = `${done} / ${total}`;
      });
      importBusy = false;
      cancel.disabled = false;
      cancel.textContent = t('Schließen');
      await startApp();
      showRoster();
      const parts = [];
      if (result.addedCount) parts.push(t('{n} added', { n: result.addedCount }));
      if (result.skipped) parts.push(t('{n} skipped', { n: result.skipped }));
      if (result.misses.length) parts.push(t('{n} not found', { n: result.misses.length }));
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

  /* Login-Animation (gate-sky.js): läuft hinter dem Formular, als Ladebildschirm und beim Übergang in die App */
  let sky = null;
  let skyLeaving = false;
  let skySplash = false;
  let skyObserver = null;
  let skyFailed = false;

  function gateNode() {
    return document.getElementById('gate');
  }

  function ensureSky() {
    if (sky || skyFailed) return sky;
    const gate = gateNode();
    if (!gate || !globalThis.GateSky || !globalThis.SphereColours) return null;
    let canvas = gate.querySelector('canvas.gate-sky');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'gate-sky';
      canvas.setAttribute('aria-hidden', 'true');
      gate.prepend(canvas);
    }
    sky = globalThis.GateSky.create(canvas);
    if (!sky) {
      skyFailed = true;
      canvas.remove();
    }
    return sky;
  }

  // Kugel oben, Formular direkt darunter (nicht mehr am unteren Rand)
  function skyHome() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const card = document.getElementById('gate-card');
    const filled = card && card.childElementCount > 0;
    if (skySplash || !filled) {
      const r = Math.min(110, Math.max(60, Math.min(W, H) * 0.26));
      return { x: W / 2, y: H * 0.42, r };
    }
    const phone = W <= 720;
    const r = phone ? Math.min(80, Math.max(48, W * 0.2)) : Math.min(100, Math.max(56, H * 0.11));
    const y = r + (phone ? 70 : Math.max(70, H * 0.08));
    const gate = gateNode();
    if (gate) gate.style.setProperty('--gate-top', `${Math.round(y + r + (phone ? 48 : 56))}px`);
    return { x: W / 2, y, r };
  }

  function placeSky() {
    if (sky && !skyLeaving) sky.setHome(skyHome());
  }

  window.addEventListener('resize', placeSky);

  function runSky(mode, splash) {
    const gate = gateNode();
    if (!gate || gate.hidden || skyLeaving) return;
    const run = ensureSky();
    if (!run) return;
    skySplash = Boolean(splash);
    document.documentElement.classList.toggle('sky-splash', skySplash);
    const card = document.getElementById('gate-card');
    if (!skyObserver && card && 'ResizeObserver' in window) {
      skyObserver = new ResizeObserver(placeSky);
      skyObserver.observe(card);
    }
    run.setHome(skyHome());
    if (run.running()) run.setMode(mode);
    else run.start(mode);
  }

  function setGateBusy(on) {
    const gate = gateNode();
    if (gate) gate.classList.toggle('is-busy', Boolean(on));
    if (on && gate && gate.contains(document.activeElement)) document.activeElement.blur();
  }

  function profileTarget() {
    const node = document.getElementById('mode-profile');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    if (!box.width) return null;
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, r: box.width / 2 };
  }

  // Farben der Profilkugel laufen ein, dann fliegt die Kugel an ihren Platz oben links und «YOUR PLOT» erscheint
  function leaveSky() {
    const root = document.documentElement;
    const gate = gateNode();
    skyLeaving = true;
    setGateBusy(true);
    root.classList.add('sky-leaving');
    root.classList.remove('needs-auth');
    const wave = globalThis.SphereColours.avatarToWave(avatarColors(account && account.avatar));
    sky.prepare(wave);
    // erst nach dem Aufbau der App weiterlaufen lassen (der Aufbau blockiert kurz, die Kugel ist dann fast still)
    window.setTimeout(() => sky.release(profileTarget, () => {
      gate.classList.add('is-fading');
      window.setTimeout(() => {
        gate.hidden = true;
        gate.classList.remove('is-fading', 'is-busy');
        root.classList.remove('sky-leaving', 'sky-splash');
        root.classList.add('brand-arrive');
        if (sky) sky.stop();
        skyLeaving = false;
        skySplash = false;
        window.setTimeout(() => root.classList.remove('brand-arrive'), 1000);
      }, 450);
    }), 0);
  }

  // sobald die Profilfarben bekannt sind, laufen sie ein, auch wenn im Hintergrund noch geladen wird
  function skyColours() {
    const gate = gateNode();
    if (!sky || !sky.running() || skyLeaving || !gate || gate.hidden) return;
    sky.prepare(globalThis.SphereColours.avatarToWave(avatarColors(account && account.avatar)));
  }

  function lockScreen() {
    const root = document.documentElement;
    root.classList.add('needs-auth');
    root.classList.remove('sky-leaving', 'brand-arrive');
    skyLeaving = false;
    const gate = gateNode();
    if (gate) {
      gate.hidden = false;
      gate.classList.remove('is-fading', 'is-busy');
    }
  }

  function unlockScreen() {
    const gate = gateNode();
    if (skyLeaving) return;
    if (sky && sky.running() && gate && !gate.hidden) {
      leaveSky();
      return;
    }
    document.documentElement.classList.remove('needs-auth', 'sky-splash');
    if (gate) gate.hidden = true;
    if (sky) sky.stop();
  }

  function authText(error) {
    if (!error) return 'Keine Verbindung.';
    const message = String(error.message || error.error_description || error.msg || '');
    if (error.name === 'TypeError' || /failed to fetch|network|load failed/i.test(message)) return 'Keine Verbindung.';
    if (/vergeben|already registered|already been registered/i.test(message)) return 'Dieser Benutzername ist vergeben.';
    if (/invalid login|invalid credentials/i.test(message)) return 'Name oder Passwort stimmt nicht.';
    if (/at least|too short|weak password|zu kurz/i.test(message)) return 'Das Passwort ist zu kurz.';
    if (/Benutzername|Passwort|stimmen nicht|Verbindung|Zeichen|eingerichtet|ungültig|eintragen/.test(message)) return message;
    return 'Keine Verbindung.';
  }

  // eigener Begriff + klein und gedimmt der übliche Begriff daneben (z. B. «Plot twist  password»)
  // die üblichen Begriffe erscheinen erst, wenn man den Titel antippt (nochmals tippen blendet sie aus)
  function authLabel(node, main, plain) {
    node.replaceChildren(document.createTextNode(main));
    if (plain) node.append(el('span', 'auth-plain', plain));
    if (plain && node.dataset.explain !== '1') {
      node.dataset.explain = '1';
      if (node.tagName === 'H1') {
        node.addEventListener('click', () => {
          const card = node.closest('.gate-card');
          if (card) card.classList.toggle('is-explained');
        });
      }
    }
    return node;
  }

  function authField(label, type, name, autocomplete, plain) {
    const wrap = document.createElement('label');
    authLabel(wrap, label, plain);
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

  function topCap() {
    if (window.innerWidth < 1000) return 5;
    return 10;
  }

  function defaultTopFilms() {
    return FILMS.filter((film) => entry(film.id).rating != null).sort((a, b) => {
      const diff = entry(b.id).rating - entry(a.id).rating;
      if (diff) return diff;
      return (Date.parse(entry(b.id).ratedAt) || 0) - (Date.parse(entry(a.id).ratedAt) || 0);
    }).slice(0, topCap());
  }

  function shownTopFilms() {
    return defaultTopFilms();
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
    caption.textContent = t(label);
    node.append(num, caption);
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  function lineButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-line';
    button.textContent = t(label);
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
      outgoing: names.outgoing || [],
    };
    followDot = (names.pending || 0) > 0;
    applyProfileDot();
    paintAvatarTab();
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
    if (listKind === 'friends') paintFriends();
    else if (listKind === 'followers') paintNames('Follower', profileLists.followers, 'followers');
    else if (listKind === 'following') paintNames('Folgt', profileLists.following, 'following');
  }

  async function changeFollow(id, action) {
    const cloud = globalThis.Cloud;
    if (!cloud || !id) return;
    try {
      if (action === 'follow') await cloud.follow(id);
      else if (action === 'unfollow') await cloud.unfollow(id);
      else if (action === 'remove') await cloud.removeFriend(id);
      else if (action === 'accept') await cloud.acceptFriend(id);
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
      kind: row.kind === 'custom' ? 'custom' : (row.kind === 'tv' ? 'serie' : 'film'),
      release_date: row.release_date || null,
      status: row.status || null,
      checked_at: row.checked_at || null,
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
    tint.style.background = row.rating == null ? '' : coverTint(row.rating);
    const score = document.createElement('span');
    score.className = 'poster-score';
    score.textContent = row.rating == null ? '' : `★  ${row.rating.toFixed(1).replace('.', ',')}`;
    button.append(image, tint, score);
    paintWear(button, row.rating);
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
        el('span', 'genre-count', group.films.length === 1 ? t('1 movie') : t('{n} movies', { n: group.films.length })),
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
    block.append(el('h2', 'profile-kicker', `Top ${topCap()}`));
    const films = pack.headFilms || [];
    if (!films.length) {
      block.append(el('p', 'profile-note', 'Not enough ratings yet'));
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
    const cap = topCap();
    block.append(sectionHead(`Top ${cap}`, { kicker: 'top-kicker', rule: 'top-rule' }));
    const custom = pack.sensitive && Array.isArray(pack.sensitive.top_films) ? pack.sensitive.top_films : [];
    const films = custom.length
      ? custom.map((id) => pack.films.find((film) => film.id === id)).filter(Boolean).slice(0, cap)
      : pack.films.filter((film) => pack.entryOf(film.id).rating != null).sort((a, b) => {
        const diff = pack.entryOf(b.id).rating - pack.entryOf(a.id).rating;
        if (diff) return diff;
        return (Date.parse(pack.entryOf(b.id).updatedAt) || 0) - (Date.parse(pack.entryOf(a.id).updatedAt) || 0);
      }).slice(0, cap);
    if (!films.length) {
      block.append(el('p', 'profile-note', custom.length
        ? t('The selected movies are no longer in the archive.')
        : t('Not enough ratings yet')));
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
    section.append(el('p', 'compare-line', t('You both watched: {names}', { names: both })));
    section.append(el('p', 'compare-line', t('Average: you {mine} · them {their}', { mine: mineAvg == null ? '–' : scoreText(mineAvg), their: theirAvg == null ? '–' : scoreText(theirAvg) })));
    gaps.sort((a, b) => b.gap - a.gap || String(a.film.title || '').localeCompare(b.film.title || '', 'de'));
    const picked = gaps.slice(0, 3);
    if (picked.length) {
      const block = document.createElement('div');
      block.append(el('p', 'profile-kicker', 'Euer grösster Unterschied'));
      picked.forEach((item) => {
        const line = el('button', 'text-line', t('{title} · you {mine} · them {their}', { title: item.film.title, mine: scoreText(item.mine), their: scoreText(item.theirs) }));
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
    back.textContent = t('Zurück');
    back.addEventListener('click', () => renderProfile());
    root.append(back);
    const head = el('div', 'profile-head');
    head.append(avatarNode(person.avatar, 84), el('h1', null, person.display_name || person.username || 'Profil'));
    root.append(head);
    const stats = pack.stats || {};
    const numbers = el('div', 'profile-stats');
    numbers.append(
      statNode(String(Number(stats.films) || 0), t('Movies')),
      statNode(stats.friends == null ? '–' : String(Number(stats.friends) || 0), 'Friends'),
    );
    root.append(numbers);
    if (pack.canView) root.append(paintTheirTop(pack));
    const tasteSlot = el('div', 'taste-slot');
    root.append(tasteSlot);
    loadTheirTaste(root, person.id);
    if (pack.canView) {
      const views = el('div', 'wish-menu');
      const networkButton = lineButton('Netzwerk');
      networkButton.addEventListener('click', () => openTheirView(person.id, 'network'));
      const ratingButton = lineButton('Rating');
      ratingButton.addEventListener('click', () => openTheirView(person.id, 'rating'));
      views.append(networkButton, ratingButton);
      root.append(views);
    }
    const incoming = (profileLists.requests || []).some((row) => row.id === person.id);
    const friends = pack.follow === 'accepted';
    const follow = lineButton(friends ? 'Entfernen' : pack.follow === 'pending' ? 'Angefragt' : incoming ? 'Annehmen' : 'Anfrage senden');
    if (pack.follow === 'pending') follow.disabled = true;
    else follow.addEventListener('click', () => changeFollow(person.id, friends ? 'remove' : incoming ? 'accept' : 'follow'));
    root.append(follow);
    const status = el('p', 'profile-status', '');
    status.setAttribute('role', 'status');
    root.append(status);
    if (!pack.canView) return;
    const people = theirPeople(pack);
    const pins = theirPins(pack);
    const split = el('div', 'profile-split');
    const left = el('div', 'profile-col');
    const right = el('div', 'profile-col');
    left.append(paintPeople('actors', 'Favorite actors', people.actors, { readOnly: true, pins }));
    right.append(paintPeople('directors', 'Favorite directors', people.directors, { readOnly: true, pins }));
    split.append(left, right);
    root.append(split);
    root.append(paintComparison(pack));
    root.append(paintTheirWall(pack));
    root.append(paintTheirNext(pack));
  }

  function showOther(id) {
    if (!id) return;
    resetView();
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
    input.placeholder = t('Profile suchen');
    input.setAttribute('aria-label', t('Profile suchen'));
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
        note.textContent = t('Link kopiert.');
      } catch {
        note.textContent = url;
      }
    });
    block.append(input, hits, copy, note);
    return block;
  }

  function paintRequests(root) {
    const rows = profileLists.requests || [];
    if (!rows.length) return;
    const block = document.createElement('section');
    block.className = 'request-block';
    rows.forEach((person) => {
      const line = el('div', 'request-line');
      line.append(avatarNode(person.avatar, 28));
      const name = el('button', 'text-line', person.name || person.username || 'Profil');
      name.type = 'button';
      if (person.id) name.addEventListener('click', () => showOther(person.id));
      const accept = lineButton('Ja');
      accept.addEventListener('click', () => changeFollow(person.id, 'accept'));
      const decline = lineButton('Nein');
      decline.addEventListener('click', () => changeFollow(person.id, 'decline'));
      line.append(name, accept, decline);
      block.append(line);
    });
    root.append(block);
  }

  const friendArrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 17.5 17.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path><path d="M10 6.5h7.5V14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  const friendCheck = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5 10.2 16.5 18 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  function resetFriendInvite(box) {
    const host = box || document.querySelector('.friend-invite.is-open, .friend-invite.is-ok');
    if (!host) return false;
    host.classList.remove('is-open', 'is-error', 'is-ok');
    const plus = host.querySelector('.friend-plus');
    if (plus) plus.setAttribute('aria-expanded', 'false');
    const input = host.querySelector('input');
    if (input) {
      input.value = '';
      input.placeholder = t('');
    }
    const suggest = host.querySelector('.friend-suggest');
    if (suggest) {
      suggest.hidden = true;
      suggest.replaceChildren();
    }
    host._suggest = null;
    window.clearTimeout(host._suggestTimer);
    const send = host.querySelector('.friend-send');
    if (send) send.innerHTML = friendArrow;
    return true;
  }

  function closeFriendInvite() {
    const box = document.querySelector('.friend-invite.is-open, .friend-invite.is-ok');
    if (transient && box && transient.element === box) return closeTransient();
    return resetFriendInvite(box);
  }

  function friendInviteNode() {
    const box = el('div', 'profile-stat friend-invite');
    const row = el('div', 'friend-invite-row');
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'friend-plus';
    plus.setAttribute('aria-label', t('Add Friend'));
    plus.setAttribute('aria-expanded', 'false');
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('viewBox', '0 0 24 24');
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<path class="plus-v" d="M12 4.5v15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path><path d="M4.5 12h15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>';
    plus.append(mark);
    const slot = el('div', 'line-slot');
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('aria-label', t('Benutzername'));
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 20;
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'friend-send';
    send.setAttribute('aria-label', t('Anfrage senden'));
    send.innerHTML = friendArrow;
    slot.append(input, send);
    row.append(plus, slot);
    const suggest = el('div', 'friend-suggest');
    suggest.hidden = true;
    box.append(row, el('span', null, 'Add friend'), suggest);
    const open = () => {
      box.classList.add('is-open');
      box.classList.remove('is-error', 'is-ok');
      plus.setAttribute('aria-expanded', 'true');
      input.placeholder = t('');
      requestAnimationFrame(() => input.focus());
      openTransient(box, () => resetFriendInvite(box));
    };
    plus.addEventListener('click', () => {
      if (box.classList.contains('is-open')) closeFriendInvite();
      else open();
    });
    let busy = false;
    let searchToken = 0;
    const hideSuggest = () => {
      suggest.hidden = true;
      suggest.replaceChildren();
      box._suggest = null;
    };
    const bestProfile = (query, rows) => {
      const needle = String(query || '').trim().toLowerCase();
      let best = null;
      let bestRank = 0;
      let bestLength = Infinity;
      (rows || []).forEach((row) => {
        if (!row || (account && row.id === account.id)) return;
        [row.username, row.display_name].forEach((value) => {
          const name = String(value || '').trim().toLowerCase();
          if (!name) return;
          let rank = 0;
          if (name === needle) rank = 3;
          else if (name.startsWith(needle)) rank = 2;
          else if (name.includes(needle)) rank = 1;
          if (!rank) return;
          if (rank > bestRank || (rank === bestRank && name.length < bestLength)) {
            best = row;
            bestRank = rank;
            bestLength = name.length;
          }
        });
      });
      return best;
    };
    const suggestState = (person) => {
      if (!person) return '';
      if (mutualPeople().some((friend) => friend.id === person.id)) return 'friend';
      if ((profileLists.outgoing || []).some((friend) => friend.id === person.id)) return 'asked';
      return '';
    };
    const paintSuggest = (person) => {
      suggest.replaceChildren();
      suggest.hidden = false;
      if (!person) {
        box._suggest = null;
        suggest.append(el('p', 'friend-suggest-empty', 'No one found'));
        return;
      }
      const state = suggestState(person);
      const button = document.createElement('button');
      button.type = 'button';
      const name = el('span', 'friend-suggest-name', person.display_name || person.username || 'Profil');
      button.append(avatarNode(person.avatar, 28), name);
      if (state === 'friend' || state === 'asked') {
        box._suggest = null;
        button.disabled = true;
        button.setAttribute('aria-label', state === 'friend' ? 'Already friends' : 'Request sent');
        const mark = el('span', state === 'asked' ? 'friend-suggest-mark is-dim' : 'friend-suggest-mark');
        mark.innerHTML = friendCheck;
        button.append(mark);
      } else {
        box._suggest = person;
        button.addEventListener('click', () => { submit(); });
      }
      suggest.append(button);
      requestAnimationFrame(() => fitSuggestName(name));
    };
    const fitSuggestName = (name) => {
      if (!name) return;
      let size = 16;
      name.style.fontSize = '16px';
      name.style.textOverflow = 'clip';
      while (size > 11 && name.scrollWidth > name.clientWidth) {
        size -= 1;
        name.style.fontSize = `${size}px`;
      }
      if (name.scrollWidth > name.clientWidth) name.style.textOverflow = 'ellipsis';
    };
    const lookUp = () => {
      window.clearTimeout(box._suggestTimer);
      const query = input.value.trim();
      searchToken += 1;
      hideSuggest();
      if (query.length < 2) return;
      const mine = searchToken;
      box._suggestTimer = window.setTimeout(async () => {
        const cloud = globalThis.Cloud;
        if (!cloud || !cloud.searchProfiles) return;
        try {
          const rows = await cloud.searchProfiles(query);
          if (mine !== searchToken || !box.classList.contains('is-open')) return;
          paintSuggest(bestProfile(query, rows));
        } catch {
          if (mine !== searchToken) return;
          paintSuggest(null);
        }
      }, 200);
    };
    const fail = (reason) => {
      box.classList.add('is-error');
      input.value = '';
      input.placeholder = reason;
      window.setTimeout(() => box.classList.remove('is-error'), 1400);
    };
    const succeed = () => {
      box.classList.remove('is-error');
      box.classList.add('is-ok');
      send.innerHTML = friendCheck;
      window.setTimeout(() => closeFriendInvite(), 700);
    };
    const submit = async () => {
      if (busy || !box.classList.contains('is-open')) return;
      const person = box._suggest;
      if (!person || !person.id || !globalThis.Cloud || !globalThis.Cloud.follow) return;
      if (account && person.id === account.id) return;
      busy = true;
      try {
        await globalThis.Cloud.follow(person.id);
        await refreshFollowLists();
        input.value = '';
        hideSuggest();
        succeed();
      } catch (error) {
        const duplicate = error && (error.code === '23505' || /duplicate/i.test(String(error.message || '')));
        fail(duplicate ? 'Anfrage offen.' : followFail(error));
      } finally {
        busy = false;
      }
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!suggest.hidden) {
          event.stopPropagation();
          hideSuggest();
        }
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submit();
    });
    input.addEventListener('input', () => {
      box.classList.remove('is-error');
      lookUp();
    });
    return box;
  }

  function archiveAddButton(film, remove) {
    const button = el('button', 'panel-add');
    button.type = 'button';
    button.setAttribute('aria-label', t('Add'));
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg><span>Add</span>';
    button.addEventListener('click', () => {
      if (!addFilmQuiet(film)) return;
      button.replaceWith(remove);
    });
    return button;
  }

  function addFilmQuiet(film) {
    if (!globalThis.Store || !film || isUnreleased(film)) return false;
    if (!archive) {
      archive = globalThis.Store.create('leer');
      removed = new Set();
      facetOverrides = archive.facetOverrides || {};
      state = archive.entries || {};
      added = [];
      FILMS = [];
      byId.clear();
      started = true;
    }
    const facets = film.facets || (globalThis.FILM_FACETS || {})[film.id] || {};
    if (byId.get(film.id) || findExisting(film, facets)) return true;
    const next = { ...film, genres: film.genres || [], cast: film.cast || [] };
    if (next.poster) posters.set(next.id, next.poster);
    added.push(next);
    FILMS.push(next);
    byId.set(next.id, next);
    if (facets && Object.keys(facets).length) {
      facetOverrides[next.id] = facets;
      if (!globalThis.FILM_FACETS) globalThis.FILM_FACETS = {};
      globalThis.FILM_FACETS[next.id] = facets;
    }
    persist();
    return true;
  }

  function addForeignFilm(film) {
    if (!globalThis.Store || !film || isUnreleased(film)) return;
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
      node.replaceChildren(sectionHead(t('Followed')));
      const line = el('p', 'followed-names');
      rows.forEach((person, index) => {
        if (index) line.append(document.createTextNode(' · '));
        const button = document.createElement('button');
        button.type = 'button';
        button.append(avatarNode(person.avatar, 18), document.createTextNode(`${person.username} ${scoreText(person.rating)}`));
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
          avatar: person.avatar || null,
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
    openTransient(pop, () => {
      pop.hidden = true;
      if (netCompare) netCompare.setAttribute('aria-expanded', 'false');
    }, (target) => netCompare && netCompare.contains(target));
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
    endTransient(document.getElementById('compare-pop'));
    if (network && network.setCompare) network.setCompare(map);
    if (netCompare) {
      netCompare.setAttribute('aria-pressed', 'true');
      netCompare.setAttribute('aria-expanded', 'false');
    }
    const bar = document.getElementById('compare-bar');
    if (bar) {
      bar.hidden = false;
      const label = bar.querySelector('span');
      if (label) label.textContent = t('Compare with {name}', { name: compareName });
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
      const inviting = document.querySelector('.friend-invite.is-open, .friend-invite.is-ok');
      if (profileMode === 'home' && !typing && !inviting && !document.querySelector('.profile-avatar.is-dirty')) paintProfile();
      else if (profileMode === 'list' && !document.querySelector('.friend-row.is-gone')) repaintList();
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
        friends: stats.friends != null ? Number(stats.friends) : null,
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

  function closeFriends() {
    profileMode = 'home';
    listKind = '';
    paintProfile();
  }

  function friendGlyph(kind) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = kind === 'remove' ? 'friend-remove' : 'friend-wish';
    if (kind === 'wish') {
      button.setAttribute('aria-label', t('Wunschliste'));
      button.innerHTML = '<svg viewBox="11.6 8.9 23.8 21.2" aria-hidden="true"><path d="M34.1683 20.7058V29.0678H12.71V20.7058" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12.6153 21.0938L15.7784 15.5959" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M34.3842 21.0938L31.2211 15.5959" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12.7305 21.0974H29.6584M34.2682 21.0974H28.8838" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M23.4995 9.93219V18.6407" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M19.1455 14.2865L27.854 14.2865" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    } else {
      button.setAttribute('aria-label', t('Freundschaft entfernen'));
      button.innerHTML = '<svg viewBox="0 0 23.8 21.2" aria-hidden="true"><path d="M0.9 0.9 22.9 20.3M22.9 0.9 0.9 20.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
    }
    return button;
  }

  function friendRow(person) {
    const row = el('div', 'friend-row');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'friend-person';
    open.append(avatarNode(person.avatar, 40), el('span', null, person.name || person.username || 'Profil'));
    if (person.id) open.addEventListener('click', () => showOther(person.id));
    const wish = friendGlyph('wish');
    const remove = friendGlyph('remove');
    let timer = 0;
    wish.addEventListener('click', async () => {
      if (!person.id || !globalThis.Cloud || !globalThis.Cloud.createWishlist) return;
      wish.disabled = true;
      try {
        const id = await globalThis.Cloud.createWishlist('', [person.id]);
        wishFocusId = id;
        await loadWishlists({ quiet: true });
        setMode('wish');
      } catch {
        wish.disabled = false;
      }
    });
    const calmRemove = () => {
      window.clearTimeout(timer);
      remove.classList.remove('is-confirm');
      remove.textContent = '';
      remove.setAttribute('aria-label', t('Freundschaft entfernen'));
      remove.innerHTML = friendGlyph('remove').innerHTML;
    };
    remove.addEventListener('click', async () => {
      if (!remove.classList.contains('is-confirm')) {
        remove.classList.add('is-confirm');
        remove.textContent = t('Entfernen?');
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          endTransient(remove);
          calmRemove();
        }, 4000);
        openTransient(remove, calmRemove);
        return;
      }
      endTransient(remove);
      window.clearTimeout(timer);
      remove.disabled = true;
      try {
        await globalThis.Cloud.removeFriend(person.id);
        otherCache.delete(person.id);
        followedCache = null;
        profileLists.following = (profileLists.following || []).filter((item) => item.id !== person.id);
        profileLists.followers = (profileLists.followers || []).filter((item) => item.id !== person.id);
        if (profileStats && profileStats.friends != null) profileStats.friends = Math.max(0, profileStats.friends - 1);
        row.classList.add('is-gone');
        window.setTimeout(() => {
          row.remove();
          const root = profileRoot();
          if (root && listKind === 'friends' && !root.querySelector('.friend-row')) {
            root.append(el('p', 'profile-note', 'Noch niemand.'));
          }
        }, 180);
        refreshFollowLists();
      } catch {
        remove.disabled = false;
        remove.classList.remove('is-confirm');
        remove.textContent = '';
        remove.innerHTML = friendGlyph('remove').innerHTML;
        remove.setAttribute('aria-label', t('Freundschaft entfernen'));
      }
    });
    const tools = el('div', 'friend-tools');
    tools.append(wish, remove);
    row.append(open, tools);
    return row;
  }

  function paintFriends() {
    const root = profileRoot();
    if (!root) return;
    profileMode = 'list';
    listKind = 'friends';
    viewingId = null;
    root.classList.add('profile-list');
    root.replaceChildren();
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'friend-back';
    back.setAttribute('aria-label', t('Zurück'));
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6.5 8.5 12 15 17.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    back.addEventListener('click', closeFriends);
    root.append(back);
    const people = mutualPeople();
    if (!people.length) {
      root.append(el('p', 'profile-note', 'Noch niemand.'));
      return;
    }
    people.forEach((person) => root.append(friendRow(person)));
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
    back.textContent = t('Zurück');
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
      line.append(avatarNode(person.avatar, 22));
      const open = el('button', 'text-line', person.name || person.username || 'Profil');
      open.type = 'button';
      if (person.id) open.addEventListener('click', () => showOther(person.id));
      line.append(open);
      if ((kind === 'followers' || kind === 'friends') && person.id) {
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
    block.append(sectionHead(title));
    if (!shown.length) {
      block.append(el('p', 'profile-note', 'Not enough ratings yet'));
      return block;
    }
    shown.forEach((person, index) => {
      const line = el('div', 'person-line');
      const rank = document.createElement(readOnly ? 'span' : 'button');
      if (!readOnly) rank.type = 'button';
      rank.className = 'person-rank';
      rank.textContent = String(index + 1);
      if (!readOnly) {
        rank.setAttribute('aria-label', person.pinned ? t('Unpin {name}', { name: person.name }) : t('Pin {name}', { name: person.name }));
        rank.addEventListener('click', () => togglePin(kind, person.name, person.pinned));
      }
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'person-name';
      name.textContent = person.name;
      name.addEventListener('click', () => highlight({
        title: kind === 'directors' ? t('Director: {name}', { name: person.name }) : t('With: {name}', { name: person.name }),
        style: kind === 'directors' ? 'director' : 'cast',
        ids: filmsWith(kind === 'directors' ? 'director' : 'cast', person.name),
      }));
      const meta = person.count
        ? `★ ${scoreText(person.avg)} · ${person.count === 1 ? t('1 movie') : t('{n} movies', { n: person.count })}`
        : (readOnly ? '' : t('0 movies'));
      line.append(rank, name);
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
    const cap = topCap();
    block.append(sectionHead(`Top ${cap}`, { kicker: 'top-kicker', rule: 'top-rule' }));
    const chosen = shownTopFilms();
    if (!chosen.length) {
      block.append(el('p', 'profile-note', t('Rate movies, then your top {n} show up here', { n: cap })));
    } else {
      const row = el('div', 'top-row');
      chosen.forEach((film, index) => {
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
        left.setAttribute('aria-label', t('Nach links'));
        left.disabled = index === 0;
        left.addEventListener('click', () => shiftTop(ids, index, -1, redraw));
        const right = lineButton('›');
        right.setAttribute('aria-label', t('Nach rechts'));
        right.disabled = index === ids.length - 1;
        right.addEventListener('click', () => shiftTop(ids, index, 1, redraw));
        const remove = lineButton('×');
        remove.setAttribute('aria-label', t('Entfernen'));
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
      search.placeholder = t('Im Archiv suchen');
      search.setAttribute('aria-label', t('Im Archiv suchen'));
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
              status.textContent = t('Höchstens 5 Filme.');
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
          status.textContent = t(profileFail(error));
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
          status.textContent = t(profileFail(error));
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
    const stack = el('div', 'profile-settings stack');
    const savedName = (account && (account.display_name || account.username)) || '';
    stack.append(sectionHead('Account'));
    const nameField = el('div', 'name-field');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = savedName;
    nameInput.autocomplete = 'username';
    nameInput.maxLength = 20;
    nameInput.spellcheck = false;
    nameInput.dataset.saved = savedName;
    nameInput.setAttribute('aria-label', t('Display name'));
    const saveName = document.createElement('button');
    saveName.type = 'button';
    saveName.className = 'name-save';
    saveName.textContent = t('Save');
    saveName.hidden = true;
    const syncSave = () => {
      nameField.classList.remove('is-error');
      saveName.hidden = nameInput.value.trim() === nameInput.dataset.saved;
    };
    const showNameMessage = (message) => {
      nameField.classList.add('is-error');
      nameInput.value = '';
      nameInput.placeholder = t(message);
      saveName.hidden = true;
      window.setTimeout(() => {
        if (!nameInput.isConnected) return;
        nameField.classList.remove('is-error');
        nameInput.placeholder = t('');
        nameInput.value = nameInput.dataset.saved || '';
        saveName.hidden = true;
      }, 1400);
    };
    const showLoginNow = (name) => {
      const old = stack.querySelector('.login-now');
      if (old) old.remove();
      const note = el('p', 'login-now', t('From now on, sign in with: {name}', { name }));
      nameField.after(note);
      window.setTimeout(() => {
        if (note.isConnected) note.remove();
        if (nameField.isConnected) paintProfile();
      }, 2500);
    };
    nameInput.addEventListener('input', syncSave);
    saveName.addEventListener('click', async () => {
      const displayName = nameInput.value.trim();
      if (!/^[A-Za-z0-9_]*$/.test(displayName)) {
        showNameMessage('Nur Buchstaben, Ziffern und _');
        return;
      }
      if (displayName.length < 3 || displayName.length > 20) {
        showNameMessage('3 bis 20 Zeichen');
        return;
      }
      saveName.disabled = true;
      try {
        const result = await globalThis.Cloud.renameAccount(displayName);
        account.display_name = result.display_name || displayName;
        account.username = result.username || displayName.toLowerCase();
        nameInput.dataset.saved = account.display_name;
        nameInput.value = account.display_name;
        saveName.hidden = true;
        const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        mark.setAttribute('viewBox', '0 0 24 24');
        mark.setAttribute('aria-hidden', 'true');
        mark.classList.add('name-check');
        mark.innerHTML = '<path d="M5 12.5 10 17.5 19 7" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>';
        nameField.append(mark);
        const sync = stack.querySelector('.login-sync');
        if (sync) sync.remove();
        showLoginNow(account.username);
      } catch (error) {
        console.error('[rename]', error);
        const message = error && error.message;
        if (message === 'Name vergeben' || message === 'Nur Buchstaben, Ziffern und _' || message === '3 bis 20 Zeichen' || message === 'Höchstens 5 pro Stunde.' || message === 'Keine Verbindung.') {
          showNameMessage(message);
        } else {
          showNameMessage(message || 'Das hat nicht geklappt.');
        }
        saveName.disabled = false;
      }
    });
    nameField.append(nameInput, saveName);
    stack.append(nameField);
    const displayName = String((account && account.display_name) || '');
    const loginName = String((account && account.username) || '');
    if (displayName && loginName !== displayName.toLowerCase()) {
      const hint = el('p', 'login-sync');
      hint.append(document.createTextNode(t('Login name: {name}', { name: loginName })));
      const align = document.createElement('button');
      align.type = 'button';
      align.className = 'text-line';
      align.textContent = t('angleichen');
      align.addEventListener('click', async () => {
        if (!globalThis.Cloud || !globalThis.Cloud.renameAccount) return;
        align.disabled = true;
        try {
          const result = await globalThis.Cloud.renameAccount(displayName);
          account.display_name = result.display_name || displayName;
          account.username = result.username || displayName.toLowerCase();
          nameInput.dataset.saved = account.display_name;
          nameInput.value = account.display_name;
          hint.remove();
          showLoginNow(account.username);
        } catch (error) {
          console.error('[rename]', error);
          align.disabled = false;
          const message = error && error.message;
          if (message === 'Name vergeben' || message === 'Nur Buchstaben, Ziffern und _' || message === '3 bis 20 Zeichen' || message === 'Höchstens 5 pro Stunde.' || message === 'Keine Verbindung.') {
            showNameMessage(message);
          } else {
            showNameMessage(message || 'Das hat nicht geklappt.');
          }
        }
      });
      hint.append(align);
      stack.append(hint);
    }
    stack.append(paintLanguage());
    if (recoveryOn) stack.append(paintRecovery());
    stack.append(paintSignOut(), paintDanger());
    return stack;
  }

  function paintLanguage() {
    const row = el('div', 'lang-row');
    row.append(el('span', 'lang-label', t('Language:')));
    const choices = [['en', 'English'], ['de', 'Deutsch']];
    choices.forEach(([code, label]) => {
      const button = el('button', 'lang-choice', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', uiLang() === code ? 'true' : 'false');
      button.addEventListener('click', () => chooseLanguage(code));
      row.append(button);
    });
    return row;
  }

  function chooseLanguage(code) {
    const next = code === 'de' ? 'de' : 'en';
    if (uiLang() === next) return;
    if (globalThis.I18n) globalThis.I18n.set(next);
    if (account) account.language = next;
    const cloud = globalThis.Cloud;
    if (cloud && cloud.updateProfile) cloud.updateProfile({ language: next }).catch(() => {});
    applyLanguage();
  }

  function applyChrome() {
    document.documentElement.lang = uiLang();
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      const attr = node.getAttribute('data-i18n-attr');
      if (!key) return;
      if (attr) node.setAttribute(attr, t(key));
      else if (!node.querySelector('svg')) node.textContent = t(key);
    });
  }

  function applyLanguage() {
    applyChrome();
    const profile = document.getElementById('profile');
    if (profile && !profile.hidden && profileMode === 'home') paintProfile();
    if (panelFilm && panel && !panel.hidden) {
      renderPanel(panelFilm, { quiet: !byId.has(panelFilm.id), stay: true });
    }
    const board = document.getElementById('wish-board');
    if (board && !board.hidden && mode === 'wish' && typeof paintWishBoard === 'function') paintWishBoard();
    wall.querySelectorAll('.genre-bar').forEach((bar) => {
      const count = bar.querySelector('.genre-count');
      if (!count || !bar.dataset.ids) return;
      const films = bar.dataset.ids.split(',').filter(Boolean);
      count.textContent = films.length === 1 ? t('1 movie') : t('{n} movies', { n: films.length });
    });
  }

  applyChrome();

  function paintSignOut() {
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'account-row';
    out.append(accountIcon('out'), el('span', null, 'Sign out'));
    out.addEventListener('click', () => { leave(); });
    return out;
  }

  function accountIcon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const mark = {
      out: '<path d="M8 6.2H5.8v11.6H8M8 6.2h3.2M8 17.8h3.2M11.2 12H19M15.4 8.4 19 12l-3.6 3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>',
      reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4.8V9h4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>',
    };
    svg.innerHTML = mark[kind] || '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>';
    return svg;
  }

  function dangerIcon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', kind === 'reset'
      ? 'M20 12a8 8 0 1 1-2.3-5.6M20 4.8V9h-4.2'
      : 'M6.5 6.5l11 11M17.5 6.5l-11 11');
    svg.append(path);
    return svg;
  }

  function paintDanger() {
    const wrap = el('div', 'danger');
    const status = el('p', 'profile-status', '');
    status.setAttribute('role', 'status');
    const runReset = async () => {
      const next = await globalThis.Store.reset();
      if (!next) return false;
      adoptArchive(next);
      if (network) {
        network.setFilms(FILMS);
        if (networkReady) network.reflow();
      }
      renderProfile();
      return true;
    };
    const runDelete = async () => {
      try {
        await globalThis.Cloud.deleteAccount();
        await leave();
        return true;
      } catch (error) {
        status.textContent = t(profileFail(error));
        return false;
      }
    };
    const sureRow = (kind, label, action) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'account-row is-danger';
      row.setAttribute('aria-label', label);
      const icon = el('span', 'account-icon');
      icon.append(accountIcon(kind === 'reset' ? 'reset' : 'x'));
      const sure = el('span', 'account-sure', 'sure?');
      row.append(icon, el('span', null, label), sure);
      let timer = 0;
      const calm = () => {
        window.clearTimeout(timer);
        row.classList.remove('is-sure');
        row.setAttribute('aria-label', label);
      };
      row.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (row.disabled) return;
        if (!row.classList.contains('is-sure')) {
          status.textContent = '';
          row.classList.add('is-sure');
          row.setAttribute('aria-label', t('{label}: tap the icon again to confirm', { label }));
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            endTransient(row);
            calm();
          }, 4000);
          openTransient(row, calm);
          return;
        }
        // In «sure?»: Tippen auf «sure?» bricht ab, Tippen auf das Icon bestätigt.
        if (!event.target.closest('.account-icon')) {
          endTransient(row);
          calm();
          return;
        }
        endTransient(row);
        window.clearTimeout(timer);
        row.disabled = true;
        const ok = await action();
        if (!ok && row.isConnected) {
          row.disabled = false;
          calm();
        }
      });
      return row;
    };
    wrap.append(
      sureRow('reset', 'Reset archive', runReset),
      sureRow('delete', 'Delete account', runDelete),
      status,
    );
    return wrap;
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
    input.placeholder = t('E-Mail (freiwillig, nur zum Zurücksetzen)');
    input.value = profileMail && profileMail.email ? profileMail.email : '';
    input.setAttribute('aria-label', t('E-Mail (freiwillig, nur zum Zurücksetzen)'));
    const status = el('p', 'profile-status', '');
    status.setAttribute('role', 'status');
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = profileMail && profileMail.email ? t('Ändern') : t('Hinzufügen');
    save.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = t('Die E-Mail sieht ungültig aus.');
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
        status.textContent = t(profileFail(error));
        save.disabled = false;
      }
    });
    block.append(input, save, status);
    if (profileMail && profileMail.email) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = t('Entfernen');
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await globalThis.Cloud.removeRecoveryEmail();
          profileMail = null;
          paintProfile();
        } catch (error) {
          status.textContent = t(profileFail(error));
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
    input.placeholder = t('zurücksetzen');
    input.setAttribute('aria-label', t('zurücksetzen eingeben'));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('Archiv zurücksetzen');
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
    input.placeholder = t('löschen');
    input.setAttribute('aria-label', t('löschen eingeben'));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('Konto löschen');
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
        status.textContent = t(profileFail(error));
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

  function posterHue(id) {
    let hash = 0;
    const text = String(id || '');
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash % 360;
  }

  function localDay(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function isCustomFilm(film) {
    if (!film) return false;
    return film.kind === 'custom' || String(film.id || '').indexOf('custom:') === 0;
  }

  function filmReleaseIso(film) {
    if (!film) return '';
    const match = String(film.release_date || film.releaseDate || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  function isUpcomingFilm(film) {
    if (!film || isCustomFilm(film)) return false;
    const day = localDay(filmReleaseIso(film));
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (day) return day > start;
    const status = String(film.status || '');
    if (!status) return false;
    return status !== 'Released' && status !== 'Canceled';
  }

  function isUnreleased(film) {
    return isCustomFilm(film) || isUpcomingFilm(film);
  }

  function releaseStamp(film) {
    if (!film) return '';
    if (isCustomFilm(film)) {
      const year = String(film.year || '').slice(0, 4);
      return /^\d{4}$/.test(year) ? year : 'UPCOMING';
    }
    const day = localDay(filmReleaseIso(film));
    if (!day) return isUpcomingFilm(film) ? 'UPCOMING' : '';
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (day <= start) {
      const added = localDay(String(film.addedAt || '').slice(0, 10));
      if (!added || added >= day) return '';
      return `${day.getDate()}.${day.getMonth() + 1}.${String(day.getFullYear()).slice(2)}`;
    }
    const soon = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 60);
    if (day <= soon) return `${day.getDate()}.${day.getMonth() + 1}.`;
    const far = new Date(start.getFullYear(), start.getMonth() + 18, start.getDate());
    if (day > far) return String(day.getFullYear());
    const names = uiLang() === 'de'
      ? ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ']
      : ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${names[day.getMonth()]} ${String(day.getFullYear()).slice(2)}`;
  }

  function releaseLine(film) {
    const day = localDay(filmReleaseIso(film));
    if (!day) return 'Erscheinungsdatum noch offen';
    return t('Out on {date}', { date: `${day.getDate()}.${day.getMonth() + 1}.${day.getFullYear()}` });
  }

  function filmCatalogPayload(film, facets) {
    const base = facets && typeof facets === 'object' ? facets : null;
    const score = base && typeof base.tmdbRating === 'number'
      ? base.tmdbRating
      : (typeof film.imdb === 'number' ? film.imdb : null);
    const votes = base && typeof base.tmdbVotes === 'number' ? base.tmdbVotes : null;
    const custom = isCustomFilm(film);
    const release = filmReleaseIso(film);
    return {
      id: film.id,
      imdb_id: base && base.imdbId ? base.imdbId : null,
      title: film.title || 'Film',
      original_title: film.original || null,
      year: film.year ? String(film.year) : null,
      kind: custom ? 'custom' : (/^tmdb:tv:/.test(film.id) || film.kind === 'serie' ? 'tv' : 'movie'),
      poster: custom ? null : ((base && base.poster) || film.poster || null),
      tmdb_rating: score,
      tmdb_votes: Number.isFinite(votes) ? votes : null,
      facets: base,
      release_date: custom || !release ? null : release,
      status: custom ? null : (film.status || null),
      checked_at: new Date().toISOString(),
    };
  }

  function filledFilmValue(value) {
    return value != null && String(value) !== '';
  }

  function keepFilmValue(current, incoming) {
    if (filledFilmValue(incoming)) return incoming;
    if (filledFilmValue(current)) return current;
    return null;
  }

  function rememberedWishDate(id) {
    try {
      const bag = JSON.parse(localStorage.getItem('moviebylucia-wish-dates') || '{}');
      const row = bag && bag[id];
      return row && typeof row === 'object' ? row : null;
    } catch {
      return null;
    }
  }

  function rememberWishDate(film) {
    if (!film || !film.id) return;
    const release = filmReleaseIso(film);
    const status = film.status || '';
    if (!release && !status) return;
    let bag = {};
    try {
      bag = JSON.parse(localStorage.getItem('moviebylucia-wish-dates') || '{}') || {};
    } catch {
      bag = {};
    }
    bag[film.id] = { release_date: release || null, status: status || null };
    try { localStorage.setItem('moviebylucia-wish-dates', JSON.stringify(bag)); } catch { /* Speicher voll */ }
  }

  function withRememberedFilm(film) {
    if (!film || !film.id) return film;
    const kept = rememberedWishDate(film.id);
    if (!kept) return film;
    if (!filledFilmValue(film.release_date) && filledFilmValue(kept.release_date)) film.release_date = kept.release_date;
    if (!filledFilmValue(film.status) && filledFilmValue(kept.status)) film.status = kept.status;
    return film;
  }

  function wishFilmObject(item) {
    const film = wishFilmObjectBase(item);
    if (film && item && item.createdAt) film.addedAt = item.createdAt;
    return film;
  }

  function wishFilmObjectBase(item) {
    const remote = item.film ? filmFromCatalog(item.film) : null;
    const local = byId.get(item.filmId);
    let film;
    if (local) {
      const poster = keepFilmValue(knownPoster(local) || local.poster, remote && remote.poster) || '';
      if (poster) {
        local.poster = poster;
        posters.set(local.id, poster);
      }
      film = {
        ...local,
        poster,
        release_date: keepFilmValue(local.release_date, remote && remote.release_date),
        status: keepFilmValue(local.status, remote && remote.status),
        checked_at: keepFilmValue(local.checked_at, remote && remote.checked_at),
        kind: isCustomFilm(local) || (remote && isCustomFilm(remote)) ? 'custom' : local.kind,
      };
    } else if (remote) {
      if (remote.poster) posters.set(remote.id, remote.poster);
      film = remote;
    } else {
      film = {
        id: item.filmId,
        title: 'Film',
        year: '',
        genres: [],
        cast: [],
        director: '',
        imdbLabel: '–',
      };
    }
    return withRememberedFilm(film);
  }

  function wishUnseen(list, me) {
    const seenAt = Date.parse(wishSeen.lists[list.id] || '') || 0;
    return (list.stamps || []).some((item) => (
      item.addedBy && item.addedBy !== me && Date.parse(item.createdAt) > seenAt
    ));
  }

  function refreshWishDot() {
    const me = account && account.id;
    wishDot = wishLists.some((list) => list.myStatus === 'invited' || wishUnseen(list, me));
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

  const wishOwnAt = new Map();
  let wishLoadTimer = 0;
  let wishLoadResolvers = [];
  let wishLoadOpts = null;
  let wishPaintScroll = null;

  function noteOwnWish(listId) {
    if (!listId) return;
    wishOwnAt.set(listId, Date.now());
  }

  function ownWishRecent(listId) {
    const at = wishOwnAt.get(listId);
    return Boolean(listId && at && Date.now() - at < 3000);
  }

  function wishEventListId(table, payload) {
    const next = payload && payload.new;
    const prev = payload && payload.old;
    const row = (next && (next.wishlist_id || next.id) && next) || prev || {};
    if (table === 'wishlists') return row.id || '';
    if (table === 'wishlist_items' || table === 'wishlist_members') return row.wishlist_id || '';
    if (table === 'wishlist_votes') {
      const itemId = (next && next.item_id) || (prev && prev.item_id) || '';
      if (wishItems.some((item) => item.id === itemId)) return wishOpenId || '';
      const list = wishLists.find((entry) => (entry.stamps || []).some((stamp) => stamp.id === itemId));
      return list ? list.id : '';
    }
    return '';
  }

  function captureWishScroll() {
    if (wishPaintScroll) return wishPaintScroll;
    const start = mode === 'wish' ? document.getElementById('wish-board') : document.getElementById('profile');
    let node = start;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const scrollable = style.overflowY === 'auto' || style.overflowY === 'scroll';
      if (scrollable && node.scrollHeight > node.clientHeight + 2) {
        return { node, top: node.scrollTop, left: node.scrollLeft };
      }
      node = node.parentElement;
    }
    return { node: null, top: window.scrollY, left: window.scrollX };
  }

  function restoreWishScroll(saved) {
    if (!saved) return;
    const apply = () => {
      if (saved.node && saved.node.isConnected) {
        saved.node.scrollTop = saved.top;
        saved.node.scrollLeft = saved.left;
        return;
      }
      window.scrollTo(saved.left, saved.top);
    };
    apply();
    window.requestAnimationFrame(apply);
  }

  function loadWishlists(options) {
    wishLoadOpts = options || null;
    window.clearTimeout(wishLoadTimer);
    const promise = new Promise((resolve) => {
      wishLoadResolvers.push(resolve);
    });
    wishLoadTimer = window.setTimeout(() => {
      const opts = wishLoadOpts;
      const resolvers = wishLoadResolvers;
      wishLoadTimer = 0;
      wishLoadOpts = null;
      wishLoadResolvers = [];
      runLoadWishlists(opts).then(() => resolvers.forEach((resolve) => resolve()));
    }, 400);
    return promise;
  }

  async function runLoadWishlists(options) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.wishOverview || !account) return;
    const token = wishBoot + 1;
    wishBoot = token;
    try {
      const lists = await cloud.wishOverview();
      if (token !== wishBoot || !account) return;
      wishLists = lists || [];
      await ensureWishColors(wishLists);
      if (token !== wishBoot || !account) return;
      refreshWishDot();
      bindWishRealtime();
      const wishTyping = document.activeElement && document.activeElement.closest && document.activeElement.closest('#wish-board');
      const hueOpen = document.querySelector('.genre-name.is-hue');
      if (mode === 'wish' && !wishTyping && !hueOpen && !(options && options.holdBoard)) paintWishBoard();
      if (options && options.quiet) return;
      const typing = document.activeElement && document.activeElement.getAttribute('aria-label') === 'Profile suchen';
      const inviting = document.querySelector('.friend-invite.is-open, .friend-invite.is-ok');
      if (profileMode === 'home' && !typing && !inviting && !document.querySelector('.profile-avatar.is-dirty')) paintProfile();
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
      listen('wishlists', `id=eq.${list.id}`);
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
    if (table === 'wishlists' && eventName === 'UPDATE' && row) {
      const open = document.querySelector('.genre-name.is-hue');
      if (open && open.dataset.list === row.id) return;
    }
    if (table === 'wishlist_items' && eventName === 'INSERT' && row && row.added_by !== (account && account.id)) {
      wishFresh.add(row.id);
      window.setTimeout(() => {
        wishFresh.delete(row.id);
        const node = document.querySelector(`[data-wish-item="${row.id}"]`);
        if (node) node.classList.remove('is-fresh');
      }, 2600);
    }
    const listId = wishEventListId(table, payload);
    if (ownWishRecent(listId)) return;
    loadWishlists();
  }

  function closeWishHue() {
    const open = document.querySelector('.genre-name.is-hue');
    if (!open) return false;
    if (transient && transient.element === open) return closeTransient();
    open.classList.remove('is-hue');
    return true;
  }

  function wishHex(hue, sat, light) {
    const s = sat / 100;
    const l = light / 100;
    const a = s * Math.min(l, 1 - l);
    const channel = (n) => {
      const k = (n + hue / 30) % 12;
      const value = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * value).toString(16).padStart(2, '0');
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
  }

  function wishHue(hex) {
    const text = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(text)) return 0;
    const n = parseInt(text, 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (!delta) return 0;
    let hue = 0;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    return (hue * 60 + 360) % 360;
  }

  async function ensureWishColors(lists) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.randomWishColor || !cloud.setWishlistColor) return;
    const missing = (lists || []).filter((list) => list.myStatus === 'accepted' && !list.color);
    await Promise.all(missing.map(async (list) => {
      const color = cloud.randomWishColor();
      list.color = color;
      try { await cloud.setWishlistColor(list.id, color); } catch { /* Spalte fehlt, bis schema.sql läuft */ }
    }));
  }

  function watchWishTitle(label) {
    const paint = () => {
      if (!label.isConnected) return;
      const extra = label.scrollWidth - label.clientWidth > 2;
      const left = label.scrollLeft > 2;
      const right = extra && label.scrollLeft + label.clientWidth < label.scrollWidth - 2;
      label.classList.toggle('is-more', right);
      label.classList.toggle('is-back', left);
    };
    label.addEventListener('scroll', paint, { passive: true });
    if (typeof ResizeObserver === 'function') {
      const watch = new ResizeObserver(paint);
      watch.observe(label);
    } else requestAnimationFrame(paint);
    let start = 0;
    let moved = false;
    label.addEventListener('pointerdown', (event) => {
      start = event.clientX;
      moved = false;
    });
    label.addEventListener('pointermove', (event) => {
      if (Math.abs(event.clientX - start) > 6) moved = true;
    });
    label.addEventListener('pointerup', paint);
    label.addEventListener('click', (event) => {
      if (label.querySelector('input') || !moved) return;
      moved = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function closeWishRoster() {
    const roster = document.querySelector('.wish-roster');
    if (!roster) return;
    if (transient && transient.element === roster) closeTransient();
    else roster.remove();
  }

  function openWishRoster(cell, list) {
    if (cell.querySelector('.wish-roster')) {
      closeWishRoster();
      return;
    }
    closeWishRoster();
    const people = (list.members || []).slice().sort((a, b) => (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1));
    if (!people.length) return;
    const roster = el('div', 'wish-roster');
    people.forEach((person) => roster.append(wishPersonNode(person)));
    cell.append(roster);
    const onScroll = () => closeWishRoster();
    document.addEventListener('scroll', onScroll, true);
    openTransient(roster, () => {
      document.removeEventListener('scroll', onScroll, true);
      if (roster.isConnected) roster.remove();
    }, (target) => cell.contains(target));
  }

  function wishNameCell(list) {
    const accepted = list.myStatus === 'accepted';
    const invited = list.myStatus === 'invited';
    const cell = el('div', 'genre-name');
    cell.dataset.list = list.id;
    const color = list.color || '#ffffff';
    const swatch = document.createElement(accepted ? 'button' : 'span');
    if (accepted) swatch.type = 'button';
    swatch.className = 'wish-swatch';
    swatch.style.color = color;
    swatch.innerHTML = '<svg viewBox="4.4 5.4 23.2 17.6" fill="none" aria-hidden="true"><path d="M26.6986 13.7058V22.0678H5.24023V13.7058" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5.14551 14.0937L9.76053 6.1003" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></path><path d="M26.7983 14.0937L22.1833 6.1003" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5.26074 14.0974H22.1887M26.7985 14.0974H21.4141" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9.32764 6.18579H22.6211" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9.76074 11.5291H22.022" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></path><path d="M11.0137 9.0127H20.9253" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    if (accepted) swatch.setAttribute('aria-label', t('Farbe'));
    const label = el('span', 'wish-title', list.title || (invited ? 'Liste' : ''));
    label.style.color = color;
    cell.append(swatch, label);
    if (phoneSheet()) watchWishTitle(label);
    if (!accepted) return cell;
    label.addEventListener('click', (event) => {
      event.stopPropagation();
      if (cell.classList.contains('is-hue')) return;
      beginWishRename(label, list);
    });
    const scale = el('div', 'wish-hue');
    const bar = el('div', 'wish-hue-bar');
    const grip = el('span', 'wish-hue-grip');
    bar.append(grip);
    scale.append(bar);
    cell.append(scale);
    const place = (hex) => {
      swatch.style.color = hex;
      label.style.color = hex;
      grip.style.left = `${(wishHue(hex) / 360) * 100}%`;
    };
    place(color);
    const at = (event) => {
      const box = bar.getBoundingClientRect();
      const width = box.width || 1;
      const x = Math.min(Math.max(event.clientX - box.left, 0), width);
      const hue = (x / width) * 360;
      return wishHex(hue >= 360 ? 0 : hue, 100, 50);
    };
    let dragging = false;
    swatch.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (cell.classList.contains('is-hue')) {
        closeWishHue();
        return;
      }
      document.querySelectorAll('.genre-name.is-hue').forEach((node) => {
        if (node !== cell) node.classList.remove('is-hue');
      });
      cell.classList.add('is-hue');
      place(list.color || color);
      openTransient(cell, () => cell.classList.remove('is-hue'));
    });
    bar.addEventListener('pointerdown', (event) => {
      if (!cell.classList.contains('is-hue')) return;
      event.stopPropagation();
      dragging = true;
      bar.setPointerCapture(event.pointerId);
      const hex = at(event);
      list.color = hex;
      place(hex);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const hex = at(event);
      list.color = hex;
      place(hex);
    });
    const release = async (event) => {
      if (!dragging) return;
      dragging = false;
      const hex = at(event);
      list.color = hex;
      place(hex);
      try { await globalThis.Cloud.setWishlistColor(list.id, hex); } catch { /* Anzeige bleibt */ }
    };
    bar.addEventListener('pointerup', release);
    bar.addEventListener('pointercancel', release);
    return cell;
  }

  // Vollbild-Editor: mit Wischen (oder Scrollen) durch die Farbverläufe der Kugel, auch Zwischenzustände wählbar
  function openSphereEditor(fromNode, onPick) {
    if (!globalThis.GateSky || !globalThis.SphereColours || document.querySelector('.sphere-editor')) return false;
    const root = document.documentElement;
    const layer = el('div', 'sphere-editor');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-label', t('Sphere colours'));
    const canvas = document.createElement('canvas');
    canvas.className = 'sphere-editor-sky';
    canvas.setAttribute('aria-hidden', 'true');
    const bar = el('div', 'sphere-editor-bar');
    const cancel = el('button', 'sphere-editor-cancel');
    cancel.type = 'button';
    cancel.setAttribute('aria-label', t('Cancel'));
    cancel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    const save = el('button', 'sphere-editor-save');
    save.type = 'button';
    save.setAttribute('aria-label', t('Use these colours'));
    save.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="5.5 12.5 10 17 18.5 7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    bar.append(cancel, save);
    const touch = window.matchMedia('(hover: none)').matches;
    const hint = el('p', 'sphere-editor-hint', touch ? 'Swipe up or down to blend colours' : 'Scroll or drag to blend colours');
    layer.append(canvas, bar, hint);
    document.body.append(layer);
    const target = () => {
      const node = fromNode && fromNode.isConnected ? fromNode.querySelector('.avatar') : null;
      if (!node) return null;
      const box = node.getBoundingClientRect();
      if (!box.width) return null;
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, r: box.width / 2 };
    };
    const start = globalThis.SphereColours.avatarToWave(avatarColors(account && account.avatar));
    const editor = globalThis.GateSky.editor(canvas, { start, target });
    if (!editor) {
      layer.remove();
      return false;
    }
    root.classList.add('is-sphere-editing');
    requestAnimationFrame(() => layer.classList.add('is-open'));
    editor.start(target());
    let busy = false;
    const finish = () => {
      layer.classList.remove('is-open');
      window.setTimeout(() => {
        editor.stop();
        layer.remove();
        root.classList.remove('is-sphere-editing');
      }, 280);
      document.removeEventListener('keydown', onKey, true);
    };
    const doSave = () => {
      if (busy) return;
      busy = true;
      editor.save((wave) => {
        onPick(wave);
        finish();
      });
    };
    const doCancel = () => {
      if (busy) return;
      busy = true;
      editor.cancel(() => finish());
    };
    save.addEventListener('click', doSave);
    cancel.addEventListener('click', doCancel);
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        doCancel();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        doSave();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        editor.vel = 0;
        editor.drag(event.key === 'ArrowUp' ? 0.25 : -0.25);
      }
    };
    document.addEventListener('keydown', onKey, true);
    // Wischen: eine Bildschirmhöhe von ca. 45 % entspricht einem ganzen Farbverlauf
    let drag = null;
    const span = () => Math.max(240, window.innerHeight * 0.45);
    layer.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      drag = { id: event.pointerId, y: event.clientY, t: performance.now(), samples: [] };
      editor.dragging = true;
      editor.vel = 0;
      try { layer.setPointerCapture(event.pointerId); } catch { /* ohne Capture */ }
    });
    layer.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const now = performance.now();
      const dy = event.clientY - drag.y;
      drag.y = event.clientY;
      const delta = -dy / span();
      editor.drag(delta);
      drag.samples.push({ t: now, d: delta });
      while (drag.samples.length && now - drag.samples[0].t > 120) drag.samples.shift();
      if (editor.moved) hint.classList.add('is-gone');
    });
    const release = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const samples = drag.samples;
      drag = null;
      editor.dragging = false;
      if (samples.length > 1) {
        const time = (samples[samples.length - 1].t - samples[0].t) / 1000;
        const dist = samples.reduce((sum, row) => sum + row.d, 0);
        if (time > 0.01) editor.vel = Math.max(-4, Math.min(4, dist / time));
      }
    };
    layer.addEventListener('pointerup', release);
    layer.addEventListener('pointercancel', release);
    layer.addEventListener('wheel', (event) => {
      event.preventDefault();
      editor.vel = 0;
      editor.drag(event.deltaY / 900);
      if (editor.moved) hint.classList.add('is-gone');
    }, { passive: false });
    return true;
  }

  function paintOwnAvatar(size) {
    const wrap = el('div', 'profile-avatar');
    const draw = (avatar) => {
      const roll = wrap.querySelector('.avatar-roll');
      const status = wrap.querySelector('.avatar-note');
      wrap.replaceChildren(avatarNode(avatar, size));
      if (roll) wrap.append(roll);
      if (status) wrap.append(status);
    };
    const roll = document.createElement('button');
    roll.type = 'button';
    roll.className = 'avatar-roll';
    roll.setAttribute('aria-label', t('Profilbild neu würfeln'));
    roll.append(dangerIcon('reset'));
    draw(account && account.avatar);
    wrap.append(roll);
    const note = el('p', 'avatar-note', '');
    note.setAttribute('role', 'status');
    wrap.append(note);
    let dirty = false;
    let timer = 0;
    let saving = false;
    let generation = 0;
    let tries = 0;
    const phone = window.matchMedia('(hover: none), (max-width: 720px)').matches;
    const showNote = (message) => {
      note.textContent = t(message || '');
    };
    const commit = async () => {
      window.clearTimeout(timer);
      timer = 0;
      if (saving || !dirty || !account || !account.avatar) return;
      const cloud = globalThis.Cloud;
      if (!cloud || !cloud.saveAvatar) return;
      const stamp = generation;
      const avatar = account.avatar;
      saving = true;
      try {
        const saved = await cloud.saveAvatar(avatar);
        if (stamp !== generation) return;
        spreadAvatar(saved);
        writeAvatarCache(account.id, saved);
        dirty = false;
        tries = 0;
        wrap.classList.remove('is-dirty');
        showNote('');
        draw(saved);
      } catch (error) {
        if (stamp !== generation) return;
        tries += 1;
        const info = error || {};
        console.error('[avatar]', info, info.message, info.code, info.details, info.hint);
        const text = String(info.message || '');
        const rights = info.code === '42501'
          || /keine zeile aktualisiert|permission denied|row-level security|rls\/policy/i.test(text);
        showNote(profileFail(error) === 'Keine Verbindung.'
          ? 'Keine Verbindung.'
          : rights
            ? 'Profilbild: keine Berechtigung. Schema neu ausführen.'
            : 'Das Profilbild wurde nicht gespeichert.');
        if (tries < 3) timer = window.setTimeout(commit, 700);
      } finally {
        saving = false;
        if (stamp !== generation && dirty) commit();
      }
    };
    wrap._commitAvatar = commit;
    // Farben aus dem Kugel-Editor übernehmen (Form der Kugel bleibt, nur die Farben ändern sich)
    const pick = (wave) => {
      if (!account || !globalThis.SphereColours) return;
      generation += 1;
      tries = 0;
      account.avatar = globalThis.SphereColours.waveToAvatar(wave, account.avatar && account.avatar.seed);
      dirty = true;
      wrap.classList.add('is-dirty');
      showNote('');
      draw(account.avatar);
      spreadAvatar(account.avatar);
      commit();
    };
    const edit = () => {
      wrap.classList.remove('is-armed');
      endTransient(wrap);
      return openSphereEditor(wrap, pick);
    };
    roll.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (edit()) return;
      const cloud = globalThis.Cloud;
      if (!cloud || !cloud.rollAvatar || !account) return;
      generation += 1;
      tries = 0;
      account.avatar = cloud.rollAvatar();
      dirty = true;
      wrap.classList.add('is-dirty');
      showNote('');
      draw(account.avatar);
      spreadAvatar(account.avatar);
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 2000);
    });
    const armAvatar = () => {
      wrap.classList.add('is-armed');
      openTransient(wrap, () => {
        wrap.classList.remove('is-armed');
        commit();
      });
    };
    wrap.addEventListener('click', (event) => {
      if (event.target.closest('.avatar-roll')) return;
      if (phone && !wrap.classList.contains('is-armed')) {
        armAvatar();
        return;
      }
      // zweites Antippen (Handy) bzw. Klick (Desktop): Editor öffnen
      edit();
    });
    roll.addEventListener('pointerdown', () => {
      if (!phone) armAvatar();
    });
    wrap.addEventListener('mouseleave', () => {
      if (phone) return;
      wrap.classList.remove('is-armed');
      commit();
    });
    return wrap;
  }

  function wishCountLabel(count) {
    return String(Number(count) || 0);
  }

  function canDropWishFilm(list, item) {
    if (!account || !item) return false;
    if (list && list.role === 'owner') return true;
    return item.addedBy === account.id;
  }

  function showWishUndo(payload) {
    let bar = document.getElementById('wish-undo');
    if (!bar) {
      bar = el('div', 'wish-undo');
      bar.id = 'wish-undo';
      document.body.append(bar);
    }
    bar.replaceChildren(document.createTextNode('Entfernt · '));
    const undo = el('button', null, 'Rückgängig');
    undo.type = 'button';
    undo.addEventListener('click', async () => {
      window.clearTimeout(wishUndoTimer);
      bar.hidden = true;
      const film = payload.film;
      if (film) film.fromCatalog = true;
      await addFilmToList(payload.listId, film, payload.facets);
    });
    bar.append(undo);
    bar.hidden = false;
    window.clearTimeout(wishUndoTimer);
    wishUndoTimer = window.setTimeout(() => {
      bar.hidden = true;
    }, 4000);
  }

  function wishDrop(item, list, film) {
    const control = el('span', 'wish-drop');
    control.setAttribute('role', 'button');
    control.setAttribute('aria-label', t('Aus der Liste entfernen'));
    control.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      item._posterFilm = film;
      removeWishItem(item, list);
    });
    return control;
  }

  function schedulePosterFill(items) {
    (items || []).forEach((item) => {
      const row = item.film;
      const id = (row && row.id) || item.filmId;
      if (!id || posterFilled.has(id)) return;
      const have = (row && (row.poster || (row.facets && row.facets.poster))) || posters.get(id);
      if (have) {
        if (!posters.get(id)) posters.set(id, have);
        return;
      }
      const ref = String(id).match(/^tmdb[:\-](movie|tv)[:\-](\d+)$/);
      if (!ref || !globalThis.Cloud || !globalThis.Cloud.upsertFilm) return;
      posterFilled.add(id);
      fetch(`/api/film?q=${encodeURIComponent(`https://www.themoviedb.org/${ref[1]}/${ref[2]}`)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then(async (data) => {
          if (!data || !data.film) return;
          const film = withCanonicalId(data.film, data.facets || {});
          const payload = filmCatalogPayload(film, data.facets || {});
          if (!payload.poster) return;
          await globalThis.Cloud.upsertFilm(payload);
          posters.set(payload.id, payload.poster);
          const image = document.querySelector(`#wish-board [data-id="${CSS.escape(payload.id)}"] img`);
          if (image) image.src = posterSrc({ id: payload.id, title: payload.title, poster: payload.poster });
        })
        .catch(() => {});
    });
  }

  function posterSrcMatches(image, next) {
    if (!image || !next) return false;
    const raw = image.getAttribute('src') || '';
    if (!raw) return false;
    if (raw === next) return true;
    try {
      return new URL(raw, location.href).href === new URL(next, location.href).href;
    } catch {
      return false;
    }
  }

  function paintWishCover(button, film) {
    const poster = knownPoster(film);
    const image = button.querySelector('img');
    let title = button.querySelector('.poster-title');
    if (poster) {
      button.classList.remove('is-blank');
      button.style.removeProperty('--blank');
      if (image) {
        image.hidden = false;
        if (!posterSrcMatches(image, poster)) image.src = poster;
      }
      if (title) title.remove();
    } else {
      button.classList.add('is-blank');
      button.style.setProperty('--blank', `hsl(${posterHue(film.id)} 25% 14%)`);
      if (image) image.hidden = true;
      const caption = film.title || t('Movie');
      if (!title) {
        title = el('span', 'poster-title', caption);
        button.append(title);
      } else if (title.textContent !== caption) title.textContent = caption;
    }
    let stamp = button.querySelector('.wish-when');
    const label = releaseStamp(film);
    if (!label) {
      if (stamp) stamp.remove();
    } else if (!stamp) {
      button.append(el('span', 'wish-when', label));
    } else if (stamp.textContent !== label) stamp.textContent = label;
  }

  function wishPoster(film, rating) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster';
    button.dataset.id = film.id;
    button.classList.toggle('is-rated', rating != null);
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    const tint = document.createElement('span');
    tint.className = 'tint';
    tint.style.background = rating == null ? '' : coverTint(rating);
    const score = document.createElement('span');
    score.className = 'poster-score';
    score.textContent = rating == null ? '' : `★  ${Number(rating).toFixed(1).replace('.', ',')}`;
    button.append(image, tint, score);
    paintWishCover(button, film);
    paintWear(button, rating);
    return button;
  }

  function bestCustomMatch(film, rows) {
    const title = String(film.title || '').trim().toLocaleLowerCase('de');
    const year = String(film.year || '').slice(0, 4);
    const wantYear = /^\d{4}$/.test(year);
    let best = null;
    let bestRank = 0;
    (rows || []).forEach((row) => {
      const other = row && row.film;
      if (!other || !other.title) return;
      const name = String(other.title).trim().toLocaleLowerCase('de');
      const otherYear = String(other.release_date || other.year || '').slice(0, 4);
      if (wantYear && otherYear !== year) return;
      let rank = 0;
      if (name === title) rank = 2;
      else if (title && (name.includes(title) || title.includes(name))) rank = 1;
      if (rank > bestRank) {
        best = row;
        bestRank = rank;
      }
    });
    return best;
  }

  async function linkCustomFilm(film, match, button) {
    if (!globalThis.Cloud || !globalThis.Cloud.replaceCustomFilm) return;
    button.disabled = true;
    try {
      const resolved = await completeWishHit({
        film: { ...match.film, fromCatalog: false },
        facets: match.facets || null,
        source: 'tmdb',
      });
      const next = resolved.film || match.film;
      next.release_date = next.release_date || match.film.release_date || null;
      next.status = next.status || match.film.status || null;
      next.checked_at = new Date().toISOString();
      const payload = filmCatalogPayload(next, resolved.facets || match.facets || null);
      await globalThis.Cloud.replaceCustomFilm(film.id, payload);
      if (payload.poster) posters.set(payload.id, payload.poster);
      await loadWishlists({ quiet: true });
      if (mode === 'wish') await paintWishBoard();
      openFilm(withCanonicalId({ ...next, id: payload.id }, resolved.facets || null));
    } catch (error) {
      button.disabled = false;
      button.textContent = t(wishFail(error));
    }
  }

  function suggestCustomLink(film) {
    const title = String(film && film.title || '').trim();
    if (title.length < 2) return;
    fetch(`/api/film?q=${encodeURIComponent(title)}&list=1&upcoming=1`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!panelFilm || panelFilm.id !== film.id || panel.hidden) return;
        const match = bestCustomMatch(film, data && data.films);
        if (!match || !match.film) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-line';
        button.textContent = t('Found on TMDB: {title} – link it', { title: match.film.title });
        button.addEventListener('click', () => linkCustomFilm(film, match, button));
        const line = el('p', 'custom-link');
        line.append(button);
        const note = panel.querySelector('.release-note');
        if (note) note.before(line);
        else panelScroller().append(line);
      })
      .catch(() => {});
  }

  async function pullUpcomingFilm(film) {
    const ref = String(film.id || '').match(/^tmdb:(movie|tv):(\d+)$/);
    if (!ref || !globalThis.Cloud || !globalThis.Cloud.upsertFilm) return;
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(`https://www.themoviedb.org/${ref[1]}/${ref[2]}`)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.film) return;
      const next = withCanonicalId(data.film, data.facets || {});
      next.release_date = data.film.release_date || null;
      next.status = data.film.status || null;
      next.checked_at = new Date().toISOString();
      if (!next.poster && film.poster) next.poster = film.poster;
      const payload = filmCatalogPayload(next, data.facets || {});
      if (!payload.poster && film.poster) payload.poster = film.poster;
      await globalThis.Cloud.upsertFilm(payload);
      const shown = {
        ...next,
        id: film.id,
        title: payload.title,
        poster: payload.poster || '',
        release_date: payload.release_date,
        status: payload.status,
        checked_at: payload.checked_at,
        year: payload.year || next.year || '',
      };
      if (payload.poster) posters.set(film.id, payload.poster);
      document.querySelectorAll(`#wish-board [data-id="${CSS.escape(film.id)}"]`).forEach((button) => {
        if (!button.classList.contains('poster')) return;
        paintWishCover(button, shown);
      });
    } catch {
      /* der nächste Film bleibt dran */
    }
  }

  function refreshUpcomingFilms(films, token) {
    const queue = [];
    const seen = new Set();
    (films || []).forEach((film) => {
      if (!film || !film.id || seen.has(film.id) || isCustomFilm(film)) return;
      if (!/^tmdb:(movie|tv):\d+$/.test(film.id) || !isUpcomingFilm(film)) return;
      const checked = Date.parse(film.checked_at || '');
      if (Number.isFinite(checked) && Date.now() - checked < 24 * 60 * 60 * 1000) return;
      seen.add(film.id);
      queue.push(film);
    });
    let chain = Promise.resolve();
    queue.forEach((film) => {
      chain = chain.then(() => {
        if (token !== wishBoardToken) return null;
        return pullUpcomingFilm(film);
      });
    });
    return chain;
  }

  function openListedFilm(film, list) {
    panelList = list || null;
    panelListHold = true;
    openFilm(film);
  }

  function wishPlusTile(onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster wish-plus';
    button.setAttribute('aria-label', t('Add a movie'));
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"></path></svg>';
    button.addEventListener('click', onClick);
    return button;
  }

  function focusWishName(input) {
    if (!input) return;
    input.focus();
    const cell = input.closest('.genre-name');
    if (!cell) return;
    cell.classList.add('is-hot');
    window.setTimeout(() => cell.classList.remove('is-hot'), 700);
  }

  function wishPersonLabel(person) {
    const invited = person.status === 'invited';
    const name = account && person.id === account.id
      ? (account.username || person.username || 'Profil')
      : (person.username || 'Profil');
    return invited ? t('{name} (invited)', { name }) : name;
  }

  function wishPersonNode(person) {
    const node = el('span', person.status === 'invited' ? 'wish-person is-invited' : 'wish-person');
    node.dataset.id = person.id || '';
    const avatar = account && person.id === account.id ? (account.avatar || person.avatar) : person.avatar;
    const size = window.matchMedia('(max-width: 720px)').matches ? 18 : 22;
    node.append(avatarNode(avatar, size), el('span', 'wish-person-name', wishPersonLabel(person)));
    return node;
  }

  function fitWishNames(host) {
    if (!host || !host.isConnected || host.clientWidth < 8) return;
    const people = [...host.querySelectorAll('.wish-person')];
    const previous = host.querySelector('.wish-more');
    if (previous) previous.remove();
    people.forEach((node) => { node.hidden = false; });
    if (!people.length || host.scrollWidth <= host.clientWidth + 1) return;
    const more = el('span', 'wish-more', '');
    host.append(more);
    let hidden = 0;
    for (let index = people.length - 1; index >= 0; index -= 1) {
      hidden += 1;
      people[index].hidden = true;
      more.textContent = `+${hidden}`;
      if (host.scrollWidth <= host.clientWidth + 1) return;
    }
  }

  function bindWishNameFit(host) {
    const run = () => fitWishNames(host);
    requestAnimationFrame(run);
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(() => {
        if (host.isConnected) fitWishNames(host);
      }).catch(() => {});
    }
    if (typeof ResizeObserver !== 'function') return;
    if (host._wishFit) host._wishFit.disconnect();
    host._wishFit = new ResizeObserver(() => fitWishNames(host));
    host._wishFit.observe(host);
  }

  function fillWishNames(host, list) {
    host.replaceChildren();
    (list.members || []).forEach((person) => host.append(wishPersonNode(person)));
    bindWishNameFit(host);
  }

  function beginWishRename(label, list) {
    if (!list || list.myStatus !== 'accepted' || !label || label.querySelector('input')) return;
    const current = list.title || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'wish-name';
    input.value = current;
    input.placeholder = t('Name :');
    input.setAttribute('aria-label', t('Name'));
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.color = list.color || '';
    label.replaceChildren(input);
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    let closed = false;
    const restore = (text) => {
      if (closed) return;
      closed = true;
      label.replaceChildren(document.createTextNode(text));
    };
    openTransient(input, () => restore(current));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        input.blur();
      }
    });
    input.addEventListener('blur', async () => {
      if (closed) return;
      endTransient(input);
      const next = input.value.trim();
      if (!next || next === current) {
        restore(current);
        return;
      }
      closed = true;
      label.replaceChildren(document.createTextNode(next));
      try {
        await globalThis.Cloud.renameWishlist(list.id, next);
        list.title = next;
      } catch {
        list.title = current;
        if (label.isConnected) label.replaceChildren(document.createTextNode(current));
      }
    });
  }

  function resetWishMemberLine(cell) {
    const host = cell || document.querySelector('.wish-by.is-inviting');
    if (!host) return false;
    host.classList.remove('is-inviting');
    const input = host.querySelector('.wish-member-input');
    const pop = host.querySelector('.wish-member-hits');
    if (input) input.remove();
    if (pop) pop.remove();
    const names = host.querySelector('.wish-by-names');
    if (names) names.hidden = false;
    return true;
  }

  function closeWishMemberLine(cell) {
    const host = cell || (transient && transient.element && transient.element.classList.contains('is-inviting')
      ? transient.element
      : document.querySelector('.wish-by.is-inviting'));
    if (transient && host && transient.element === host) return closeTransient();
    return resetWishMemberLine(host);
  }

  function wishFriendChoices(list, query) {
    const have = new Set((list.members || []).map((person) => person.id));
    const needle = String(query || '').trim().toLocaleLowerCase('de');
    return mutualPeople().filter((person) => {
      if (!person.id || have.has(person.id)) return false;
      if (!needle) return true;
      const username = String(person.username || '').toLocaleLowerCase('de');
      const name = String(person.name || '').toLocaleLowerCase('de');
      return username.includes(needle) || name.includes(needle);
    }).slice(0, 6);
  }

  function openWishMemberLine(cell, list) {
    if (cell.classList.contains('is-inviting')) return;
    cell.classList.add('is-inviting');
    const names = cell.querySelector('.wish-by-names');
    if (names) names.hidden = true;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'wish-member-input';
    input.setAttribute('aria-label', t('Freund einladen'));
    input.autocomplete = 'off';
    input.spellcheck = false;
    const pop = el('div', 'wish-member-hits');
    let cursor = 0;
    let choices = [];
    const paintChoices = () => {
      choices = wishFriendChoices(list, input.value);
      cursor = Math.max(0, Math.min(cursor, Math.max(choices.length - 1, 0)));
      pop.replaceChildren();
      choices.forEach((person, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wish-member-hit';
        if (index === cursor) button.classList.add('is-current');
        button.append(avatarNode(person.avatar, 28), el('span', null, person.name || person.username || 'Profil'));
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          sendWishInvite(person);
        });
        pop.append(button);
      });
    };
    const sendWishInvite = async (person) => {
      if (!person || !person.id) return;
      input.disabled = true;
      try {
        await globalThis.Cloud.addWishlistMember(list.id, person.id);
        closeWishMemberLine(cell);
        await loadWishlists();
      } catch {
        input.disabled = false;
      }
    };
    input.addEventListener('input', () => {
      cursor = 0;
      paintChoices();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!choices.length) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        cursor = Math.max(0, Math.min(choices.length - 1, cursor + step));
        paintChoices();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeWishMemberLine(cell);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      if (choices[cursor]) sendWishInvite(choices[cursor]);
    });
    cell.append(input, pop);
    paintChoices();
    input.focus();
    openTransient(cell, () => resetWishMemberLine(cell));
  }

  function wishMemberPlus(list, cell) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wish-add-member';
    button.setAttribute('aria-label', t('Mitglied einladen'));
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (cell.classList.contains('is-inviting')) closeWishMemberLine(cell);
      else openWishMemberLine(cell, list);
    });
    return button;
  }

  function wishRemoveButton(list, bar) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wish-x';
    button.setAttribute('aria-label', t('Liste entfernen'));
    const sure = el('span', 'wish-sure', 'sure?');
    button.append(sure);
    button.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>');
    let timer = 0;
    const calmSure = () => {
      window.clearTimeout(timer);
      bar.classList.remove('is-sure');
    };
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (event.target.closest('.wish-sure')) {
        endTransient(button);
        calmSure();
        return;
      }
      if (!bar.classList.contains('is-sure')) {
        bar.classList.add('is-sure');
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          endTransient(button);
          calmSure();
        }, 4000);
        openTransient(button, calmSure);
        return;
      }
      endTransient(button);
      window.clearTimeout(timer);
      button.disabled = true;
      try {
        await globalThis.Cloud.leaveOrDeleteWishlist(list.id);
        await loadWishlists();
      } catch {
        button.disabled = false;
        bar.classList.remove('is-sure');
      }
    });
    return button;
  }

  function paintWishInvites(board) {
    wishLists.filter((list) => list.myStatus === 'invited').forEach((list) => {
      if (board.querySelector(`.wish-invite[data-list="${CSS.escape(list.id)}"]`)) return;
      const owner = (list.members || []).find((person) => person.role === 'owner') || {};
      const row = el('div', 'wish-invite');
      row.dataset.list = list.id;
      const text = el('p', null, t('{name} invites you to «{list}»', { name: owner.username || t('Someone'), list: list.title || t('List') }));
      const yes = lineButton('Ja');
      const no = lineButton('Nein');
      const lock = () => {
        yes.disabled = true;
        no.disabled = true;
      };
      const unlock = () => {
        yes.disabled = false;
        no.disabled = false;
      };
      yes.addEventListener('click', async () => {
        lock();
        try {
          await globalThis.Cloud.acceptWishlist(list.id);
          await loadWishlists();
        } catch {
          unlock();
        }
      });
      no.addEventListener('click', async () => {
        lock();
        try {
          await globalThis.Cloud.leaveWishlist(list.id);
          await loadWishlists();
        } catch {
          unlock();
        }
      });
      row.append(avatarNode(owner.avatar, 32), text, yes, no);
      board.append(row);
    });
  }

  function paintWishDraft(board) {
    const bar = el('div', 'genre-bar wish-draft');
    const nameCell = el('label', 'genre-name');
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'wish-name';
    name.placeholder = t('Name :');
    name.setAttribute('aria-label', t('Name'));
    name.autocomplete = 'off';
    name.spellcheck = false;
    nameCell.append(name);
    bar.append(nameCell, el('span', 'genre-count', 'creator :'), el('span', 'genre-score', 'Movies :'));
    const grid = el('div', 'wish-grid');
    grid.dataset.list = 'draft';
    let pending = null;
    const commit = () => {
      const title = name.value.trim();
      if (!title) return Promise.resolve(null);
      if (pending) return pending;
      pending = (async () => {
        try {
          const id = await globalThis.Cloud.createWishlist(title, []);
          await loadWishlists({ quiet: true });
          return id;
        } catch (error) {
          name.disabled = false;
          pending = null;
          const note = bar.querySelector('.genre-count');
          if (note) note.textContent = t(wishFail(error));
          return null;
        }
      })();
      name.disabled = true;
      return pending;
    };
    let commitTimer = 0;
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        name.value = '';
        name.blur();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      window.clearTimeout(commitTimer);
      commit().then((id) => {
        if (!id || mode !== 'wish') return;
        paintWishBoard({ focusDraft: true });
      });
    });
    name.addEventListener('blur', () => {
      if (pending || !name.value.trim()) return;
      commitTimer = window.setTimeout(() => {
        commit().then((id) => {
          if (!id || mode !== 'wish') return;
          paintWishBoard();
        });
      }, 180);
    });
    const plus = wishPlusTile(() => {
      window.clearTimeout(commitTimer);
      if (!name.value.trim()) {
        focusWishName(name);
        return;
      }
      commit().then(async (id) => {
        if (!id) return;
        if (mode === 'wish') await paintWishBoard();
        const list = wishLists.find((item) => item.id === id);
        if (list) openWishSearch(list);
      });
    });
    grid.append(plus);
    board.append(bar, grid);
  }

  function openWishSearch(list) {
    if (!list || !list.id) return;
    wishSearchList = list;
    panelFilm = null;
    selectedId = null;
    links = [];
    activeLinkId = null;
    document.body.classList.remove('has-selection');
    document.body.classList.add('is-wish-search');
    renderWishSearch();
    paint();
  }

  function currentWishSearchList() {
    if (!wishSearchList) return null;
    return wishLists.find((list) => list.id === wishSearchList.id) || wishSearchList;
  }

  function wishOnList(list, filmId) {
    return Boolean(list && (list.stamps || []).some((stamp) => stamp.filmId === filmId));
  }

  function markWishFilm(id) {
    wishMarkedId = id;
    window.setTimeout(() => {
      if (wishMarkedId === id) wishMarkedId = null;
      const node = document.querySelector(`#wish-board [data-id="${CSS.escape(id)}"]`);
      if (node) node.classList.remove('is-fresh');
    }, 1600);
  }

  function showWishPosterNow(list, film) {
    const grid = document.querySelector(`#wish-board .wish-grid[data-list="${CSS.escape(list.id)}"]`);
    if (!grid || grid.querySelector(`[data-id="${CSS.escape(film.id)}"]`)) return false;
    const poster = wishPoster(film, null);
    poster.classList.add('is-fresh');
    poster.classList.remove('is-rated');
    poster._wishFilm = film;
    bindWishPoster(poster, list);
    const plus = grid.querySelector('.wish-plus');
    if (plus) plus.after(poster);
    else grid.append(poster);
    return true;
  }

  async function completeWishHit(row) {
    if (!row || row.source !== 'tmdb') return row;
    const facets = row.facets || {};
    const kind = facets.tmdbType === 'tv' ? 'tv' : 'movie';
    const id = facets.tmdbId;
    if (!id) return row;
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(`https://www.themoviedb.org/${kind}/${id}`)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.film) return row;
      const film = withCanonicalId(data.film, data.facets || {});
      const poster = film.poster || (row.film && row.film.poster) || (data.facets && data.facets.poster) || (row.facets && row.facets.poster) || '';
      if (poster) {
        film.poster = poster;
        if (data.facets && !data.facets.poster) data.facets.poster = poster;
      }
      film.release_date = data.film.release_date || (row.film && row.film.release_date) || null;
      film.status = data.film.status || (row.film && row.film.status) || null;
      film.checked_at = new Date().toISOString();
      return { ...row, film: { ...film, fromCatalog: false }, facets: data.facets || null, fromCatalog: false };
    } catch {
      return row;
    }
  }

  function loadUpcomingFeed() {
    if (upcomingFeedPool) return upcomingFeedPool;
    upcomingFeedPool = fetch('/api/film?upcoming=1&feed=1')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const films = data && Array.isArray(data.films) ? data.films : [];
        const rows = films.filter((item) => item && item.film && item.film.title).map((item) => ({
          film: { ...item.film, fromCatalog: false },
          facets: item.facets || null,
          source: 'tmdb',
          fromUpcoming: true,
        }));
        if (!rows.length) upcomingFeedPool = null;
        return rows;
      })
      .catch(() => {
        upcomingFeedPool = null;
        return [];
      });
    return upcomingFeedPool;
  }

  function keepWishPlusVisible() {
    if (!phoneSheet()) return;
    const live = currentWishSearchList();
    if (!live) return;
    const plus = document.querySelector(`#wish-board .wish-grid[data-list="${CSS.escape(live.id)}"] .wish-plus`);
    if (!plus) return;
    const rect = plus.getBoundingClientRect();
    const top = 106;
    const bottom = window.innerHeight - (panel.offsetHeight || window.innerHeight * 0.58) - 12;
    let delta = 0;
    if (rect.bottom > bottom) delta = rect.bottom - bottom;
    else if (rect.top < top) delta = rect.top - top;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'smooth' });
  }

  function fitWishSheet() {
    const active = phoneSheet() && document.body.classList.contains('is-wish-search') && !panel.hidden;
    const view = window.visualViewport;
    if (!active || !view) {
      panel.style.bottom = '';
      panel.style.maxHeight = '';
      return;
    }
    const keyboard = Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop));
    panel.style.bottom = keyboard > 40 ? `${keyboard}px` : '';
    panel.style.maxHeight = keyboard > 40 ? `${Math.max(180, Math.round(view.height - 72))}px` : '';
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitWishSheet);
    window.visualViewport.addEventListener('scroll', fitWishSheet);
  }

  document.addEventListener('click', (event) => {
    if (!phoneSheet() || panel.hidden || !document.body.classList.contains('is-wish-search')) return;
    const target = event.target;
    if (!(target instanceof Element) || panel.contains(target)) return;
    if (target.closest('header, .wish-plus')) return;
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
  }, true);

  function renderWishSearch() {
    const list = currentWishSearchList();
    if (!list) return;
    clearGenreFit();
    panel.replaceChildren();
    const box = el('div', 'wish-find');
    const bar = el('div', 'wish-add-bar panel-bar');
    const closeIcon = el('button', 'panel-close');
    closeIcon.type = 'button';
    closeIcon.setAttribute('aria-label', t('Close'));
    closeIcon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    closeIcon.addEventListener('click', clearSelection);
    bar.append(el('span', 'panel-grab'), closeIcon);
    box.append(bar);

    const plusMark = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
    const taken = new Set();

    const makeSection = (label) => {
      const section = el('section', 'wish-add');
      const left = el('div', 'wish-add-left');
      const line = el('div', 'wish-add-line');
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', label);
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.enterKeyHint = 'done';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'wish-add-go';
      go.setAttribute('aria-label', t('Add'));
      go.innerHTML = plusMark;
      line.append(input, go);
      const note = el('p', 'wish-add-note');
      const extra = el('div', 'wish-add-extra');
      left.append(el('h2', 'wish-add-title', label), line, note, extra);
      const covers = el('div', 'wish-add-covers');
      section.append(left, covers);
      box.append(section);
      return {
        input, go, note, extra, covers,
        pool: [], cursor: 0, query: '', token: 0, message: '', nodes: new Map(),
      };
    };

    const upcoming = makeSection('Upcoming');
    const released = makeSection('Released titles');
    panel.append(box);
    unlockPanelScroll();
    revealPanel();
    window.requestAnimationFrame(() => {
      fitWishSheet();
      keepWishPlusVisible();
      window.setTimeout(keepWishPlusVisible, 280);
    });

    const keyOf = (row) => {
      if (!row._key) {
        const canonical = withCanonicalId({ ...row.film }, row.facets || {});
        row._key = (canonical && canonical.id) || row.film.id;
      }
      return row._key;
    };

    const visible = (state) => {
      const live = currentWishSearchList();
      return state.pool.filter((row) => {
        if (!row || !row.film) return false;
        const key = keyOf(row);
        return !taken.has(row.film.id) && !taken.has(key)
          && !wishOnList(live, row.film.id) && !wishOnList(live, key);
      }).slice(0, 3);
    };

    const coverLabel = (row) => {
      const film = row.film;
      const when = row.fromUpcoming ? releaseStamp(film) : '';
      const year = film.year ? ` (${film.year})` : '';
      return `${film.title || t('Movie')}${when ? ` · ${when}` : year}`;
    };

    const coverNode = (state, row) => {
      const known = state.nodes.get(row.film.id);
      if (known) return known;
      const film = row.film;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'wish-add-cover is-entering';
      const stamp = row.fromUpcoming ? releaseStamp(film) : '';
      const label = coverLabel(row);
      node.title = label;
      node.setAttribute('aria-label', t('Add {label}', { label }));
      const src = knownPoster(film);
      if (src) {
        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = src;
        node.append(image);
      } else {
        node.classList.add('is-blank');
        node.append(el('span', 'wish-add-blank', film.title || t('Movie')));
      }
      if (stamp) node.append(el('span', 'wish-when', stamp));
      const plus = el('span', 'wish-add-plus');
      plus.innerHTML = plusMark;
      node.append(plus);
      node.addEventListener('animationend', () => node.classList.remove('is-entering'));
      node.addEventListener('click', () => take(state, row));
      state.nodes.set(film.id, node);
      return node;
    };

    const paintCovers = (state) => {
      const shown = visible(state);
      if (state.cursor >= shown.length) state.cursor = Math.max(0, shown.length - 1);
      const nodes = shown.map((row, index) => {
        const node = coverNode(state, row);
        node.classList.toggle('is-current', index === state.cursor);
        node.classList.remove('is-leaving');
        return node;
      });
      state.covers.replaceChildren(...nodes);
      const current = shown[state.cursor];
      if (current) state.note.textContent = coverLabel(current);
      else state.note.textContent = t(state.message || '');
      state.go.disabled = !current && !(state === upcoming && state.query.length >= 2 && state.message);
      return shown;
    };

    const setPool = (state, rows, message) => {
      state.pool = rows || [];
      state.cursor = 0;
      state.message = message || '';
      state.nodes = new Map();
      paintCovers(state);
    };

    const addRow = async (row) => {
      const live = currentWishSearchList();
      if (!live || !row || wishOnList(live, row.film.id) || wishOnList(live, keyOf(row))) return '';
      const shown = withCanonicalId({ ...row.film }, row.facets || {});
      markWishFilm(shown.id);
      const placed = showWishPosterNow(live, shown);
      const resolved = await completeWishHit({ ...row, film: shown });
      const film = resolved.film || shown;
      if (row.fromUpcoming) rememberWishDate(film);
      const message = await addFilmToList(live.id, film, resolved.facets);
      if (message) {
        if (placed) {
          const stray = document.querySelector(`#wish-board .wish-grid[data-list="${CSS.escape(live.id)}"] [data-id="${CSS.escape(film.id)}"]`);
          if (stray) stray.remove();
        }
        return message;
      }
      taken.add(film.id);
      markWishFilm(film.id);
      return '';
    };

    const take = async (state, row) => {
      if (!row || taken.has(row.film.id)) return;
      taken.add(row.film.id);
      const node = state.nodes.get(row.film.id);
      if (node) node.classList.add('is-leaving');
      window.setTimeout(() => paintCovers(state), 180);
      const message = await addRow(row);
      if (message) {
        taken.delete(row.film.id);
        state.message = message;
        paintCovers(state);
        state.note.textContent = message;
      }
    };

    const takeCurrent = (state) => {
      const shown = visible(state);
      const row = shown[state.cursor] || shown[0];
      if (row) {
        take(state, row);
        return;
      }
      if (state === upcoming && state.query.length >= 2 && !state.busy) openCustomYear();
    };

    const bindKeys = (state) => {
      state.input.addEventListener('keydown', (event) => {
        const shown = visible(state);
        const atEnd = state.input.selectionStart === state.input.value.length
          && state.input.selectionEnd === state.input.value.length;
        let step = 0;
        if (event.key === 'ArrowDown') step = 1;
        else if (event.key === 'ArrowUp') step = -1;
        else if (event.key === 'ArrowRight' && atEnd && shown.length > 1) step = 1;
        else if (event.key === 'ArrowLeft' && atEnd && state.cursor > 0) step = -1;
        if (step) {
          if (!shown.length) return;
          event.preventDefault();
          state.cursor = Math.max(0, Math.min(shown.length - 1, state.cursor + step));
          paintCovers(state);
          return;
        }
        if (event.key === 'Escape') {
          if (!state.input.value) return;
          event.preventDefault();
          event.stopPropagation();
          state.input.value = '';
          state.input.dispatchEvent(new Event('input'));
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        takeCurrent(state);
      });
      state.go.addEventListener('click', () => takeCurrent(state));
    };

    const showFeed = () => {
      const mine = ++upcoming.token;
      loadUpcomingFeed().then((rows) => {
        if (mine !== upcoming.token || !wishSearchList || upcoming.query.length >= 2) return;
        setPool(upcoming, rows, '');
      });
    };

    const openCustomYear = () => {
      const title = upcoming.query;
      if (title.length < 2) return;
      upcoming.extra.replaceChildren();
      const year = document.createElement('input');
      year.type = 'text';
      year.className = 'wish-year';
      year.inputMode = 'numeric';
      year.maxLength = 4;
      year.placeholder = t('Year');
      year.setAttribute('aria-label', t('Year'));
      year.autocomplete = 'off';
      upcoming.extra.append(year);
      year.focus();
      year.addEventListener('keydown', async (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          upcoming.extra.replaceChildren();
          upcoming.input.focus();
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const digits = year.value.replace(/\D/g, '');
        if (digits.length > 0 && digits.length < 4) return;
        const live = currentWishSearchList();
        if (!live) return;
        year.disabled = true;
        const film = {
          id: `custom:${crypto.randomUUID()}`,
          title,
          year: digits,
          kind: 'custom',
          poster: null,
          genres: [],
          director: '',
          imdb: null,
          imdbLabel: '',
          fromCatalog: false,
        };
        upcoming.extra.replaceChildren();
        upcoming.input.value = '';
        upcoming.query = '';
        const message = await addFilmToList(live.id, film, null);
        if (message) {
          upcoming.message = message;
          upcoming.note.textContent = message;
          return;
        }
        markWishFilm(film.id);
        showWishPosterNow(live, film);
        showFeed();
      });
    };

    upcoming.input.addEventListener('input', () => {
      upcoming.query = upcoming.input.value.trim();
      upcoming.extra.replaceChildren();
      window.clearTimeout(upcoming.timer);
      if (upcoming.query.length < 2) {
        upcoming.busy = false;
        showFeed();
        return;
      }
      upcoming.busy = true;
      upcoming.timer = window.setTimeout(async () => {
        const mine = ++upcoming.token;
        const query = upcoming.query;
        let found = [];
        try {
          const response = await fetch(`/api/film?q=${encodeURIComponent(query)}&list=1&upcoming=1`);
          const data = await response.json().catch(() => null);
          const films = response.ok && data && Array.isArray(data.films) ? data.films : [];
          found = films.filter((item) => item && item.film && item.film.title).map((item) => ({
            film: { ...item.film, fromCatalog: false },
            facets: item.facets || null,
            source: 'tmdb',
            fromUpcoming: true,
          }));
        } catch {
          found = [];
        }
        if (mine !== upcoming.token || !wishSearchList) return;
        upcoming.busy = false;
        setPool(upcoming, found, t('Add “{q}” as custom entry', { q: query }));
      }, 250);
    });

    released.input.addEventListener('input', () => {
      released.query = released.input.value.trim();
      window.clearTimeout(released.timer);
      if (released.query.length < 2) {
        released.token += 1;
        setPool(released, [], '');
        return;
      }
      released.timer = window.setTimeout(async () => {
        const mine = ++released.token;
        const found = await wishSearch(released.query).catch(() => []);
        if (mine !== released.token || !wishSearchList) return;
        let message = '';
        if (found.hasUpcoming) message = 'Not out yet? Add it under UPCOMING';
        else if (!found.length) message = 'Nothing found – try with a year, e.g. The Invisible Man (2020)';
        setPool(released, found, message);
      }, 250);
    });

    bindKeys(upcoming);
    bindKeys(released);
    setPool(released, [], '');
    showFeed();
    if (!phoneSheet()) upcoming.input.focus();
  }

  function wishMemberSign(list) {
    return (list.members || []).map((person) => (
      `${person.id}:${person.role || ''}:${person.status || ''}:${person.username || ''}:${person.avatar ? JSON.stringify(person.avatar) : ''}`
    )).join('|');
  }

  function paintWishCount(sideText, count) {
    if (!sideText) return;
    const next = wishCountLabel(count);
    if (sideText.textContent !== next) sideText.textContent = next;
  }

  function refreshWishBar(bar, list, count, average) {
    const title = bar.querySelector('.wish-title');
    const renaming = title && title.querySelector('input');
    if (title && !renaming && title.textContent !== (list.title || '')) title.textContent = list.title || '';
    const color = list.color || '';
    const swatch = bar.querySelector('.wish-swatch');
    const hueOpen = bar.querySelector('.genre-name.is-hue');
    if (!hueOpen && swatch && color && swatch.style.color !== color) {
      swatch.style.color = color;
      if (title && !renaming) title.style.color = color;
    }
    const names = bar.querySelector('.wish-by-names');
    const inviting = bar.querySelector('.wish-by.is-inviting');
    if (names && !inviting) {
      const sign = wishMemberSign(list);
      if (names.dataset.sign !== sign || names.querySelectorAll('.wish-person').length !== (list.members || []).length) {
        names.dataset.sign = sign;
        fillWishNames(names, list);
      }
    }
    paintWishCount(bar.querySelector('.genre-score-text'), count, average);
  }

  function wishAverage(list, film, item, ratings) {
    const bucket = [];
    (ratings || []).forEach((row) => {
      if (row.film_id !== item.filmId) return;
      const rating = Number(row.rating);
      if (rating > 0) bucket.push(rating);
    });
    const mine = entry(film.id).rating;
    if (mine != null && mine > 0 && !(account && (ratings || []).some((row) => row.film_id === item.filmId && row.user_id === account.id))) {
      bucket.push(mine);
    }
    if (list.members.length > 1) {
      return bucket.length ? bucket.reduce((sum, value) => sum + value, 0) / bucket.length : null;
    }
    return mine != null && mine > 0 ? mine : null;
  }

  function bindWishPoster(poster, list) {
    if (poster.dataset.bound === '1') return;
    poster.dataset.bound = '1';
    poster.addEventListener('click', () => {
      if (poster._wishFilm && selectedId === poster._wishFilm.id) {
        clearSelection();
        return;
      }
      const current = wishLists.find((entry) => entry.id === list.id) || list;
      if (poster._wishFilm) openListedFilm(poster._wishFilm, current);
    });
  }

  function syncWishPosters(grid, list, items, ratings) {
    let plus = grid.querySelector('.wish-plus');
    if (!plus) {
      plus = wishPlusTile(() => openWishSearch(list));
      grid.prepend(plus);
    }
    const order = [];
    const averages = [];
    items.forEach((item) => {
      const film = wishFilmObject(item);
      const rating = wishAverage(list, film, item, ratings);
      if (rating != null) averages.push(rating);
      let poster = grid.querySelector(`.poster[data-id="${CSS.escape(film.id)}"]`);
      if (!poster) {
        poster = wishPoster(film, list.members.length > 1 || rating != null ? rating : null);
        if (list.members.length < 2 && rating == null) poster.classList.remove('is-rated');
        if (wishMarkedId && film.id === wishMarkedId) poster.classList.add('is-fresh');
        if (canDropWishFilm(list, item)) poster.append(wishDrop(item, list, film));
      } else {
        poster._wishFilm = film;
        const rated = rating != null;
        const tint = poster.querySelector('.tint');
        const tintColor = rated ? coverTint(rating) : '';
        const score = poster.querySelector('.poster-score');
        const scoreText = rated ? `★  ${Number(rating).toFixed(1).replace('.', ',')}` : '';
        const tintChanged = Boolean(tint) && tint.style.background !== tintColor;
        const scoreChanged = Boolean(score) && score.textContent !== scoreText;
        poster.classList.toggle('is-rated', rated);
        if (tintChanged) tint.style.background = tintColor;
        if (scoreChanged) score.textContent = scoreText;
        if (tintChanged || scoreChanged) paintWear(poster, rating);
        paintWishCover(poster, film);
        if (wishMarkedId && film.id === wishMarkedId) poster.classList.add('is-fresh');
        const drop = poster.querySelector('.wish-drop');
        if (canDropWishFilm(list, item)) {
          if (!drop) poster.append(wishDrop(item, list, film));
        } else if (drop) drop.remove();
      }
      poster._wishFilm = film;
      bindWishPoster(poster, list);
      order.push(poster);
    });
    const keep = new Set(order);
    [...grid.querySelectorAll('.poster')].forEach((poster) => {
      if (poster.classList.contains('wish-plus') || keep.has(poster)) return;
      poster.remove();
    });
    const ids = order.map((poster) => poster.dataset.id);
    const current = [...grid.querySelectorAll('.poster:not(.wish-plus)')].map((poster) => poster.dataset.id);
    const same = current.length === ids.length && current.every((id, index) => id === ids[index]);
    if (!same) {
      let cursor = plus;
      order.forEach((poster) => {
        if (cursor.nextSibling !== poster) cursor.after(poster);
        cursor = poster;
      });
    }
    return averages;
  }

  function orderWishSections(board) {
    const draftGrid = board.querySelector('.wish-grid[data-list="draft"]');
    const draftBar = board.querySelector('.wish-draft');
    let anchor = draftGrid || draftBar;
    wishLists.forEach((list) => {
      const bar = board.querySelector(`.wish-bar[data-list="${CSS.escape(list.id)}"]`);
      const grid = board.querySelector(`.wish-grid[data-list="${CSS.escape(list.id)}"]`);
      if (bar && anchor && anchor.nextSibling !== bar) anchor.after(bar);
      if (bar) anchor = bar;
      if (grid && anchor && anchor.nextSibling !== grid) anchor.after(grid);
      if (grid) anchor = grid;
    });
  }

  async function refreshWishGroup(list, token, bar, grid) {
    if (list.myStatus === 'invited') return [];
    let items = [];
    try {
      items = await globalThis.Cloud.wishDetail(list.id);
    } catch {
      items = [];
    }
    if (token !== wishBoardToken) return [];
    let ratings = [];
    const filmIds = items.map((item) => item.filmId).filter(Boolean);
    if (list.members.length > 1 && filmIds.length && globalThis.Cloud.memberRatings) {
      ratings = await globalThis.Cloud.memberRatings(list.members.map((person) => person.id), filmIds).catch(() => []);
    }
    if (token !== wishBoardToken) return [];
    grid.hidden = wishCollapsed.has(list.id);
    const averages = syncWishPosters(grid, list, items, ratings);
    const average = list.members.length > 1 && averages.length
      ? averages.reduce((sum, value) => sum + value, 0) / averages.length
      : null;
    refreshWishBar(bar, list, items.length, average);
    schedulePosterFill(items);
    return items;
  }

  async function paintWishGroup(board, list, token) {
    const invited = list.myStatus === 'invited';
    const existingBar = board.querySelector(`.wish-bar[data-list="${CSS.escape(list.id)}"]`);
    const existingGrid = board.querySelector(`.wish-grid[data-list="${CSS.escape(list.id)}"]`);
    if (existingBar && invited) return [];
    if (existingBar && existingGrid) return refreshWishGroup(list, token, existingBar, existingGrid);
    if (existingBar) existingBar.remove();
    const accepted = list.myStatus === 'accepted';
    const bar = el('div', invited ? 'genre-bar wish-bar' : 'genre-bar wish-bar has-x');
    bar.dataset.list = list.id;
    const title = wishNameCell(list);
    const by = el('div', 'genre-count wish-by');
    if (accepted && list.role === 'owner') by.append(wishMemberPlus(list, by));
    const names = el('span', 'wish-by-names');
    fillWishNames(names, list);
    by.append(names);
    by.addEventListener('click', (event) => {
      if (!phoneSheet()) return;
      if (event.target.closest('button, input, .wish-member-hits')) {
        if (by.querySelector('.wish-roster')) closeWishRoster();
        return;
      }
      openWishRoster(by, list);
    });
    const side = el('span', 'genre-score');
    const sideText = el('span', 'genre-score-text', wishCountLabel(list.filmCount || 0));
    side.append(sideText);
    bar.append(title, by, side);
    if (invited) {
      board.append(bar);
      return [];
    }
    side.classList.add('has-remove');
    side.addEventListener('click', (event) => {
      if (event.target.closest('.wish-x, .wish-sure')) return;
      if (wishCollapsed.has(list.id)) wishCollapsed.delete(list.id);
      else wishCollapsed.add(list.id);
      const shown = !wishCollapsed.has(list.id);
      const gridNode = board.querySelector(`.wish-grid[data-list="${list.id}"]`);
      if (gridNode) gridNode.hidden = !shown;
    });
    side.append(wishRemoveButton(list, bar));
    board.append(bar);
    if (wishFocusId === list.id) {
      const label = title.querySelector('.wish-title');
      if (label) beginWishRename(label, list);
      wishFocusId = null;
    }
    let items = [];
    try {
      items = await globalThis.Cloud.wishDetail(list.id);
    } catch {
      items = [];
    }
    if (token !== wishBoardToken) return [];
    sideText.textContent = wishCountLabel(items.length);
    const filmIds = items.map((item) => item.filmId).filter(Boolean);
    let ratings = [];
    if (list.members.length > 1 && filmIds.length && globalThis.Cloud.memberRatings) {
      ratings = await globalThis.Cloud.memberRatings(list.members.map((person) => person.id), filmIds).catch(() => []);
    }
    if (token !== wishBoardToken) return [];
    const byFilm = new Map();
    ratings.forEach((row) => {
      const rating = Number(row.rating);
      if (!(rating > 0)) return;
      const bucket = byFilm.get(row.film_id) || [];
      bucket.push(rating);
      byFilm.set(row.film_id, bucket);
    });
    const averages = [];
    const grid = el('div', 'wish-grid');
    grid.dataset.list = list.id;
    grid.hidden = wishCollapsed.has(list.id);
    const plus = wishPlusTile(() => openWishSearch(list));
    grid.append(plus);
    items.forEach((item) => {
      const film = wishFilmObject(item);
      const bucket = byFilm.get(item.filmId) || [];
      const mine = entry(film.id).rating;
      if (mine != null && mine > 0 && !(account && ratings.some((row) => row.film_id === item.filmId && row.user_id === account.id))) {
        bucket.push(mine);
      }
      const average = list.members.length > 1
        ? (bucket.length ? bucket.reduce((sum, value) => sum + value, 0) / bucket.length : null)
        : (mine != null && mine > 0 ? mine : null);
      if (average != null) averages.push(average);
      const poster = wishPoster(film, list.members.length > 1 || average != null ? average : null);
      if (list.members.length < 2 && average == null) poster.classList.remove('is-rated');
      if (wishMarkedId && film.id === wishMarkedId) poster.classList.add('is-fresh');
      if (canDropWishFilm(list, item)) poster.append(wishDrop(item, list, film));
      poster._wishFilm = film;
      bindWishPoster(poster, list);
      grid.append(poster);
    });
    board.append(grid);
    schedulePosterFill(items);
    if (list.members.length > 1 && averages.length) {
      const avg = averages.reduce((sum, value) => sum + value, 0) / averages.length;
      paintWishCount(sideText, items.length, avg);
    }
    return items;
  }

  function loadFilmCard(film) {
    const card = readFilmCard(film.id);
    if (card && card.ready) return;
    const token = (cardTokens.get(film.id) || 0) + 1;
    cardTokens.set(film.id, token);
    const kind = film.tmdbType === 'tv' ? 'tv' : 'movie';
    const query = `https://www.themoviedb.org/${kind}/${film.tmdbId}`;
    fetch(`/api/film?q=${encodeURIComponent(query)}&card=1`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || cardTokens.get(film.id) !== token) return;
        if (data.director) film.director = data.director;
        if (Array.isArray(data.cast) && data.cast.length) film.cast = data.cast.filter(Boolean);
        if (data.overview && !film.overview) film.overview = data.overview;
        if ((!film.genres || !film.genres.length) && Array.isArray(data.genres)) film.genres = data.genres.slice(0, 3);
        writeFilmCard(film.id, film);
        placeFilmCredits(film);
      })
      .catch(() => {});
  }

  function comingFilm(row) {
    const source = row.film;
    const facets = row.facets || {};
    const tmdbId = source.tmdbId != null ? source.tmdbId : facets.tmdbId;
    const kind = (source.tmdbType || facets.tmdbType) === 'tv' ? 'tv' : 'movie';
    const id = `tmdb:${kind}:${tmdbId}`;
    const card = readFilmCard(id);
    return {
      id,
      tmdbId,
      tmdbType: kind,
      title: source.title,
      original: source.original || null,
      year: source.year || '',
      poster: source.poster || '',
      release_date: source.release_date || null,
      status: source.status || null,
      genres: (card && card.genres) || [],
      overview: (card && card.overview) || '',
      director: (card && card.director) || source.director || '',
      cast: (card && card.cast) || [],
      imdb: null,
      imdbLabel: '–',
      kind: kind === 'tv' ? 'serie' : 'film',
      fromCatalog: false,
    };
  }

  function wishComingStrip() {
    const wrap = el('section', 'wish-coming-wrap');
    wrap.hidden = true;
    const bar = el('div', 'genre-bar wish-coming-bar');
    const name = el('div', 'genre-name wish-coming-name');
    const flame = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.4 3c.6 3.1-1.6 4.8-3.1 6.8C8.1 11.4 7.4 13 7.4 14.8a4.8 4.8 0 0 0 9.6 0c0-2.5-1.2-4.4-2.5-5.9-.3 1.4-1 2.4-2 2.9.5-3.1 0-6.3-.1-8.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    name.innerHTML = flame;
    name.append(el('span', null, 'Upcoming:'));
    bar.append(name);
    const strip = el('div', 'wish-coming');
    strip.setAttribute('aria-label', t('Upcoming in cinemas'));
    wrap.append(bar, strip);
    loadUpcomingFeed().then((rows) => {
      const sorted = rows.slice().sort((a, b) => {
        const left = String(a.film.release_date || '9999');
        const right = String(b.film.release_date || '9999');
        return left.localeCompare(right);
      });
      if (!sorted.length) return;
      strip.replaceChildren(...sorted.map((row) => {
        const film = comingFilm(row);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wish-coming-cover';
        button.dataset.id = film.id;
        const stamp = releaseStamp(film);
        const label = `${film.title || t('Movie')}${stamp ? ` · ${stamp}` : ''}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.draggable = false;
        image.src = film.poster;
        button.append(image);
        if (stamp) button.append(el('span', 'wish-when', stamp));
        button.addEventListener('click', () => {
          if (selectedId === film.id) {
            clearSelection();
            return;
          }
          panelFilm = null;
          openFilm(film);
          loadFilmCard(film);
        });
        return button;
      }));
      wrap.hidden = false;
    });
    return wrap;
  }

  async function paintWishBoard(options) {
    const board = document.getElementById('wish-board');
    if (!board) return;
    const token = ++wishBoardToken;
    const scroll = captureWishScroll();
    const owner = !wishPaintScroll;
    if (owner) wishPaintScroll = scroll;
    const ready = board.querySelector('.wish-grid[data-list="draft"]');
    if (!ready) {
      board.replaceChildren();
      board.append(wishComingStrip());
      paintWishInvites(board);
      paintWishDraft(board);
    } else {
      const invited = new Set(wishLists.filter((list) => list.myStatus === 'invited').map((list) => list.id));
      board.querySelectorAll('.wish-invite').forEach((row) => {
        if (!invited.has(row.dataset.list)) row.remove();
      });
      const before = board.querySelector('.wish-draft');
      const count = board.querySelectorAll('.wish-invite').length;
      paintWishInvites(board);
      [...board.querySelectorAll('.wish-invite')].slice(count).forEach((row) => {
        if (before) before.before(row);
      });
    }
    const live = new Set(wishLists.map((list) => list.id));
    board.querySelectorAll('.wish-bar[data-list]').forEach((bar) => {
      if (live.has(bar.dataset.list)) return;
      const grid = board.querySelector(`.wish-grid[data-list="${CSS.escape(bar.dataset.list)}"]`);
      bar.remove();
      if (grid) grid.remove();
    });
    const stale = [];
    for (const list of wishLists) {
      const items = await paintWishGroup(board, list, token);
      if (token !== wishBoardToken) {
        if (owner) wishPaintScroll = null;
        return;
      }
      (items || []).forEach((item) => stale.push(wishFilmObject(item)));
    }
    if (token !== wishBoardToken) {
      if (owner) wishPaintScroll = null;
      return;
    }
    orderWishSections(board);
    if (options && options.focusDraft) {
      const input = board.querySelector('.wish-draft .wish-name');
      if (input) input.focus();
    }
    restoreWishScroll(scroll);
    if (owner) wishPaintScroll = null;
    refreshUpcomingFilms(stale, token);
  }

  function paintWishHome() {
    const block = document.createElement('section');
    const open = lineButton('Wunschlisten öffnen');
    open.addEventListener('click', () => setMode('wish'));
    block.append(open);
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
    article._wishItem = item;
    if (wishFresh.has(item.id)) article.classList.add('is-fresh');
    const poster = document.createElement('button');
    poster.type = 'button';
    poster.className = 'wish-poster';
    poster.setAttribute('aria-label', film.title || t('Movie'));
    const image = document.createElement('img');
    image.alt = '';
    image.src = posterSrc(film);
    poster.append(image);
    poster.addEventListener('click', () => openListedFilm(wishFilmObject(article._wishItem), list));
    const body = el('div', 'wish-copy');
    const title = el('button', 'wish-title', film.title || t('Movie'));
    title.type = 'button';
    title.addEventListener('click', () => openListedFilm(wishFilmObject(article._wishItem), list));
    const year = film.year ? `${film.year} · ` : '';
    body.append(title, el('p', 'wish-meta', `${year}${t('added by {name}', { name: item.addedName })}`));
    const vote = el('button', 'wish-vote', t('Want it · {n}', { n: item.votes.length }));
    vote.type = 'button';
    vote.setAttribute('aria-pressed', item.mine ? 'true' : 'false');
    vote.addEventListener('click', () => changeWishVote(article._wishItem));
    body.append(vote);
    if (item.votes.length) body.append(el('p', 'wish-voters', item.votes.map((row) => row.username).join(' · ')));
    const tools = el('div', 'wish-tools');
    const status = el('button', 'wish-status', item.status === 'geschaut' ? 'Wieder öffnen' : 'Zusammen geschaut');
    status.type = 'button';
    status.addEventListener('click', () => changeWishStatus(article._wishItem));
    tools.append(status);
    const me = account && account.id;
    if (list.role === 'owner' || item.addedBy === me) {
      const remove = el('button', 'wish-remove', 'Entfernen');
      remove.type = 'button';
      remove.addEventListener('click', () => removeWishItem(article._wishItem, list));
      tools.append(remove);
    }
    body.append(tools);
    article.append(poster, body);
    return article;
  }

  function refreshWishFilmRow(article, item) {
    article._wishItem = item;
    const film = wishFilmObject(item);
    const image = article.querySelector('img');
    const poster = knownPoster(film);
    if (image && poster && !posterSrcMatches(image, poster)) image.src = poster;
    const title = article.querySelector('.wish-title');
    const titleText = film.title || t('Movie');
    if (title && title.textContent !== titleText) title.textContent = titleText;
    const meta = article.querySelector('.wish-meta');
    const year = film.year ? `${film.year} · ` : '';
    const metaText = `${year}${t('added by {name}', { name: item.addedName })}`;
    if (meta && meta.textContent !== metaText) meta.textContent = metaText;
    const vote = article.querySelector('.wish-vote');
    const voteText = t('Want it · {n}', { n: item.votes.length });
    if (vote) {
      if (vote.textContent !== voteText) vote.textContent = voteText;
      vote.setAttribute('aria-pressed', item.mine ? 'true' : 'false');
    }
    const names = item.votes.length ? item.votes.map((row) => row.username).join(' · ') : '';
    const voters = article.querySelector('.wish-voters');
    if (names) {
      if (voters) {
        if (voters.textContent !== names) voters.textContent = names;
      } else {
        const tools = article.querySelector('.wish-tools');
        const line = el('p', 'wish-voters', names);
        if (tools) tools.before(line);
      }
    } else if (voters) voters.remove();
    const status = article.querySelector('.wish-status');
    const statusText = item.status === 'geschaut' ? 'Wieder öffnen' : 'Zusammen geschaut';
    if (status && status.textContent !== statusText) status.textContent = statusText;
    if (wishFresh.has(item.id)) article.classList.add('is-fresh');
  }

  function placeWishRows(host, items, list) {
    const alive = new Set(wishItems.map((item) => item.id));
    [...host.querySelectorAll('.wish-film')].forEach((node) => {
      if (!alive.has(node.dataset.wishItem)) node.remove();
    });
    items.forEach((item, index) => {
      let article = document.querySelector(`.wish-film[data-wish-item="${CSS.escape(item.id)}"]`);
      if (!article) article = wishFilmRow(item, list);
      else refreshWishFilmRow(article, item);
      const films = [...host.querySelectorAll('.wish-film')];
      if (films[index] !== article) {
        if (films[index]) films[index].before(article);
        else host.append(article);
      }
    });
  }

  function fillWishItems(list) {
    const openHost = document.getElementById('wish-items');
    const doneHost = document.getElementById('wish-done');
    if (!openHost || !doneHost || !list) return;
    const scroll = captureWishScroll();
    const open = sortedWishItems(wishItems.filter((item) => item.status !== 'geschaut'));
    const done = sortedWishItems(wishItems.filter((item) => item.status === 'geschaut'));
    openHost.querySelectorAll('.profile-note').forEach((node) => node.remove());
    if (!open.length) {
      openHost.querySelectorAll('.wish-film').forEach((node) => node.remove());
      openHost.append(el('p', 'profile-note', wishItems.length ? 'Keine offenen Filme.' : 'Noch keine Filme.'));
    } else placeWishRows(openHost, open, list);
    if (!done.length) {
      doneHost.replaceChildren();
      restoreWishScroll(scroll);
      return;
    }
    let details = doneHost.querySelector('.wish-done');
    if (!details) {
      details = document.createElement('details');
      details.className = 'wish-done';
      const summary = document.createElement('summary');
      summary.textContent = t('Zusammen geschaut');
      details.append(summary);
      doneHost.replaceChildren(details);
    }
    placeWishRows(details, done, list);
    restoreWishScroll(scroll);
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
    const scroll = captureWishScroll();
    const searching = document.activeElement && document.activeElement.id === 'wish-search';
    const head = root.querySelector('h1');
    const sameList = Boolean(head && head.dataset.wishList === list.id && document.getElementById('wish-items'));
    if (sameList) {
      if (!head.querySelector('input') && head.textContent !== list.title) head.textContent = list.title;
      const handle = root.querySelector('.handle');
      const names = list.members.map((person) => person.username).filter(Boolean).join(' · ');
      if (handle && handle.textContent !== names) handle.textContent = names;
      root.querySelectorAll('.wish-sort button').forEach((button) => {
        const pressed = (button.dataset.sort === 'votes' && wishSort === 'votes')
          || (button.dataset.sort === 'new' && wishSort === 'new');
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      });
    } else if (!(searching && document.getElementById('wish-items'))) {
      root.classList.remove('profile-list');
      root.replaceChildren();
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'back';
      back.textContent = t('Zurück');
      back.addEventListener('click', () => renderProfile());
      const title = el('h1', null, list.title);
      title.dataset.wishList = list.id;
      root.append(back, title);
      root.append(el('p', 'handle', list.members.map((person) => person.username).filter(Boolean).join(' · ')));
      root.append(paintWishManage(list));
      const sort = el('div', 'wish-sort');
      const byVotes = el('button', null, 'Stimmen');
    byVotes.dataset.sort = 'votes';
      byVotes.type = 'button';
      byVotes.setAttribute('aria-pressed', wishSort === 'votes' ? 'true' : 'false');
      byVotes.addEventListener('click', () => {
        wishSort = 'votes';
        paintWishlist();
      });
      const byNew = el('button', null, 'Neueste');
    byNew.dataset.sort = 'new';
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
      search.placeholder = t('Film suchen');
      search.setAttribute('aria-label', t('Film suchen'));
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
              const origin = (hit.sources || []).join(' · ');
              const label = [origin, hit.film.year].filter(Boolean).join(' · ');
              button.append(document.createTextNode(hit.film.title || t('Movie')), el('small', null, label));
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
      restoreWishScroll(scroll);
    }).catch(() => {
      if (token === wishViewToken) setWishStatus('Keine Verbindung.');
    });
  }

  function paintWishManage(list) {
    const details = document.createElement('details');
    details.className = 'wish-manage';
    const summary = document.createElement('summary');
    summary.textContent = t('Verwalten');
    details.append(summary);
    const me = account && account.id;
    if (list.role === 'owner') {
      const name = document.createElement('input');
      name.type = 'text';
      name.value = list.title;
      name.setAttribute('aria-label', t('Titel'));
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
      wipe.placeholder = t('löschen');
      wipe.setAttribute('aria-label', t('löschen eingeben'));
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
    const previous = item.mine;
    noteOwnWish(wishOpenId);
    item.mine = !item.mine;
    item.votes = item.mine
      ? item.votes.concat([{ id: account && account.id, username: (account && account.username) || 'Ich' }])
      : item.votes.filter((row) => row.id !== (account && account.id));
    const list = wishLists.find((entry) => entry.id === wishOpenId);
    if (list && document.getElementById('wish-items')) fillWishItems(list);
    try {
      await globalThis.Cloud.voteWishlist(item.id, item.mine);
      await loadWishlists({ quiet: true });
    } catch (error) {
      item.mine = previous;
      setWishStatus(wishFail(error));
      await loadWishlists({ quiet: true });
    }
  }

  async function changeWishStatus(item) {
    const previous = item.status;
    const next = previous === 'geschaut' ? 'offen' : 'geschaut';
    noteOwnWish(wishOpenId);
    item.status = next;
    const list = wishLists.find((entry) => entry.id === wishOpenId);
    if (list && document.getElementById('wish-items')) fillWishItems(list);
    try {
      await globalThis.Cloud.setWishlistStatus(item.id, next);
      await loadWishlists({ quiet: true });
    } catch (error) {
      item.status = previous;
      if (list && document.getElementById('wish-items')) fillWishItems(list);
      setWishStatus(wishFail(error));
    }
  }

  async function removeWishItem(item, list, options) {
    if (!item || !globalThis.Cloud || !globalThis.Cloud.removeWishlistItem) return false;
    const holdBoard = Boolean(options && options.holdBoard);
    const listId = (list && list.id) || wishOpenId;
    noteOwnWish(listId);
    const film = item._posterFilm || wishFilmObject(item);
    const spots = [];
    const parts = [];
    if (item.filmId) parts.push(`#wish-board .poster[data-id="${CSS.escape(item.filmId)}"]`);
    if (item.id) parts.push(`.wish-film[data-wish-item="${CSS.escape(item.id)}"]`);
    if (parts.length) {
      document.querySelectorAll(parts.join(',')).forEach((node) => {
        spots.push({ node, parent: node.parentNode, next: node.nextSibling });
      });
    }
    spots.forEach((spot) => spot.node.classList.add('is-leaving'));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    spots.forEach((spot) => {
      if (spot.node.parentNode) spot.node.remove();
    });
    const previousItems = wishItems.slice();
    const previousLists = wishLists.map((entry) => ({
      id: entry.id,
      stamps: (entry.stamps || []).slice(),
      filmCount: entry.filmCount,
    }));
    wishItems = wishItems.filter((row) => row.id !== item.id);
    wishLists.forEach((entry) => {
      if (!entry.stamps) return;
      const next = entry.stamps.filter((stamp) => stamp.id !== item.id);
      if (next.length === entry.stamps.length) return;
      entry.stamps = next;
      entry.filmCount = Math.max(0, (Number(entry.filmCount) || 1) - 1);
    });
    const openList = wishLists.find((entry) => entry.id === wishOpenId);
    if (!holdBoard && openList && document.getElementById('wish-items')) fillWishItems(openList);
    try {
      await globalThis.Cloud.removeWishlistItem(item.id);
      if (listId) {
        showWishUndo({
          listId,
          film,
          facets: film.facets || facetsOf(film),
        });
      }
      await loadWishlists(holdBoard ? { quiet: true, holdBoard: true } : { quiet: true });
      return true;
    } catch (error) {
      wishItems = previousItems;
      previousLists.forEach((saved) => {
        const entry = wishLists.find((row) => row.id === saved.id);
        if (!entry) return;
        entry.stamps = saved.stamps;
        entry.filmCount = saved.filmCount;
      });
      spots.forEach((spot) => {
        spot.node.classList.remove('is-leaving');
        if (!spot.parent) return;
        if (spot.next && spot.next.parentNode === spot.parent) spot.parent.insertBefore(spot.node, spot.next);
        else spot.parent.append(spot.node);
      });
      setWishStatus(wishFail(error));
      return false;
    }
  }

  async function addFilmToList(listId, film, facets) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.addWishlistItem || !film) return 'Keine Verbindung.';
    let next = film;
    const base = facets || facetsOf(film);
    if (!film.fromCatalog) {
      next = withCanonicalId({ ...film, genres: film.genres || [] }, base || {});
      const payload = filmCatalogPayload(next, base);
      const knownPosterUrl = next.poster || (base && base.poster) || '';
      if (!payload.poster && knownPosterUrl) payload.poster = knownPosterUrl;
      if (payload.poster) {
        next.poster = payload.poster;
        posters.set(payload.id, payload.poster);
      }
      try {
        await cloud.upsertFilm(payload);
      } catch (error) {
        return wishFail(error);
      }
    }
    if (wishOpenId === listId && wishItems.some((item) => item.filmId === next.id)) return 'Schon auf der Liste';
    noteOwnWish(listId);
    try {
      await cloud.addWishlistItem(listId, next.id);
    } catch (error) {
      if (isWishDuplicate(error)) return 'Schon auf der Liste';
      wishOwnAt.delete(listId);
      if (film.fromCatalog) {
        try {
          await cloud.upsertFilm(filmCatalogPayload(next, base));
          noteOwnWish(listId);
          await cloud.addWishlistItem(listId, next.id);
        } catch (again) {
          wishOwnAt.delete(listId);
          if (isWishDuplicate(again)) return 'Schon auf der Liste';
          return wishFail(again);
        }
      } else return wishFail(error);
    }
    noteOwnWish(listId);
    loadWishlists({ quiet: true });
    return '';
  }

  async function followedFilmPool() {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.followedFilms) return [];
    if (!(profileLists.following || []).length && cloud.followNames) {
      const names = await cloud.followNames().catch(() => null);
      if (names) applyFollowLists(names);
    }
    const ids = mutualPeople().map((person) => person.id);
    if (!ids.length) return [];
    return cloud.followedFilms(ids);
  }

  function wishMatchScore(film, query) {
    const raw = String(query || '').trim().toLocaleLowerCase('de');
    const yearHit = raw.match(/\b(?:19|20)\d{2}\b/);
    const year = yearHit ? yearHit[0] : '';
    const needle = (year ? raw.replace(year, '') : raw).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    const text = needle || raw;
    const title = String(film.title || '').toLocaleLowerCase('de');
    const original = String(film.original || '').toLocaleLowerCase('de');
    const filmYear = String(film.year || '').slice(0, 4);
    let score = 0;
    if (title === text) score = 100;
    else if (title.startsWith(text)) score = 82;
    else if (text && title.includes(text)) score = 64;
    else if (original && original === text) score = 74;
    else if (original && original.startsWith(text)) score = 56;
    else if (original && text && original.includes(text)) score = 44;
    if (!score) return 0;
    if (year && filmYear === year) score += 20;
    else if (year && filmYear) score -= 24;
    return score;
  }

  async function wishSearch(query) {
    const q = query.trim();
    if (q.length < 2) return [];
    const rows = [];
    const index = new Map();
    const add = (film, source, filmFacets, fromCatalog, bonus, floor) => {
      if (!film) return;
      const next = withCanonicalId({ ...film }, filmFacets || {});
      if (!next || !next.id) return;
      let score = wishMatchScore(next, q);
      if (!score && floor) score = floor;
      if (!score) return;
      const have = index.get(next.id);
      if (have) {
        if (filmFacets && !have.facets) have.facets = filmFacets;
        if (!have.film.director && next.director) have.film.director = next.director;
        if (score + bonus > have.score + have.bonus && source !== 'tmdb') {
          have.score = score;
          have.bonus = bonus;
          have.source = source;
        }
        return;
      }
      const row = {
        film: { ...next, fromCatalog },
        source,
        facets: filmFacets || null,
        fromCatalog,
        bonus,
        score,
        order: rows.length,
      };
      index.set(next.id, row);
      rows.push(row);
    };
    FILMS.forEach((film) => add(film, 'archiv', facetsOf(film), false, 12, 0));
    const followed = await followedFilmPool();
    followed.forEach((row) => {
      const facets = row.film.facets || null;
      add({
        id: row.film.id,
        title: row.film.title,
        original: row.film.original_title,
        year: row.film.year || '',
        poster: row.film.poster || '',
        director: (facets && facets.director) || '',
        fromCatalog: true,
      }, 'freund', facets, true, 8, 0);
    });
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(q)}&list=1`);
      const data = await response.json().catch(() => null);
      const films = response.ok && data && Array.isArray(data.films) ? data.films : [];
      let sawUpcoming = Boolean(data && data.hasUpcoming);
      films.forEach((item, order) => {
        if (!item || !item.film) return;
        if (isUpcomingFilm(item.film)) {
          sawUpcoming = true;
          return;
        }
        add({ ...item.film, fromCatalog: false }, 'tmdb', item.facets || null, false, 0, Math.max(48 - order * 3, 12));
      });
      rows.hasUpcoming = sawUpcoming;
    } catch {
      /* TMDB bleibt aus */
    }
    rows.sort((a, b) => (b.score + b.bonus) - (a.score + a.bonus) || a.order - b.order);
    const listed = rows.slice(0, 12);
    listed.hasUpcoming = Boolean(rows.hasUpcoming);
    return listed;
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
    back.textContent = t('Zurück');
    back.addEventListener('click', () => renderProfile());
    root.append(back, el('h1', null, 'Neue Wunschliste'));
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('Titel');
    input.setAttribute('aria-label', t('Titel'));
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
        status.textContent = t('Titel eintragen.');
        return;
      }
      save.disabled = true;
      try {
        const id = await globalThis.Cloud.createWishlist(title, [...picked]);
        await loadWishlists({ quiet: true });
        openWishlist(id);
      } catch (error) {
        save.disabled = false;
        status.textContent = t(wishFail(error, true));
      }
    });
    root.append(chips, save, status);
  }

  function showListNote(wrap, title) {
    if (!wrap) return;
    const note = wrap.querySelector('.panel-added');
    if (!note) return;
    note.textContent = t('Added to {name}', { name: title });
    note.hidden = false;
    window.clearTimeout(note._timer);
    note._timer = window.setTimeout(() => {
      if (note.isConnected) note.hidden = true;
    }, 1600);
  }

  function freshListTitle() {
    const taken = new Set((wishLists || []).map((list) => String(list.title || '').trim().toLocaleLowerCase('en')));
    if (!taken.has('list')) return 'List';
    let n = 2;
    while (taken.has(`list ${n}`)) n += 1;
    return `List ${n}`;
  }

  function listHoldsFilm(list, film) {
    const keys = new Set();
    if (film && film.id) keys.add(film.id);
    const keyOf = globalThis.Store && globalThis.Store.filmKey;
    if (keyOf && film) {
      const canon = keyOf(film);
      if (canon) keys.add(canon);
    }
    return (list.stamps || []).some((stamp) => keys.has(stamp.filmId));
  }

  function wishPickRow(label) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'wish-pick-row';
    choice.textContent = label;
    return choice;
  }

  function placeWishPick(pick, anchor) {
    document.querySelectorAll('body > .wish-pick').forEach((node) => {
      if (node !== pick) node.remove();
    });
    if (pick.parentNode !== document.body) document.body.append(pick);
    pick.hidden = false;
    pick.style.right = 'auto';
    pick.style.bottom = 'auto';
    const panelBox = panel.getBoundingClientRect();
    const edge = 8;
    const bounds = phoneSheet() ? {
      left: edge,
      top: edge,
      right: window.innerWidth - edge,
      bottom: window.innerHeight - edge,
    } : {
      left: panelBox.left + edge,
      top: panelBox.top + edge,
      right: panelBox.right - edge,
      bottom: panelBox.bottom - edge,
    };
    const roomW = Math.max(120, bounds.right - bounds.left);
    const roomH = Math.max(40, bounds.bottom - bounds.top);
    pick.style.maxWidth = `${roomW}px`;
    pick.style.maxHeight = `${roomH}px`;
    const width = Math.min(pick.offsetWidth, roomW);
    const height = Math.min(pick.offsetHeight, roomH);
    const anchorBox = anchor.getBoundingClientRect();
    let left = anchorBox.left;
    if (left + width > bounds.right) left = bounds.right - width;
    if (left < bounds.left) left = bounds.left;
    const gap = 6;
    const below = bounds.bottom - (anchorBox.bottom + gap);
    const above = anchorBox.top - gap - bounds.top;
    let top = height <= below || below >= above ? anchorBox.bottom + gap : anchorBox.top - gap - height;
    if (top < bounds.top) top = bounds.top;
    if (top + height > bounds.bottom) top = Math.max(bounds.top, bounds.bottom - height);
    pick.style.left = `${Math.round(left)}px`;
    pick.style.top = `${Math.round(top)}px`;
  }

  async function fillWishPick(pick, film, wrap) {
    pick.replaceChildren();
    if (!wishLists.length && globalThis.Cloud) await loadWishlists({ quiet: true }).catch(() => {});
    const lists = (wishLists || []).filter((list) => list.myStatus !== 'invited');
    if (!lists.length) {
      const create = wishPickRow(t('+ New list'));
      create.addEventListener('click', async () => {
        create.disabled = true;
        const cloud = globalThis.Cloud;
        if (!cloud || !cloud.createWishlist) {
          create.disabled = false;
          return;
        }
        let title = freshListTitle();
        let id = '';
        try {
          id = await cloud.createWishlist(title, []);
          await loadWishlists({ quiet: true });
        } catch {
          create.disabled = false;
          return;
        }
        const created = (wishLists || []).find((item) => item.id === id);
        if (created && created.title) title = created.title;
        const message = await addFilmToList(id, film, facetsOf(film));
        if (message && message !== 'Schon auf der Liste') {
          create.disabled = false;
          return;
        }
        closeTransient();
        showListNote(wrap, title);
      });
      pick.append(create);
      return;
    }
    lists.forEach((list) => {
      const held = listHoldsFilm(list, film);
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'wish-pick-row';
      const swatch = el('span', 'wish-pick-color');
      swatch.style.background = list.color || '#ffffff';
      const name = el('span', 'wish-pick-name', list.title || t('List'));
      choice.append(swatch, name);
      if (held) {
        choice.disabled = true;
        choice.append(el('span', 'wish-pick-mark', '✓'));
      } else {
        choice.addEventListener('click', async () => {
          choice.disabled = true;
          const message = await addFilmToList(list.id, film, facetsOf(film));
          if (message && message !== 'Schon auf der Liste') {
            choice.disabled = false;
            return;
          }
          closeTransient();
          showListNote(wrap, list.title);
        });
      }
      pick.append(choice);
    });
  }

  function paintWishSlot(slot, film) {
    const button = lineButton('Add to wishlist');
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
      button.textContent = t('You watched {title} together – rate it now', { title: film.title });
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

  function round1(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 10) / 10;
  }

  function ratedTasteFilms() {
    return FILMS.filter((film) => entry(film.id).rating != null);
  }

  function tasteDecade(film) {
    let year = Number(film.yearNum);
    if (!Number.isFinite(year)) {
      const match = String(film.year || '').match(/\d{4}/);
      year = match ? Number(match[0]) : NaN;
    }
    if (!Number.isFinite(year)) return '';
    return `${Math.floor(year / 10) * 10}er`;
  }

  function tasteGroups(map, limit) {
    return [...map.values()]
      .sort((a, b) => b.count - a.count || (b.sum / b.count) - (a.sum / a.count) || a.name.localeCompare(b.name, 'de'))
      .slice(0, limit)
      .map((row) => ({ name: row.name, count: row.count, avg: round1(row.sum / row.count) }));
  }

  function tasteAdd(map, name, rating) {
    const key = String(name || '').trim();
    if (!key) return;
    const row = map.get(key) || { name: key, count: 0, sum: 0 };
    row.count += 1;
    row.sum += rating;
    map.set(key, row);
  }

  function tasteSummary() {
    const films = ratedTasteFilms();
    const ratings = films.map((film) => entry(film.id).rating);
    const count = ratings.length;
    const avg = count ? ratings.reduce((sum, value) => sum + value, 0) / count : 0;
    const variance = count ? ratings.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / count : 0;
    const genres = new Map();
    const subgenres = new Map();
    const themes = new Map();
    const decades = new Map();
    const tone = {};
    const intensity = {};
    const narrative = {};
    const bump = (bag, value) => {
      const key = String(value == null ? '' : value).trim();
      if (!key) return;
      bag[key] = (bag[key] || 0) + 1;
    };
    films.forEach((film) => {
      const full = fullOf(film);
      const rating = entry(film.id).rating;
      (full.genres || []).forEach((name) => tasteAdd(genres, name, rating));
      (full.subgenres || []).forEach((name) => tasteAdd(subgenres, name, rating));
      (full.themes || []).forEach((name) => tasteAdd(themes, name, rating));
      (full.tone || []).forEach((name) => bump(tone, name));
      (full.narrative || []).forEach((name) => bump(narrative, name));
      if (typeof full.intensity === 'number' && Number.isFinite(full.intensity)) bump(intensity, full.intensity);
      tasteAdd(decades, tasteDecade(film), rating);
    });
    const ranked = films.slice().sort((a, b) => {
      const diff = entry(b.id).rating - entry(a.id).rating;
      if (diff) return diff;
      return (Date.parse(entry(b.id).ratedAt) || 0) - (Date.parse(entry(a.id).ratedAt) || 0);
    });
    const filmRow = (film) => ({
      title: film.title || '',
      year: film.year ? String(film.year) : '',
      rating: round1(entry(film.id).rating),
    });
    const people = personMaps();
    const pins = pinsOf();
    const peopleRow = (kind) => rankedPeople(people[kind], pins[kind]).slice(0, 5).map((person) => ({
      name: person.name,
      count: person.count,
      avg: round1(person.avg),
    }));
    const outliers = films.map((film) => {
      const full = fullOf(film);
      const genre = (full.genres && full.genres[0]) || full.cluster || '';
      const row = genres.get(genre);
      if (!genre || !row || !row.count) return null;
      const rating = entry(film.id).rating;
      const genreAvg = row.sum / row.count;
      const gap = Math.abs(rating - genreAvg);
      if (gap < 2.5) return null;
      return {
        title: film.title || '',
        genre,
        rating: round1(rating),
        genre_avg: round1(genreAvg),
        gap,
      };
    }).filter(Boolean).sort((a, b) => b.gap - a.gap).slice(0, 5).map((row) => ({
      title: row.title,
      genre: row.genre,
      rating: row.rating,
      genre_avg: row.genre_avg,
    }));
    const summary = {
      rated_count: count,
      avg_rating: round1(avg),
      rating_spread: round1(Math.sqrt(variance)),
      share_high: count ? round1(ratings.filter((value) => value >= 8).length / count) : 0,
      share_low: count ? round1(ratings.filter((value) => value <= 4).length / count) : 0,
    };
    const putList = (key, list) => {
      if (list.length) summary[key] = list;
    };
    putList('genres', tasteGroups(genres, 8));
    putList('subgenres', tasteGroups(subgenres, 10));
    putList('themes', tasteGroups(themes, 10));
    if (Object.keys(tone).length) summary.tone = tone;
    if (Object.keys(intensity).length) summary.intensity = intensity;
    if (Object.keys(narrative).length) summary.narrative = narrative;
    putList('decades', tasteGroups(decades, 12));
    putList('top_films', ranked.slice(0, 10).map(filmRow));
    putList('low_films', ranked.slice().reverse().slice(0, 5).map(filmRow));
    putList('directors', peopleRow('directors'));
    putList('actors', peopleRow('actors'));
    putList('outliers', outliers);
    const keys = ['outliers', 'low_films', 'decades', 'actors', 'directors', 'themes', 'subgenres', 'genres', 'top_films'];
    const tasteBytes = () => new TextEncoder().encode(JSON.stringify(summary)).length;
    let guard = 0;
    while (tasteBytes() > 11 * 1024 && guard < 400) {
      guard += 1;
      const key = keys.find((name) => Array.isArray(summary[name]) && summary[name].length);
      if (!key) break;
      summary[key].pop();
      if (!summary[key].length) delete summary[key];
    }
    return summary;
  }

  function tasteWhen(iso, withTime) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString('de-CH');
    if (!withTime) return day;
    const clock = date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    return `${day}, ${clock}`;
  }

  function tasteErrorText(error) {
    console.error('[taste]', error);
    const code = error && error.code;
    if (code === 'not_configured') return 'Die KI ist noch nicht eingerichtet.';
    if (code === 'cooldown') {
      const clock = error.retryAt ? new Date(error.retryAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : '';
      return clock ? t('You can create a new one again from {time}.', { time: clock }) : 'Hat nicht geklappt. Bitte später nochmals versuchen.';
    }
    if (code === 'quota') return 'Für heute ist das KI-Kontingent aufgebraucht. Morgen wieder.';
    if (code === 'too_few') return 'Zu wenige Bewertungen (mindestens 15).';
    if (code === 'too_large' || code === 'bad_input') return 'Die Daten sind zu gross oder ungültig.';
    if (code === 'network') return 'Keine Verbindung.';
    return 'Hat nicht geklappt. Bitte später nochmals versuchen.';
  }

  function tasteCloudReady() {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.tasteOf || !account || !account.id) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return true;
  }

  function tasteFrame(countText) {
    const block = el('section', 'taste-block');
    const head = el('div', 'taste-head');
    head.append(el('h2', 'profile-kicker', t('AI Movie Profile')));
    if (countText) head.append(el('span', 'taste-from', countText));
    const wrap = el('div', 'section-head');
    wrap.append(head, el('span', 'section-rule'));
    block.append(wrap);
    return block;
  }

  function tasteView(source) {
    // englische Fassung, wenn die App auf Englisch steht und es sie gibt
    const taste = uiLang() === 'en' && source.en && source.en.title ? { ...source, ...source.en } : source;
    const block = el('div', 'taste-body');
    if (taste.title) block.append(el('h2', 'taste-title', taste.title));
    if (taste.taste) block.append(el('p', 'taste-copy', taste.taste));
    if (taste.character) block.append(el('p', 'taste-character', taste.character));
    if (Array.isArray(taste.tags) && taste.tags.length) {
      const tags = el('div', 'taste-tags');
      taste.tags.slice(0, 3).forEach((tag) => {
        if (tag) tags.append(el('span', 'taste-tag', String(tag)));
      });
      if (tags.childNodes.length) block.append(tags);
    }
    return block;
  }

  function tasteEyeIcon(hidden) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const eye = '<path d="M2.4 12S6.2 6.4 12 6.4 21.6 12 21.6 12 17.8 17.6 12 17.6 2.4 12 2.4 12Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><circle cx="12" cy="12" r="2.3" fill="none" stroke="currentColor" stroke-width="1.6"></circle>';
    const slash = '<path d="M5 5.2 19 18.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>';
    svg.innerHTML = hidden ? eye + slash : eye;
    return svg;
  }

  let tasteBusy = false;
  let tasteSerial = 0;

  // eigenes Profil gibt es nur auf Deutsch: auf Englisch einmalig übersetzen lassen und dazuspeichern
  function ensureTasteEnglish(slot, taste) {
    const cloud = globalThis.Cloud;
    if (uiLang() !== 'en' || !taste || !taste.title || (taste.en && taste.en.title)) return;
    if (!cloud || !cloud.translateTaste || slot._translating) return;
    slot._translating = true;
    cloud.translateTaste().then((next) => {
      slot._translating = false;
      if (!next || !next.en || !slot.isConnected || slot._taste !== taste) return;
      paintOwnTaste(slot, next);
    }).catch((error) => {
      slot._translating = false;
      console.error('[taste]', error);
    });
  }

  function paintOwnTaste(slot, taste, options) {
    const opts = options || {};
    slot._taste = taste || null;
    ensureTasteEnglish(slot, taste);
    slot.replaceChildren();
    if (!tasteCloudReady()) return;
    const count = ratedTasteFilms().length;
    const block = tasteFrame(t('From {n} ratings', { n: count }));
    if (count < 15) {
      block.append(el('p', 'taste-quiet', t('A movie profile needs 15 rated movies ({n} to go).', { n: 15 - count })));
      slot.append(block);
      if (opts.error) slot.append(el('p', 'taste-error', tasteErrorText(opts.error)));
      return;
    }
    if (!taste || !taste.title) {
      const button = el('button', 'text-line', opts.busy ? t('Creating…') : t('Create movie profile'));
      button.type = 'button';
      button.disabled = Boolean(opts.busy);
      button.addEventListener('click', () => makeTaste(slot));
      block.append(button, el('p', 'taste-quiet', 'Your ratings are sent to Google Gemini for this, without names or notes.'));
      slot.append(block);
      if (opts.error) slot.append(el('p', 'taste-error', tasteErrorText(opts.error)));
      return;
    }
    block.append(tasteView(taste));
    const made = Date.parse(taste.created_at);
    const open = !Number.isFinite(made) || Date.now() - made >= 20 * 60 * 60 * 1000;
    const hidden = Boolean(account && account.taste_hidden);
    const changed = open && !opts.busy && count >= Number(taste.rated_count || 0) + 10;
    let label = 'Regenerate';
    if (opts.busy) label = 'Creating…';
    else if (!open) {
      const until = new Date(made + 20 * 60 * 60 * 1000);
      if (!Number.isNaN(until.getTime())) label = t('from {date}', { date: `${until.getDate()}.${until.getMonth() + 1}` });
    }
    const tools = el('div', 'taste-tools');
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'taste-renew';
    again.disabled = Boolean(opts.busy) || !open;
    if (changed) again.title = 'Dein Geschmack hat sich verändert';
    const iconWrap = el('span', 'taste-icon');
    iconWrap.append(tasteRefreshIcon());
    if (changed) iconWrap.append(el('span', 'taste-dot'));
    again.append(iconWrap, el('span', 'taste-label', label));
    again.addEventListener('click', () => makeTaste(slot));
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'taste-vis';
    eye.disabled = Boolean(opts.busy);
    eye.append(tasteEyeIcon(hidden));
    eye.append(el('span', null, hidden ? 'Hidden from friends' : 'Visible to friends'));
    eye.addEventListener('click', () => toggleTasteHidden(slot));
    tools.append(again, eye);
    block.append(tools);
    slot.append(block);
    if (opts.error) slot.append(el('p', 'taste-error', tasteErrorText(opts.error)));
  }

  function tasteRefreshIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M20 12a8 8 0 1 1-2.3-5.6M20 4.8V9h-4.2');
    svg.append(path);
    return svg;
  }

  async function makeTaste(slot) {
    if (tasteBusy) return;
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.createTaste) return;
    tasteBusy = true;
    try {
      paintOwnTaste(slot, slot._taste || null, { busy: true });
      const saved = await cloud.createTaste(tasteSummary());
      const live = profileRoot() && profileRoot().querySelector('.taste-slot');
      if (live) paintOwnTaste(live, saved || null);
    } catch (error) {
      const live = profileRoot() && profileRoot().querySelector('.taste-slot');
      if (live) paintOwnTaste(live, live._taste || null, { error });
    } finally {
      tasteBusy = false;
    }
  }

  async function toggleTasteHidden(slot) {
    const cloud = globalThis.Cloud;
    if (!cloud || !cloud.setTasteHidden || tasteBusy || !account) return;
    const next = !account.taste_hidden;
    try {
      await cloud.setTasteHidden(next);
      account.taste_hidden = next;
      const live = profileRoot() && profileRoot().querySelector('.taste-slot');
      if (live) paintOwnTaste(live, (live._taste || slot._taste) || null);
    } catch (error) {
      const live = profileRoot() && profileRoot().querySelector('.taste-slot');
      if (live) paintOwnTaste(live, live._taste || null, { error });
    }
  }

  function loadOwnTaste(slot) {
    if (!tasteCloudReady()) return;
    const serial = ++tasteSerial;
    slot.dataset.serial = String(serial);
    globalThis.Cloud.tasteOf(account.id).then((taste) => {
      if (!slot.isConnected || slot.dataset.serial !== String(serial)) return;
      paintOwnTaste(slot, taste || null);
    }).catch((error) => {
      console.error('[taste]', error);
    });
  }

  function loadTheirTaste(root, personId) {
    if (!personId || !globalThis.Cloud || !globalThis.Cloud.tasteOf || !account || !account.id) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const serial = ++tasteSerial;
    root.dataset.theirTaste = String(serial);
    const token = otherToken;
    globalThis.Cloud.tasteOf(personId).then((taste) => {
      if (!root.isConnected || root.dataset.theirTaste !== String(serial)) return;
      if (token !== otherToken || viewingId !== personId) return;
      const slot = root.querySelector('.taste-slot');
      if (!slot || !taste || !taste.title) return;
      const frame = tasteFrame(taste.rated_count ? t('From {n} ratings', { n: taste.rated_count }) : '');
      frame.append(tasteView(taste));
      slot.replaceChildren(frame);
    }).catch((error) => {
      console.error('[taste]', error);
    });
  }

  function paintProfile() {
    if (document.querySelector('.profile-avatar.is-dirty')) return;
    const root = profileRoot();
    if (!root) return;
    root.classList.remove('profile-list');
    const name = (account && (account.display_name || account.username)) || 'Profil';
    const films = profileStats ? String(profileStats.films) : String(FILMS.length);
    const friends = profileStats && profileStats.friends != null
      ? String(profileStats.friends)
      : String(mutualPeople().length);
    root.replaceChildren();
    const head = el('div', 'profile-head');
    head.append(paintOwnAvatar(84), el('h1', null, name));
    root.append(head);
    const stats = el('div', 'profile-stats');
    stats.append(
      statNode(films, t('Movies')),
      statNode(friends, 'Friends', paintFriends),
      friendInviteNode(),
    );
    root.append(stats);
    paintTop(root);
    const tasteSlot = el('div', 'taste-slot');
    root.append(tasteSlot);
    paintRequests(root);
    if (profileStatus) root.append(el('p', 'profile-status', profileStatus));
    const people = personMaps();
    const split = el('div', 'profile-split');
    const left = el('div', 'profile-col');
    const right = el('div', 'profile-col');
    left.append(paintPeople('actors', 'Favorite actors', people.actors));
    right.append(paintPeople('directors', 'Favorite directors', people.directors), paintSettings());
    split.append(left, right);
    root.append(split);
    loadOwnTaste(tasteSlot);
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
    profileLists = { followers: [], following: [], requests: [], outgoing: [] };
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
    document.body.classList.remove('is-profile-color');
    lensId = null;
    lensPack = null;
    guestNet = false;
    panelList = null;
    paintLensBar();
    paintAvatarTab();
    selectedId = null;
    wall.replaceChildren();
    wall.hidden = true;
    networkEl.hidden = true;
    wishSearchList = null;
    hidePanelNow();
    document.body.classList.remove('has-selection', 'is-network', 'is-rating', 'is-profile', 'is-wish', 'is-wish-search');
    const wishBoard = document.getElementById('wish-board');
    if (wishBoard) {
      wishBoard.hidden = true;
      wishBoard.replaceChildren();
    }
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
    box.append(el('p', null, `${countWord(preview.ratings, t('Wertung'), t('Wertungen'))}, ${countWord(preview.films, t('Film'), t('Filme'))}, ${countWord(preview.corrections, t('Korrektur'), t('Korrekturen'))}`));
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
    let avatarKnown = false;
    try {
      account = await globalThis.Cloud.profile();
      if (account && !account.id) account.id = session.user.id;
      avatarKnown = Boolean(account && account.avatarKnown);
    } catch {
      const meta = session.user.user_metadata || {};
      account = {
        id: session.user.id,
        username: meta.username || '',
        display_name: meta.username || '',
        is_private: false,
      };
    }
    if (account && avatarKnown && account.avatar == null && globalThis.Cloud.ensureAvatar) {
      try {
        account.avatar = await globalThis.Cloud.ensureAvatar(account);
      } catch {
        /* leer lassen, bis ein späterer Abruf das Feld wirklich leer bestätigt */
      }
    }
    if (account && !avatarKnown) {
      const cached = readAvatarCache(account.id);
      if (cached) account.avatar = cached;
    } else if (account && account.avatar && account.avatar.outer) {
      writeAvatarCache(account.id, account.avatar);
    }
    if (account && (account.language === 'en' || account.language === 'de') && globalThis.I18n && globalThis.I18n.lang() !== account.language) {
      globalThis.I18n.set(account.language);
    }
    applyChrome();
    paintAvatarTab();
    document.body.classList.toggle('is-profile-color', profileColorOn());
    skyColours();
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
    if (!(sky && sky.running())) {
      runSky('bw', true);
      skyColours();
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
    setGateBusy(false);
    renderAuthForm(view, notice);
    runSky('bw', false);
  }

  function renderAuthForm(view, notice) {
    const card = document.getElementById('gate-card');
    if (!card) return;
    card.replaceChildren();
    const error = el('p', 'auth-error', notice || '');
    error.setAttribute('role', 'status');

    if (view === 'password') {
      card.append(authLabel(document.createElement('h1'), 'New plot twist', 'new password'));
      const first = authField('New plot twist', 'password', 'password', 'new-password', 'new password');
      const second = authField('Repeat plot twist', 'password', 'repeat', 'new-password', 'repeat password');
      const save = document.createElement('button');
      save.type = 'submit';
      authLabel(save, 'Save plot twist', 'set password');
      const form = document.createElement('form');
      form.append(first.wrap, second.wrap, error, save);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = first.input.value;
        if (password.length < 6) {
          error.textContent = t('Das Passwort ist zu kurz.');
          return;
        }
        if (password !== second.input.value) {
          error.textContent = t('Die Passwörter stimmen nicht überein.');
          return;
        }
        save.disabled = true;
        try {
          await globalThis.Cloud.updatePassword(password);
          const session = await globalThis.Cloud.getSession();
          await openSession(session, false);
        } catch (cause) {
          error.textContent = t(authText(cause));
          save.disabled = false;
        }
      });
      card.append(form);
      first.input.focus();
      return;
    }

    if (view === 'forgot') {
      card.append(authLabel(document.createElement('h1'), 'Forgot your spoiler?', 'reset password'));
      const back = document.createElement('button');
      back.type = 'button';
      authLabel(back, 'Get into your plot', 'back to sign in');
      back.addEventListener('click', () => renderAuth('in'));
      recoveryEnabled().then((enabled) => {
        if (!enabled) {
          card.insertBefore(el('p', 'auth-note', 'Melde dich bei Luciano.'), back);
          return;
        }
        const name = authField('Screen name', 'text', 'username', 'username', 'username');
        const send = document.createElement('button');
        send.type = 'submit';
        authLabel(send, 'Send link', 'reset email');
        const form = document.createElement('form');
        form.append(name.wrap, error, send);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const username = name.input.value.trim().toLowerCase();
          if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            error.textContent = t('Der Benutzername braucht 3 bis 20 Zeichen: a–z, 0–9 oder _.');
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
              error.textContent = t('Melde dich bei Luciano.');
              return;
            }
            error.textContent = t((data && data.message) || 'Falls eine bestätigte E-Mail hinterlegt ist, wurde ein Link verschickt.');
          } catch {
            error.textContent = t('Keine Verbindung.');
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
    card.append(authLabel(document.createElement('h1'), signingIn ? 'Get into your plot' : 'Create your plot', signingIn ? 'sign in' : 'register'));
    const name = authField('Screen name', 'text', 'username', 'username', 'username');
    const password = authField('Plot twist', 'password', 'password', signingIn ? 'current-password' : 'new-password', 'password');
    const form = document.createElement('form');
    form.append(name.wrap, password.wrap);
    let repeat = null;
    let mail = null;
    let nameHint = null;
    if (!signingIn) {
      repeat = authField('Repeat plot twist', 'password', 'repeat', 'new-password', 'repeat password');
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
          nameHint.textContent = t('3 bis 20 Zeichen: a–z, 0–9 oder _.');
          return;
        }
        nameHint.textContent = '';
        window.setTimeout(async () => {
          if (token !== nameToken) return;
          try {
            const free = await globalThis.Cloud.usernameAvailable(value);
            if (token !== nameToken) return;
            nameHint.textContent = free ? '' : t('Dieser Benutzername ist vergeben.');
          } catch {
            if (token !== nameToken) return;
            nameHint.textContent = t('Keine Verbindung.');
          }
        }, 400);
      });
      recoveryEnabled().then((enabled) => {
        if (!enabled || !form.isConnected) return;
        mail = authField('Backup email', 'email', 'email', 'email', 'optional, only for resets');
        form.insertBefore(mail.wrap, error);
      });
    }
    const submit = document.createElement('button');
    submit.type = 'submit';
    authLabel(submit, signingIn ? 'Roll in' : 'Create your plot', signingIn ? 'sign in' : 'register');
    const swap = document.createElement('button');
    swap.type = 'button';
    authLabel(swap, signingIn ? 'Create your plot' : 'Get into your plot', signingIn ? 'register' : 'sign in');
    swap.addEventListener('click', () => renderAuth(signingIn ? 'up' : 'in'));
    form.append(error, submit, swap);
    if (signingIn) {
      const forgot = document.createElement('button');
      forgot.type = 'button';
      authLabel(forgot, 'Forgot your spoiler?', 'reset password');
      forgot.addEventListener('click', () => renderAuth('forgot'));
      form.append(forgot);
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = name.input.value.trim().toLowerCase();
      const secret = password.input.value;
      if (!username || !secret) {
        error.textContent = t('Bitte Benutzername und Passwort eintragen.');
        return;
      }
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        error.textContent = t('Der Benutzername braucht 3 bis 20 Zeichen: a–z, 0–9 oder _.');
        return;
      }
      if (secret.length < 6) {
        error.textContent = t('Das Passwort ist zu kurz.');
        return;
      }
      if (repeat && secret !== repeat.input.value) {
        error.textContent = t('Die Passwörter stimmen nicht überein.');
        return;
      }
      if (!signingIn && nameHint && nameHint.textContent === t('Dieser Benutzername ist vergeben.')) {
        error.textContent = t('Dieser Benutzername ist vergeben.');
        return;
      }
      const email = mail && mail.input.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error.textContent = t('Die E-Mail sieht ungültig aus.');
        return;
      }
      submit.disabled = true;
      setGateBusy(true);
      // Registrieren: die gerade sichtbaren Farben der Kugel werden zur persönlichen Profilkugel
      const caught = null;
      try {
        if (signingIn) {
          const data = await globalThis.Cloud.signIn(username, secret);
          await openSession(data.session, false);
          return;
        }
        const data = await globalThis.Cloud.signUp(username, secret, email || undefined);
        if (!data || !data.session) {
          error.textContent = t('Die Anmeldung ist noch nicht frei. Schalte die E-Mail-Bestätigung im Supabase-Dashboard aus.');
          submit.disabled = false;
          setGateBusy(false);
          return;
        }
        if (globalThis.SphereColours && globalThis.Cloud.saveAvatar) {
          const colours = globalThis.SphereColours;
          const vivid = caught && caught.every((lab) => lab[0] > 0.2) && caught.some((lab) => colours.chroma(lab) > 0.05);
          try {
            await globalThis.Cloud.saveAvatar(colours.waveToAvatar(vivid ? caught : colours.colourWave()));
          } catch {
            /* ohne gespeicherte Farben vergibt ensureAvatar beim Laden eine Zufallskugel */
          }
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
        error.textContent = t(authText(cause));
        submit.disabled = false;
        setGateBusy(false);
      }
    });
    form.append(el('p', 'auth-note', 'Your notes stay behind the scenes.'));
    card.append(form);
    name.input.focus();
  }

  async function enterAccount() {
    lockScreen();
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
    if (!session) {
      if (!document.querySelector('#gate-card form')) renderAuth('in');
      return;
    }
    await openSession(session, false);
  }

  async function boot() {
    preloadGrime();
    wall.hidden = true;
    networkEl.hidden = true;
    if (needsProfile()) lockScreen();
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
