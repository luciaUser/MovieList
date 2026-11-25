(function attachNetwork(root) {
  // Die Weltfläche passt sich dem Seitenverhältnis des Bildschirms an (lange Seite 4000).
  const WORLD_LONG = 4000;
  const VIEW_MARGIN = 0.06;
  let WORLD_W = 2500;
  let WORLD_H = 4000;

  function readStored() {
    const store = root.Store;
    const current = store && store.current();
    const positions = current && current.positions;
    return positions && typeof positions === 'object' && !Array.isArray(positions) ? positions : {};
  }

  function writeStored(stored) {
    const store = root.Store;
    if (store) store.savePositions(stored);
  }

  function create(options) {
    const stage = options.stage;
    const world = stage.querySelector('.net-world');
    const aspect = (root.SimilarityConfig && root.SimilarityConfig.layout && root.SimilarityConfig.layout.aspect) || 1.6;
    const limits = (root.SimilarityConfig && root.SimilarityConfig.network) || { farBelow: 0.42, nearFrom: 0.95 };
    let films = options.films || [];
    let graphNodes = new Map();
    let stored = readStored();
    let points = new Map();
    let buttons = new Map();
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let minScale = 0.2;
    let maxScale = 4;
    let userMoved = false;
    let ratingOn = false;
    let compareRatings = null;
    let level = 'far';
    let settleTimer = 0;
    const pointers = new Map();
    let pinch = null;
    let suppressClick = false;
    let skipClick = false;
    let focus = { lit: null, edges: [], hot: null };
    let motion = 0;
    let lens = null;
    let lensToken = 0;
    let framed = null;

    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'net-lines');
    lines.setAttribute('viewBox', `0 0 ${WORLD_W} ${WORLD_H}`);
    lines.setAttribute('width', String(WORLD_W));
    lines.setAttribute('height', String(WORLD_H));
    world.append(lines);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'net-labels');
    svg.setAttribute('viewBox', `0 0 ${WORLD_W} ${WORLD_H}`);
    svg.setAttribute('width', String(WORLD_W));
    svg.setAttribute('height', String(WORLD_H));
    world.append(svg);

    function merged(film) {
      const facets = root.FILM_FACETS || {};
      const merge = root.Facets && root.Facets.mergeFilm;
      return merge ? merge(film, facets[film.id]) : film;
    }

    function mergedList() {
      return films.map(merged);
    }

    // Anzeige-Transformation: Rohpositionen gleichmässig in die Weltfläche einpassen,
    // bei Bedarf um 90° gedreht, damit die lange Seite der Karte zur langen Seite des Bildschirms passt.
    let fitView = null;

    function sizeWorld() {
      const rect = viewSize();
      const width = rect.width;
      const height = rect.height - chromeTop();
      // Unsichtbare Karte (anderer Tab): Grösse beibehalten, sie wird beim Anzeigen neu eingepasst.
      if (width < 50 || height < 50) return;
      if (width >= height) {
        WORLD_W = WORLD_LONG;
        WORLD_H = Math.round(WORLD_LONG * (height / width));
      } else {
        WORLD_H = WORLD_LONG;
        WORLD_W = Math.round(WORLD_LONG * (width / height));
      }
      world.style.width = `${WORLD_W}px`;
      world.style.height = `${WORLD_H}px`;
      [lines, svg].forEach((layer) => {
        layer.setAttribute('viewBox', `0 0 ${WORLD_W} ${WORLD_H}`);
        layer.setAttribute('width', String(WORLD_W));
        layer.setAttribute('height', String(WORLD_H));
      });
    }

    function computeView(source) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      source.forEach((point) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
      if (!Number.isFinite(minX)) {
        minX = 0;
        maxX = aspect;
        minY = 0;
        maxY = 1;
      }
      const spanX = Math.max(maxX - minX, 1e-6);
      const spanY = Math.max(maxY - minY, 1e-6);
      const mapPortrait = spanY > spanX;
      const worldPortrait = WORLD_H > WORLD_W;
      const rotate = mapPortrait !== worldPortrait && Math.abs(Math.log(spanY / spanX)) > 0.15;
      const w = rotate ? spanY : spanX;
      const h = rotate ? spanX : spanY;
      const innerW = WORLD_W * (1 - (2 * VIEW_MARGIN));
      const innerH = WORLD_H * (1 - (2 * VIEW_MARGIN));
      const factor = Math.min(innerW / w, innerH / h);
      return {
        minX,
        maxX,
        minY,
        maxY,
        rotate,
        factor,
        ox: (WORLD_W - (w * factor)) / 2,
        oy: (WORLD_H - (h * factor)) / 2,
      };
    }

    function worldOf(point) {
      if (!fitView) fitView = computeView(points);
      const view = fitView;
      const u = view.rotate ? point.y - view.minY : point.x - view.minX;
      const v = view.rotate ? view.maxX - point.x : point.y - view.minY;
      return {
        x: view.ox + (u * view.factor),
        y: view.oy + (v * view.factor),
      };
    }

    function placeAllButtons() {
      buttons.forEach((button, id) => {
        const point = points.get(id);
        if (!point) return;
        const at = worldOf(point);
        button.style.left = `${at.x}px`;
        button.style.top = `${at.y}px`;
      });
      if (lens) paintLensMembers();
    }

    function refit(source) {
      sizeWorld();
      fitView = computeView(source || points);
      placeAllButtons();
      buildLabels();
      drawEdges();
    }

    // Positionen, die früher hart auf die Kante gesetzt wurden, gelten als ungültig und werden neu platziert.
    function onEdge(point) {
      const eps = 1e-6;
      return point.x <= eps || point.y <= eps || point.x >= aspect - eps || point.y >= 1 - eps;
    }

    function remember(id, point) {
      points.set(id, { x: point.x, y: point.y });
    }

    function placeMissing() {
      const layout = root.Layout;
      const list = mergedList();
      const known = new Map();
      list.forEach((film) => {
        const point = points.get(film.id);
        if (point) known.set(film.id, point);
      });
      let changed = false;
      list.forEach((film) => {
        if (known.has(film.id) || !layout) return;
        const placed = layout.placeOne(film, list, known);
        known.set(film.id, { x: placed.x, y: placed.y });
        remember(film.id, placed);
        stored[film.id] = { x: placed.x, y: placed.y };
        changed = true;
      });
      if (changed) writeStored(stored);
    }

    function collectPoints() {
      points = new Map();
      let repaired = false;
      films.forEach((film) => {
        const saved = stored[film.id];
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          if (!onEdge(saved)) {
            remember(film.id, saved);
            return;
          }
          delete stored[film.id];
          repaired = true;
        }
        const node = graphNodes.get(film.id);
        if (node && Number.isFinite(node.x) && Number.isFinite(node.y) && !onEdge(node)) remember(film.id, node);
      });
      if (repaired) writeStored(stored);
      placeMissing();
      sizeWorld();
      fitView = computeView(points);
    }

    function loadGraph(graph) {
      graphNodes = new Map((graph.nodes || []).map((node) => [node.id, node]));
      collectPoints();
    }

    function genreOf(film) {
      return (merged(film).genres || [])[0] || '';
    }

    function markColor(film) {
      if (compareRatings) {
        const score = compareRatings.has(film.id) ? compareRatings.get(film.id) : null;
        return options.ratingColor(score);
      }
      if (ratingOn) return options.ratingColor(options.entry(film.id).rating);
      const colors = (root.SimilarityConfig && root.SimilarityConfig.layout && root.SimilarityConfig.layout.genreColors) || {};
      return colors[genreOf(film)] || '#c8c8c8';
    }

    function buttonFor(film) {
      const point = points.get(film.id);
      const at = point ? worldOf(point) : { x: WORLD_W / 2, y: WORLD_H / 2 };
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'net-film';
      button.dataset.id = film.id;
      button.style.left = `${at.x}px`;
      button.style.top = `${at.y}px`;
      button.setAttribute('aria-label', film.title);
      const dot = document.createElement('span');
      dot.className = 'net-dot';
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.style.setProperty('-webkit-user-drag', 'none');
      image.decoding = 'async';
      image.loading = 'lazy';
      const tint = document.createElement('span');
      tint.className = 'tint';
      const score = document.createElement('span');
      score.className = 'net-score';
      button.append(dot, image, tint, score);
      button.addEventListener('click', () => {
        if (suppressClick || skipClick) {
          skipClick = false;
          return;
        }
        options.onChoose(film);
      });
      return button;
    }

    function buildFilms() {
      buttons.forEach((button) => button.remove());
      buttons = new Map();
      films.forEach((film) => {
        const button = buttonFor(film);
        buttons.set(film.id, button);
        world.append(button);
      });
      paint();
    }

    function centroid(rows) {
      if (!rows.length) return null;
      const cx = rows.reduce((sum, row) => sum + row.x, 0) / rows.length;
      const cy = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
      const mean = rows.reduce((sum, row) => sum + Math.hypot(row.x - cx, row.y - cy), 0) / rows.length;
      const body = mean === 0 ? rows : rows.filter((row) => Math.hypot(row.x - cx, row.y - cy) <= mean * 2.5);
      const used = body.length ? body : rows;
      return {
        x: used.reduce((sum, row) => sum + row.x, 0) / used.length,
        y: used.reduce((sum, row) => sum + row.y, 0) / used.length,
      };
    }

    function label(className, text, at) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      node.setAttribute('class', className);
      node.setAttribute('x', at.x.toFixed(1));
      node.setAttribute('y', at.y.toFixed(1));
      node.setAttribute('text-anchor', 'middle');
      node.setAttribute('dominant-baseline', 'middle');
      node.textContent = text;
      return node;
    }

    function buildLabels() {
      svg.replaceChildren();
      const groups = new Map();
      const subs = new Map();
      films.forEach((film) => {
        const full = merged(film);
        const point = points.get(film.id);
        if (!point) return;
        const at = worldOf(point);
        const genre = (full.genres || [])[0];
        if (!genre) return;
        if (!groups.has(genre)) groups.set(genre, []);
        groups.get(genre).push(at);
        const sub = (full.subgenres || [])[0];
        if (!sub) return;
        const key = `${genre}\0${sub}`;
        if (!subs.has(key)) subs.set(key, { genre, sub, rows: [] });
        subs.get(key).rows.push(at);
      });
      [...groups.entries()]
        .map(([genre, rows]) => ({ genre, rows, at: centroid(rows) }))
        .filter((item) => item.at)
        .sort((a, b) => b.rows.length - a.rows.length || a.genre.localeCompare(b.genre, 'de'))
        .forEach((item) => {
          const node = label('net-genre', item.genre, item.at);
          if (item.rows.length < 3) node.classList.add('is-small');
          svg.append(node);
        });
      [...subs.values()]
        .filter((item) => item.rows.length >= 3)
        .map((item) => ({ ...item, at: centroid(item.rows) }))
        .filter((item) => item.at)
        .sort((a, b) => b.rows.length - a.rows.length || a.sub.localeCompare(b.sub, 'de'))
        .forEach((item) => {
          svg.append(label('net-sub', item.sub, item.at));
        });
    }

    function hits(box, kept) {
      return kept.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
    }

    function collideLabels() {
      const kept = [];
      [...svg.querySelectorAll('.net-genre')].forEach((node) => {
        node.classList.remove('is-hidden');
        if (getComputedStyle(node).display === 'none') return;
        const box = node.getBoundingClientRect();
        if (!box.width || hits(box, kept)) {
          node.classList.add('is-hidden');
          return;
        }
        kept.push(box);
      });
      [...svg.querySelectorAll('.net-sub')].forEach((node) => {
        node.classList.remove('is-hidden');
        if (getComputedStyle(node).display === 'none') return;
        const box = node.getBoundingClientRect();
        if (!box.width || hits(box, kept)) {
          node.classList.add('is-hidden');
          return;
        }
        kept.push(box);
      });
    }

    function levelFor(value) {
      if (value < limits.farBelow) return 'far';
      if (value < limits.nearFrom) return 'mid';
      return 'near';
    }

    function ensureImages() {
      if (level === 'far') return;
      buttons.forEach((button, id) => {
        const image = button.querySelector('img');
        if (image.getAttribute('src')) return;
        const film = films.find((item) => item.id === id);
        if (!film) return;
        image.src = options.posterSrc(film);
      });
    }

    function applyClass() {
      const next = levelFor(scale);
      if (next !== level) {
        level = next;
        world.classList.remove('z-far', 'z-mid', 'z-near');
        world.classList.add(`z-${level}`);
        ensureImages();
      }
    }

    function applyTransform() {
      world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function viewSize() {
      return stage.getBoundingClientRect();
    }

    function chromeTop() {
      const header = document.querySelector('header');
      if (!header) return 0;
      const rect = viewSize();
      return Math.max(0, header.getBoundingClientRect().bottom - rect.top);
    }

    function limitsOfScale() {
      const rect = viewSize();
      const availH = Math.max(120, rect.height - chromeTop());
      const fit = Math.min(rect.width / WORLD_W, availH / WORLD_H) * 0.96;
      minScale = fit;
      const poster = 40;
      maxScale = Math.max(minScale, (Math.min(rect.width, rect.height) * 0.78) / poster);
    }

    function clampPan() {
      const rect = viewSize();
      const top = chromeTop();
      const width = WORLD_W * scale;
      const height = WORLD_H * scale;
      const availH = Math.max(120, rect.height - top);
      if (width <= rect.width) tx = (rect.width - width) / 2;
      else tx = Math.min(0, Math.max(rect.width - width, tx));
      if (height <= availH) ty = top + (availH - height) / 2;
      else ty = Math.min(top, Math.max(rect.height - height, ty));
    }

    function fit() {
      limitsOfScale();
      scale = minScale;
      clampPan();
      applyClass();
      applyTransform();
    }

    function zoomAt(clientX, clientY, nextScale) {
      const rect = viewSize();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const clamped = Math.min(maxScale, Math.max(minScale, nextScale));
      const wx = (px - tx) / scale;
      const wy = (py - ty) / scale;
      scale = clamped;
      tx = px - wx * scale;
      ty = py - wy * scale;
      clampPan();
      applyTransform();
      scheduleLens();
    }

    function settle() {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        applyClass();
        drawEdges();
        requestAnimationFrame(() => collideLabels());
      }, 140);
    }

    function worldPoint(id) {
      const point = points.get(id);
      return point ? worldOf(point) : null;
    }

    let glideToken = 0;
    let endGlide = null;

    function placeButton(id, point) {
      const button = buttons.get(id);
      const real = point || points.get(id);
      if (!button || !real) return;
      const at = worldOf(real);
      button.style.left = `${at.x}px`;
      button.style.top = `${at.y}px`;
    }

    function glide(nextMap) {
      if (endGlide) endGlide();
      const token = glideToken + 1;
      glideToken = token;
      const from = new Map();
      const to = new Map();
      films.forEach((film) => {
        const target = nextMap && nextMap[film.id];
        if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
        const current = points.get(film.id) || target;
        from.set(film.id, { x: current.x, y: current.y });
        to.set(film.id, { x: target.x, y: target.y });
      });
      const targetView = new Map(points);
      to.forEach((point, id) => targetView.set(id, point));
      sizeWorld();
      fitView = computeView(targetView);
      const finish = () => {
        if (glideToken !== token) return;
        endGlide = null;
        to.forEach((point, id) => {
          remember(id, point);
        });
        placeAllButtons();
        buildLabels();
        drawEdges();
        paint();
      };
      endGlide = finish;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !to.size) {
        finish();
        return;
      }
      const started = performance.now();
      const step = (now) => {
        if (glideToken !== token) return;
        const t = Math.min(1, (now - started) / 600);
        const ease = 1 - ((1 - t) ** 3);
        to.forEach((point, id) => {
          const origin = from.get(id);
          points.set(id, {
            x: origin.x + ((point.x - origin.x) * ease),
            y: origin.y + ((point.y - origin.y) * ease),
          });
          if (lens && lens.ids.has(id)) return;
          placeButton(id);
        });
        if (lens) paintLensMembers();
        else drawEdges();
        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        finish();
      };
      requestAnimationFrame(step);
    }

    function starEdges(ids, style) {
      const rows = (ids || []).map((id) => ({ id, at: worldPoint(id) })).filter((row) => row.at);
      if (rows.length < 2) return [];
      const cx = rows.reduce((sum, row) => sum + row.at.x, 0) / rows.length;
      const cy = rows.reduce((sum, row) => sum + row.at.y, 0) / rows.length;
      let hub = rows[0];
      let best = Infinity;
      rows.forEach((row) => {
        const dist = Math.hypot(row.at.x - cx, row.at.y - cy);
        if (dist < best) {
          best = dist;
          hub = row;
        }
      });
      return rows.filter((row) => row.id !== hub.id).map((row) => ({
        source: hub.id,
        target: row.id,
        score: 0.55,
        style: style || 'content',
      }));
    }

    function displayWorld(id) {
      const real = worldPoint(id);
      if (!real || !lens || !lens.slots || !(lens.amount > 0) || !lens.slots.has(id)) return real;
      const pull = lens.slots.get(id);
      return {
        x: real.x + ((pull.x - real.x) * lens.amount),
        y: real.y + ((pull.y - real.y) * lens.amount),
      };
    }

    function lensBlend() {
      const span = limits.nearFrom - minScale;
      if (span <= 0.0001) return scale >= limits.nearFrom ? 1 : 0;
      const raw = Math.min(1, Math.max(0, (scale - minScale) / span));
      return raw * raw * (3 - (2 * raw));
    }

    function panelFree() {
      const rect = viewSize();
      const top = chromeTop();
      const panel = document.getElementById('panel');
      const open = Boolean(panel && !panel.hidden && panel.getClientRects().length);
      if (!open) {
        return { open: false, left: 0, top, right: rect.width, bottom: rect.height, axis: null };
      }
      const box = panel.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      const panelLeft = box.left - stageBox.left;
      const panelTop = box.top - stageBox.top;
      const phone = box.width > rect.width * 0.75;
      if (phone) {
        return {
          open: true,
          left: 0,
          top,
          right: rect.width,
          bottom: Math.max(top + 80, panelTop - 12),
          axis: 'y',
        };
      }
      return {
        open: true,
        left: 0,
        top,
        right: Math.max(80, panelLeft - 12),
        bottom: rect.height,
        axis: 'x',
      };
    }

    function dodgeGoal(center, slots, free, view) {
      const identity = { sx: 1, sy: 1, dx: 0, dy: 0, nx: 0, ny: 0 };
      if (!free.open) return identity;
      let minX = 0;
      let maxX = 0;
      let minY = 0;
      let maxY = 0;
      slots.forEach((at, id) => {
        if (id === lens.centerId) return;
        minX = Math.min(minX, at.x - center.x);
        maxX = Math.max(maxX, at.x - center.x);
        minY = Math.min(minY, at.y - center.y);
        maxY = Math.max(maxY, at.y - center.y);
      });
      const pad = 26 / Math.max(view.scale, 1e-4);
      const edge = {
        left: (free.left - view.tx) / view.scale,
        right: (free.right - view.tx) / view.scale,
        top: (free.top - view.ty) / view.scale,
        bottom: (free.bottom - view.ty) / view.scale,
      };
      if (free.axis === 'y') {
        const span = Math.max(maxY, 1);
        const room = edge.bottom - pad - center.y;
        const sy = Math.max(0.7, Math.min(1, room / span));
        const still = center.y + (maxY * sy) + pad - edge.bottom;
        const shift = still > 0 ? -still : 0;
        const cap = span * 0.22;
        const film = Math.max(-cap, Math.min(cap, shift));
        const topRoom = center.y + film + (minY * sy) - pad - edge.top;
        const lift = topRoom < 0 ? -topRoom : 0;
        return { sx: 1, sy, dx: 0, dy: film + lift, nx: 0, ny: shift - film };
      }
      const span = Math.max(maxX, 1);
      const room = edge.right - pad - center.x;
      const sx = Math.max(0.7, Math.min(1, room / span));
      const still = center.x + (maxX * sx) + pad - edge.right;
      const shift = still > 0 ? -still : 0;
      const cap = span * 0.22;
      const film = Math.max(-cap, Math.min(cap, shift));
      const leftRoom = center.x + film + (minX * sx) - pad - edge.left;
      const push = leftRoom < 0 ? -leftRoom : 0;
      return { sx, sy: 1, dx: film + push, dy: 0, nx: shift - film, ny: 0 };
    }

    function approachFit(current, goal, ease) {
      if (!current || !ease) return Object.assign({ stamp: performance.now() }, goal);
      const now = performance.now();
      const dt = Math.min(50, now - (current.stamp || now));
      const gain = 1 - Math.exp(-dt / 110);
      const next = { stamp: now };
      let pending = false;
      ['sx', 'sy', 'dx', 'dy', 'nx', 'ny'].forEach((key) => {
        const from = Number.isFinite(current[key]) ? current[key] : goal[key];
        const value = from + ((goal[key] - from) * gain);
        const close = Math.abs(goal[key] - value) < 0.001;
        next[key] = close ? goal[key] : value;
        if (!close) pending = true;
      });
      if (pending && lens) requestAnimationFrame(() => { if (lens) paintLensMembers(); });
      return next;
    }

    function applyFit(slots, center, fit) {
      const next = new Map();
      slots.forEach((at, id) => {
        const neighbor = id !== lens.centerId;
        next.set(id, {
          x: center.x + ((at.x - center.x) * fit.sx) + fit.dx + (neighbor ? fit.nx : 0),
          y: center.y + ((at.y - center.y) * fit.sy) + fit.dy + (neighbor ? fit.ny : 0),
        });
      });
      return next;
    }

    function computeSlots(center, radius) {
      const map = new Map();
      map.set(lens.centerId, center);
      const items = lens.neighbors.map((item, index) => {
        const at = worldPoint(item.id);
        const spread = Math.hypot(at ? at.x - center.x : 0, at ? at.y - center.y : 0);
        const angle = at && spread >= 1
          ? Math.atan2(at.y - center.y, at.x - center.x)
          : (index / Math.max(lens.neighbors.length, 1)) * Math.PI * 2;
        return { id: item.id, score: Number(item.score) || 0, angle };
      });
      const tight = items.length > 1 && (2 * Math.PI * radius) / items.length < 52;
      const ranked = items.slice().sort((a, b) => b.score - a.score);
      const outer = new Set();
      if (tight) ranked.slice(Math.ceil(ranked.length / 2)).forEach((item) => outer.add(item.id));
      const scores = items.map((item) => item.score);
      const max = Math.max(...scores, 1e-6);
      const min = Math.min(...scores);
      items.forEach((item) => {
        const likeness = (item.score - min) / Math.max(max - min, 1e-6);
        const ring = outer.has(item.id) ? 1.22 : 0.86;
        const dist = radius * ring * (1.06 - (0.18 * likeness));
        map.set(item.id, {
          x: center.x + (Math.cos(item.angle) * dist),
          y: center.y + (Math.sin(item.angle) * dist),
        });
      });
      return map;
    }

    function paintLensMembers() {
      if (!lens) return;
      const center = worldPoint(lens.centerId);
      if (!center) return;
      const rect = viewSize();
      if (rect.width < 50 || rect.height < 50) return;
      const view = framed || { tx, ty, scale };
      const free = panelFree();
      const key = [free.open, Math.round(free.left), Math.round(free.top), Math.round(free.right), Math.round(free.bottom)].join(':');
      if (lens.freeKey !== key) {
        if (lens.freeKey != null && !framed) lens.easeDodge = true;
        lens.freeKey = key;
      }
      const fullShort = Math.min(rect.width, rect.height);
      const freeShort = Math.max(80, Math.min(free.right - free.left, free.bottom - free.top));
      const radius = (0.3 * (free.open ? freeShort : fullShort)) / Math.max(view.scale, 1e-4);
      const raw = computeSlots(center, radius);
      const goal = dodgeGoal(center, raw, free, view);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const ease = Boolean(lens.easeDodge) && !framed && !reduce;
      lens.fit = approachFit(lens.fit, goal, ease);
      if (!ease || ['sx', 'sy', 'dx', 'dy', 'nx', 'ny'].every((key) => lens.fit[key] === goal[key])) {
        lens.easeDodge = false;
      }
      lens.slots = applyFit(raw, center, lens.fit);
      lens.amount = lensBlend() * lens.anim;
      lens.ids.forEach((id) => {
        const at = displayWorld(id);
        const button = buttons.get(id);
        if (!button || !at) return;
        button.style.left = `${at.x}px`;
        button.style.top = `${at.y}px`;
      });
      drawEdges();
    }

    function scheduleLens() {
      if (!lens || lens.scheduled) return;
      lens.scheduled = true;
      requestAnimationFrame(() => {
        if (!lens) return;
        lens.scheduled = false;
        paintLensMembers();
      });
    }

    function snapLensHome() {
      const ids = lens ? [...lens.ids] : [];
      lens = null;
      lensToken += 1;
      ids.forEach((id) => placeButton(id));
    }

    function animateLens(from, to) {
      const token = lensToken + 1;
      lensToken = token;
      if (!lens) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        lens.anim = to;
        paintLensMembers();
        return;
      }
      const started = performance.now();
      const step = (now) => {
        if (token !== lensToken || !lens) return;
        if (stage.hidden || viewSize().width < 50) {
          snapLensHome();
          return;
        }
        const t = Math.min(1, (now - started) / 400);
        const ease = 1 - ((1 - t) ** 3);
        lens.anim = from + ((to - from) * ease);
        paintLensMembers();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    function sameLens(next) {
      if (!lens || lens.centerId !== next.centerId) return false;
      if (lens.neighbors.length !== next.neighbors.length) return false;
      const ids = new Set(lens.neighbors.map((item) => item.id));
      return next.neighbors.every((item) => ids.has(item.id));
    }

    function beginLens(next) {
      if (lens && sameLens(next)) {
        lens.neighbors = next.neighbors;
        paintLensMembers();
        return;
      }
      if (lens) snapLensHome();
      lens = {
        centerId: next.centerId,
        neighbors: next.neighbors,
        ids: new Set([next.centerId].concat(next.neighbors.map((item) => item.id))),
        anim: 0,
        amount: 0,
        slots: null,
        scheduled: false,
      };
      animateLens(0, 1);
    }

    function endLens() {
      if (!lens) return;
      const token = lensToken + 1;
      lensToken = token;
      const from = lens.anim;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || from <= 0) {
        snapLensHome();
        return;
      }
      const started = performance.now();
      const step = (now) => {
        if (token !== lensToken || !lens) return;
        if (stage.hidden || viewSize().width < 50) {
          snapLensHome();
          drawEdges();
          return;
        }
        const t = Math.min(1, (now - started) / 400);
        const ease = 1 - ((1 - t) ** 3);
        lens.anim = from * (1 - ease);
        paintLensMembers();
        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        if (token !== lensToken) return;
        snapLensHome();
        drawEdges();
      };
      requestAnimationFrame(step);
    }

    function drawEdges() {
      lines.replaceChildren();
      (focus.edges || []).forEach((edge) => {
        const from = displayWorld(edge.source);
        const to = displayWorld(edge.target);
        if (!from || !to) return;
        const hot = focus.hot === edge.target || focus.hot === edge.source;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', from.x.toFixed(1));
        line.setAttribute('y1', from.y.toFixed(1));
        line.setAttribute('x2', to.x.toFixed(1));
        line.setAttribute('y2', to.y.toFixed(1));
        line.setAttribute('stroke', hot ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.7)');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('stroke-linecap', 'round');
        if (edge.style === 'director') {
          line.setAttribute('stroke-dasharray', `${(7 / scale).toFixed(2)} ${(6 / scale).toFixed(2)}`);
        } else if (edge.style === 'cast') {
          line.setAttribute('stroke-dasharray', `${(1.4 / scale).toFixed(2)} ${(6 / scale).toFixed(2)}`);
        }
        lines.append(line);
      });
    }

    function setFocus(spec) {
      if (!spec || !spec.lit || !spec.lit.length) {
        focus = { lit: null, edges: [], hot: null };
      } else {
        focus = {
          lit: new Set(spec.lit),
          edges: spec.star ? starEdges(spec.lit, spec.style) : (spec.edges || []),
          hot: spec.hot || null,
        };
      }
      world.classList.toggle('is-focus', Boolean(focus.lit && focus.lit.size));
      const nextLens = spec && !spec.star && spec.edges && spec.edges.length
        ? {
          centerId: spec.edges[0].source,
          neighbors: spec.edges.map((edge) => ({ id: edge.target, score: edge.score || 0 })),
        }
        : null;
      if (nextLens) beginLens(nextLens);
      else endLens();
      drawEdges();
      paint();
    }

    function cancelMotion() {
      motion += 1;
      framed = null;
    }

    function frame(ids, opts) {
      const rows = (ids || []).map(worldPoint).filter(Boolean);
      if (!rows.length) return;
      cancelMotion();
      limitsOfScale();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      rows.forEach((row) => {
        minX = Math.min(minX, row.x);
        minY = Math.min(minY, row.y);
        maxX = Math.max(maxX, row.x);
        maxY = Math.max(maxY, row.y);
      });
      minX -= 80;
      maxX += 80;
      minY -= 110;
      maxY += 110;
      const rect = viewSize();
      const headerPad = 84;
      const free = panelFree();
      let availW = Math.max(120, rect.width - 48);
      let availH = Math.max(120, rect.height - headerPad - 36);
      let viewX = rect.width / 2;
      let viewY = headerPad + ((rect.height - headerPad) / 2);
      if (free.open) {
        availW = Math.max(120, free.right - free.left);
        availH = Math.max(120, free.bottom - free.top);
        viewX = (free.left + free.right) / 2;
        viewY = (free.top + free.bottom) / 2;
      }
      let next = Math.min(availW / Math.max(40, maxX - minX), availH / Math.max(40, maxY - minY));
      if (opts && opts.minScale) next = Math.max(next, opts.minScale);
      next = Math.min(maxScale, Math.max(minScale, next));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const start = { tx, ty, scale };
      tx = viewX - (cx * next);
      ty = viewY - (cy * next);
      scale = next;
      clampPan();
      const target = { tx, ty, scale };
      framed = target;
      tx = start.tx;
      ty = start.ty;
      scale = start.scale;
      userMoved = true;
      const token = motion;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const begun = performance.now();
      const step = (now) => {
        if (token !== motion) return;
        const t = reduce ? 1 : Math.min(1, (now - begun) / 400);
        const ease = 1 - (1 - t) ** 3;
        tx = start.tx + (target.tx - start.tx) * ease;
        ty = start.ty + (target.ty - start.ty) * ease;
        scale = start.scale + (target.scale - start.scale) * ease;
        clampPan();
        applyTransform();
        if (lens) paintLensMembers();
        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        tx = target.tx;
        ty = target.ty;
        scale = target.scale;
        framed = null;
        clampPan();
        applyClass();
        applyTransform();
        if (lens) paintLensMembers();
        else drawEdges();
        requestAnimationFrame(() => collideLabels());
      };
      requestAnimationFrame(step);
    }

    function paint() {
      buttons.forEach((button, id) => {
        const film = films.find((item) => item.id === id);
        if (!film) return;
        const row = options.entry(id);
        const score = compareRatings
          ? (compareRatings.has(id) ? compareRatings.get(id) : null)
          : row.rating;
        button.classList.toggle('is-selected', id === options.selectedId());
        button.classList.toggle('is-lit', Boolean(focus.lit && focus.lit.has(id)));
        button.classList.toggle('is-favorite', Boolean(row.favorite));
        button.classList.toggle('is-rated', score != null);
        button.classList.toggle('is-dim', Boolean(compareRatings) && score == null);
        button.style.setProperty('--mark', markColor(film));
        const tint = button.querySelector('.tint');
        tint.style.background = score == null ? '' : options.ratingColor(score);
        if (options.paintWear) options.paintWear(button, score);
        button.querySelector('.net-score').textContent = score == null
          ? ''
          : `★  ${score.toFixed(1).replace('.', ',')}`;
        const image = button.querySelector('img');
        if (focus.lit && focus.lit.has(id) && !image.getAttribute('src')) {
          const src = options.posterSrc(film);
          if (src) image.src = src;
        } else if (image.getAttribute('src')) {
          const src = options.posterSrc(film);
          if (src && image.src !== src && !src.startsWith('data:')) image.src = src;
        }
      });
    }

    function reveal(id) {
      const button = buttons.get(id);
      if (!button) return;
      const rect = viewSize();
      const x = parseFloat(button.style.left);
      const y = parseFloat(button.style.top);
      tx = rect.width / 2 - x * scale;
      ty = rect.height / 2 - y * scale;
      clampPan();
      applyTransform();
      userMoved = true;
      settle();
    }

    function seat(film) {
      if (points.has(film.id)) return;
      const saved = stored[film.id];
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        remember(film.id, saved);
        return;
      }
      const node = graphNodes.get(film.id);
      if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
        remember(film.id, node);
        return;
      }
      const layout = root.Layout;
      if (!layout) return;
      const list = mergedList();
      const known = new Map(points);
      known.delete(film.id);
      const placed = layout.placeOne(merged(film), list, known);
      remember(film.id, placed);
      stored[film.id] = { x: placed.x, y: placed.y };
      writeStored(stored);
    }

    function addFilm(film) {
      if (!films.includes(film)) films = films.concat(film);
      seat(film);
      if (!buttons.has(film.id)) {
        const button = buttonFor(film);
        buttons.set(film.id, button);
        world.append(button);
      }
      refit();
      paint();
      ensureImages();
      settle();
    }

    function moveFilm(film) {
      const layout = root.Layout;
      if (!layout) return null;
      if (!films.includes(film)) films = films.concat(film);
      const known = new Map(points);
      known.delete(film.id);
      const placed = layout.placeOne(merged(film), mergedList(), known);
      remember(film.id, placed);
      stored[film.id] = { x: placed.x, y: placed.y };
      writeStored(stored);
      refit();
      paint();
      return placed;
    }

    function refresh() {
      buildLabels();
      paint();
      requestAnimationFrame(() => collideLabels());
    }

    function followPanel() {
      const free = panelFree();
      if (!free.open) return;
      const id = lens && lens.centerId;
      const center = id ? worldPoint(id) : null;
      if (center) {
        if (free.axis === 'y') ty = ((free.top + free.bottom) / 2) - (center.y * scale);
        else tx = ((free.left + free.right) / 2) - (center.x * scale);
        clampPan();
        applyTransform();
      }
      if (lens) paintLensMembers();
      else drawEdges();
    }

    function resize() {
      refit();
      const previous = minScale;
      limitsOfScale();
      if (!userMoved || Math.abs(scale - previous) < 0.0001) {
        fit();
        userMoved = false;
      } else {
        scale = Math.min(maxScale, Math.max(minScale, scale));
        clampPan();
        applyTransform();
      }
      settle();
    }

    stage.addEventListener('selectstart', (event) => event.preventDefault());
    stage.addEventListener('dragstart', (event) => event.preventDefault());

    stage.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      const inWorld = event.target.closest && event.target.closest('.net-world');
      if (inWorld && event.cancelable) event.preventDefault();
      cancelMotion();
      pointers.set(event.pointerId, {
        ox: event.clientX,
        oy: event.clientY,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        tx,
        ty,
        target: event.target,
      });
      if (pointers.size === 2) {
        const pair = [...pointers.values()];
        pinch = {
          dist: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1,
          scale,
        };
      }
    });

    stage.addEventListener('pointermove', (event) => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      const dx = event.clientX - pointer.ox;
      const dy = event.clientY - pointer.oy;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!pointer.moved && Math.hypot(dx, dy) >= 5) {
        pointer.moved = true;
        suppressClick = true;
        userMoved = true;
        if (event.isTrusted && !stage.hasPointerCapture(event.pointerId)) stage.setPointerCapture(event.pointerId);
      }
      if (pointers.size >= 2 && pinch) {
        const pair = [...pointers.values()];
        const dist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
        const midX = (pair[0].x + pair[1].x) / 2;
        const midY = (pair[0].y + pair[1].y) / 2;
        zoomAt(midX, midY, pinch.scale * (dist / pinch.dist));
        settle();
        return;
      }
      if (!pointer.moved) return;
      tx = pointer.tx + dx;
      ty = pointer.ty + dy;
      clampPan();
      applyTransform();
    });

    function endPointer(event) {
      const pointer = pointers.get(event.pointerId);
      const pinching = pointers.size > 1 || Boolean(pinch);
      const tap = !pinching && pointer && !pointer.moved && event.type === 'pointerup' ? pointer.target : null;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      pointers.forEach((pointer) => {
        pointer.ox = pointer.x;
        pointer.oy = pointer.y;
        pointer.tx = tx;
        pointer.ty = ty;
      });
      if (!pointers.size && suppressClick) {
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
      if (!tap || !tap.closest) return;
      const filmButton = tap.closest('.net-film');
      if (!filmButton) return;
      const film = films.find((item) => item.id === filmButton.dataset.id);
      if (!film) return;
      skipClick = true;
      window.setTimeout(() => { skipClick = false; }, 0);
      options.onChoose(film);
    }

    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    stage.addEventListener('click', (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target.closest('.net-film, #net-bar, button, a, input')) return;
      if (options.onBlank) options.onBlank();
    });

    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      cancelMotion();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      userMoved = true;
      zoomAt(event.clientX, event.clientY, scale * Math.exp(-delta * 0.0016));
      settle();
    }, { passive: false });

    world.classList.add('z-far');
    return {
      loadGraph,
      build() {
        buildFilms();
        buildLabels();
        fit();
        userMoved = false;
        requestAnimationFrame(() => collideLabels());
      },
      paint,
      setFocus,
      frame,
      followPanel,
      stopMotion() {
        motion += 1;
      },
      nearScale() {
        return limits.nearFrom;
      },
      refresh,
      resize,
      reveal,
      pointOf(id) {
        const point = points.get(id);
        return point ? { x: point.x, y: point.y } : null;
      },
      glide,
      addFilm,
      showFilm(film, point, options) {
        if (!films.some((item) => item.id === film.id)) films = films.concat(film);
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
          remember(film.id, point);
          stored[film.id] = { x: point.x, y: point.y };
        } else if (!points.has(film.id)) seat(film);
        const fresh = !buttons.has(film.id);
        let button = buttons.get(film.id);
        if (!button) {
          button = buttonFor(film);
          buttons.set(film.id, button);
          world.append(button);
        }
        placeButton(film.id);
        if (fresh && !(options && options.fade === false)) {
          button.classList.add('is-arriving');
          requestAnimationFrame(() => button.classList.add('is-in'));
          button.addEventListener('transitionend', () => {
            button.classList.remove('is-arriving', 'is-in');
          }, { once: true });
        }
        ensureImages();
      },
      hasButton(id) {
        return buttons.has(id);
      },
      moveFilm,
      dropFilm(id) {
        films = films.filter((film) => film.id !== id);
        const button = buttons.get(id);
        if (button) button.remove();
        buttons.delete(id);
        points.delete(id);
        refit();
        settle();
      },
      setFilms(next) {
        films = next;
      },
      reflow() {
        films = options.films || [];
        stored = readStored();
        collectPoints();
        buildFilms();
        buildLabels();
        fit();
        userMoved = false;
        paint();
      },
      showGuest(list) {
        films = list || [];
        points = new Map();
        const layout = root.Layout;
        const known = new Map();
        films.forEach((film, index) => {
          let placed = null;
          if (layout && layout.placeOne) {
            try { placed = layout.placeOne(film, films, known); } catch { placed = null; }
          }
          if (!placed || !Number.isFinite(placed.x) || !Number.isFinite(placed.y)) {
            const angle = (index / Math.max(films.length, 1)) * Math.PI * 2;
            placed = { x: 0.5 + Math.cos(angle) * 0.28, y: 0.5 + Math.sin(angle) * 0.28 };
          }
          const point = { x: placed.x, y: placed.y };
          known.set(film.id, point);
          points.set(film.id, point);
        });
        buildFilms();
        buildLabels();
        sizeWorld();
        fitView = computeView(points);
        fit();
        userMoved = false;
        paint();
      },
      restoreOwn() {
        films = options.films || [];
        stored = readStored();
        collectPoints();
        buildFilms();
        buildLabels();
        fit();
        userMoved = false;
        paint();
      },
      setRating(on) {
        ratingOn = on;
        stage.classList.toggle('is-net-rating', on && !compareRatings);
        paint();
      },
      setCompare(map) {
        compareRatings = map || null;
        stage.classList.toggle('is-net-compare', Boolean(compareRatings));
        stage.classList.toggle('is-net-rating', ratingOn && !compareRatings);
        paint();
      },
    };
  }

  root.Network = { create };
})(globalThis);
