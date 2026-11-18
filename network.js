(function attachNetwork(root) {
  const WORLD_W = 4000;
  const WORLD_H = 2500;
  const POS_KEY = 'moviebylucia-positions-v1';

  function readStored() {
    try {
      const raw = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  function writeStored(stored) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(stored));
    } catch {
      /* private mode can refuse storage; the session still works */
    }
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
    let level = 'far';
    let settleTimer = 0;
    const pointers = new Map();
    let pinch = null;
    let suppressClick = false;
    let focus = { lit: null, edges: [], hot: null };
    let motion = 0;

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

    function worldOf(point) {
      return {
        x: (point.x / aspect) * WORLD_W,
        y: point.y * WORLD_H,
      };
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

    function loadGraph(graph) {
      graphNodes = new Map((graph.nodes || []).map((node) => [node.id, node]));
      points = new Map();
      films.forEach((film) => {
        const node = graphNodes.get(film.id);
        if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
          remember(film.id, node);
          return;
        }
        const saved = stored[film.id];
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) remember(film.id, saved);
      });
      placeMissing();
    }

    function genreOf(film) {
      return (merged(film).genres || [])[0] || '';
    }

    function markColor(film) {
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
      image.decoding = 'async';
      image.loading = 'lazy';
      const tint = document.createElement('span');
      tint.className = 'tint';
      const score = document.createElement('span');
      score.className = 'net-score';
      button.append(dot, image, tint, score);
      button.addEventListener('click', () => {
        if (suppressClick) return;
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

    function limitsOfScale() {
      const rect = viewSize();
      const fit = Math.min(rect.width / WORLD_W, rect.height / WORLD_H) * 0.92;
      minScale = Math.max(fit, 0.05);
      const poster = 120;
      maxScale = Math.max(minScale, (Math.min(rect.width, rect.height) * 0.78) / poster);
    }

    function clampPan() {
      const rect = viewSize();
      const width = WORLD_W * scale;
      const height = WORLD_H * scale;
      if (width <= rect.width) tx = (rect.width - width) / 2;
      else tx = Math.min(0, Math.max(rect.width - width, tx));
      if (height <= rect.height) ty = (rect.height - height) / 2;
      else ty = Math.min(0, Math.max(rect.height - height, ty));
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

    function drawEdges() {
      lines.replaceChildren();
      const widthFor = (score, hot) => ((hot ? 2.2 : 1.15) + Math.max(0, score || 0) * 2.3) / scale;
      (focus.edges || []).forEach((edge) => {
        const from = worldPoint(edge.source);
        const to = worldPoint(edge.target);
        if (!from || !to) return;
        const hot = focus.hot === edge.target || focus.hot === edge.source;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', from.x.toFixed(1));
        line.setAttribute('y1', from.y.toFixed(1));
        line.setAttribute('x2', to.x.toFixed(1));
        line.setAttribute('y2', to.y.toFixed(1));
        line.setAttribute('stroke', hot ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.7)');
        line.setAttribute('stroke-width', widthFor(edge.score, hot).toFixed(2));
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
      drawEdges();
      paint();
    }

    function cancelMotion() {
      motion += 1;
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
      const availW = Math.max(120, rect.width - 48);
      const availH = Math.max(120, rect.height - headerPad - 36);
      let next = Math.min(availW / Math.max(40, maxX - minX), availH / Math.max(40, maxY - minY));
      if (opts && opts.minScale) next = Math.max(next, opts.minScale);
      next = Math.min(maxScale, Math.max(minScale, next));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const start = { tx, ty, scale };
      tx = rect.width / 2 - cx * next;
      ty = headerPad + (rect.height - headerPad) / 2 - cy * next;
      scale = next;
      clampPan();
      const target = { tx, ty, scale };
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
        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        tx = target.tx;
        ty = target.ty;
        scale = target.scale;
        clampPan();
        applyClass();
        applyTransform();
        drawEdges();
        requestAnimationFrame(() => collideLabels());
      };
      requestAnimationFrame(step);
    }

    function paint() {
      buttons.forEach((button, id) => {
        const film = films.find((item) => item.id === id);
        if (!film) return;
        const row = options.entry(id);
        button.classList.toggle('is-selected', id === options.selectedId());
        button.classList.toggle('is-lit', Boolean(focus.lit && focus.lit.has(id)));
        button.classList.toggle('is-favorite', Boolean(row.favorite));
        button.classList.toggle('is-rated', row.rating != null);
        button.style.setProperty('--mark', markColor(film));
        const tint = button.querySelector('.tint');
        tint.style.background = row.rating == null ? '' : options.ratingColor(row.rating);
        button.querySelector('.net-score').textContent = row.rating == null
          ? ''
          : `★  ${row.rating.toFixed(1).replace('.', ',')}`;
        const image = button.querySelector('img');
        if (image.getAttribute('src')) {
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

    function addFilm(film) {
      if (!films.includes(film)) films = films.concat(film);
      if (!points.has(film.id)) {
        const layout = root.Layout;
        const list = mergedList();
        const known = new Map(points);
        if (layout) {
          const placed = layout.placeOne(merged(film), list, known);
          remember(film.id, placed);
          stored[film.id] = { x: placed.x, y: placed.y };
          writeStored(stored);
        }
      }
      const button = buttonFor(film);
      buttons.set(film.id, button);
      world.append(button);
      buildLabels();
      paint();
      ensureImages();
      settle();
    }

    function refresh() {
      buildLabels();
      paint();
      requestAnimationFrame(() => collideLabels());
    }

    function resize() {
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

    stage.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      cancelMotion();
      if (event.isTrusted) stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {
        ox: event.clientX,
        oy: event.clientY,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        tx,
        ty,
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
      if (!pointer.moved && Math.hypot(dx, dy) > 6) {
        pointer.moved = true;
        suppressClick = true;
        userMoved = true;
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
    }

    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    stage.addEventListener('click', (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

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
      nearScale() {
        return limits.nearFrom;
      },
      refresh,
      resize,
      reveal,
      addFilm,
      dropFilm(id) {
        films = films.filter((film) => film.id !== id);
        const button = buttons.get(id);
        if (button) button.remove();
        buttons.delete(id);
        points.delete(id);
        buildLabels();
        settle();
      },
      setFilms(next) {
        films = next;
      },
      setRating(on) {
        ratingOn = on;
        stage.classList.toggle('is-net-rating', on);
        paint();
      },
    };
  }

  root.Network = { create };
})(globalThis);
