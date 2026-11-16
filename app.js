(() => {
  const FILMS = window.FILMS || [];
  const STORE = "moviebylucia-v1";
  const GENERIC = new Set([
    "Serie", "Miniserie", "Kult", "Klassiker", "PlotTwist", "Buchverfilmung",
    "WahreBegebenheit", "Spannung", "Brutal", "Düster", "Übernatürlich",
    "Emotional", "Visuell", "Epos", "Fortsetzung", "Finale", "OriginStory",
    "Atmosphärisch", "Intensiv", "Satire", "SchwarzerHumor", "Kammerspiel",
    "Ensemble", "Meta", "Kultverdächtig", "Abgedreht", "Tempo", "Langsam",
    "Splatter", "Gore", "Trash",
  ]);

  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d");
  const panel = document.getElementById("panel");
  const search = document.getElementById("search");
  const results = document.getElementById("results");
  const modeGenre = document.getElementById("mode-genre");
  const modeDirector = document.getElementById("mode-director");

  const state = loadState();
  const nodes = FILMS.map((film) => ({ film, x: 0, y: 0, tx: 0, ty: 0 }));
  const byId = new Map(nodes.map((node) => [node.film.id, node]));

  const cam = { x: 0, y: 0, z: 1 };
  let cssW = window.innerWidth;
  let cssH = window.innerHeight;
  let mode = "genre";
  let hoverId = null;
  let selectedId = null;
  let links = [];
  let activeLinkId = null;
  let pixelRatio = 1;
  let pulseAt = 0;
  let pulseRaf = 0;
  let lastTapAt = 0;
  let lastTapId = null;
  let panning = false;
  let moved = false;
  let panX = 0;
  let panY = 0;
  let downX = 0;
  let downY = 0;
  const pointers = new Map();
  let pinchDist = 0;

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "{}");
      return raw && typeof raw === "object" ? raw : {};
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
      rating: typeof row.rating === "number" && Number.isFinite(row.rating) ? row.rating : null,
      memo: typeof row.memo === "string" ? row.memo : "",
    };
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
    const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function imdbColor(score) {
    const stops = [
      [0, "#8d1f1c"],
      [2.5, "#c44532"],
      [4.5, "#d4783a"],
      [6, "#d4b048"],
      [7.5, "#a8c44a"],
      [9, "#3cba6a"],
      [10, "#149255"],
    ];
    if (score == null) return "#cfcfcf";
    if (score <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i += 1) {
      if (score <= stops[i][0]) {
        const span = stops[i][0] - stops[i - 1][0];
        const t = (score - stops[i - 1][0]) / span;
        return mix(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  }

  function withAlpha(color, alpha) {
    const [r, g, b] = color.startsWith("#")
      ? hex(color)
      : color.match(/\d+/g).slice(0, 3).map(Number);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  let tileSize = 22;

  function radius() {
    return tileSize / 2;
  }

  let clusterMarks = [];
  let genreBoxes = [];
  let columnGuides = [];
  let contentTop = 0;
  let contentBottom = 0;
  let laidWidth = 0;
  let aligned = false;
  let activeGroup = null;

  function viewWidth() {
    const panelOpen = panel && !panel.hidden && cssW >= 760;
    return cssW - (panelOpen ? Math.min(360, cssW) : 0);
  }

  function averageScore(list) {
    const scores = list.map((node) => node.film.imdb).filter((value) => value != null);
    if (!scores.length) return null;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }

  function layoutColumns(groups) {
    clusterMarks = [];
    genreBoxes = [];
    columnGuides = [];
    const ranked = [...groups.entries()].sort((a, b) => {
      const score = (averageScore(b[1]) ?? -1) - (averageScore(a[1]) ?? -1);
      return score || a[0].localeCompare(b[0], "de");
    });
    const marginX = 28;
    const marginTop = 156;
    const board = Math.max(240, viewWidth() - marginX * 2);
    let blockCols = 1;
    if (board >= 1080) blockCols = 4;
    else if (board >= 760) blockCols = 3;
    else if (board >= 460) blockCols = 2;
    blockCols = Math.min(blockCols, Math.max(ranked.length, 1));

    const blockGapX = 26;
    const blockGapY = 46;
    const blockW = (board - blockGapX * (blockCols - 1)) / blockCols;
    const inner = Math.max(36, blockW - 12);
    const gapRatio = 0.42;
    const maxTile = 28;
    const widest = Math.max(...ranked.map(([, list]) => list.length), 1);
    let filmCols = Math.min(4, widest);
    while (filmCols < widest) {
      const next = inner / (filmCols + Math.max(0, filmCols - 1) * gapRatio);
      if (next <= maxTile) break;
      filmCols += 1;
    }
    let tile = inner / (filmCols + Math.max(0, filmCols - 1) * gapRatio);
    tile = Math.max(13, Math.min(maxTile, tile));
    const gap = tile * gapRatio;
    tileSize = tile;
    const step = tile + gap;
    const headerH = 34;
    const originX = (viewWidth() - board) / 2;
    let y = marginTop;

    for (let start = 0; start < ranked.length; start += blockCols) {
      const slice = ranked.slice(start, start + blockCols);
      const rowH = Math.max(...slice.map(([, list]) => {
        const cols = Math.min(filmCols, Math.max(list.length, 1));
        const rows = Math.ceil(list.length / cols);
        return headerH + rows * step - gap;
      }));
      slice.forEach(([label, list], col) => {
        const cols = Math.min(filmCols, Math.max(list.length, 1));
        const usedW = cols * tile + Math.max(0, cols - 1) * gap;
        const blockX = originX + col * (blockW + blockGapX);
        const x0 = blockX + (blockW - usedW) / 2;
        list.forEach((node, i) => {
          node.group = label;
          node.tx = x0 + (i % cols) * step + tile / 2;
          node.ty = y + headerH + Math.floor(i / cols) * step + tile / 2;
        });
        const rows = Math.ceil(list.length / cols);
        clusterMarks.push({
          x: blockX + blockW / 2,
          y: y + 10,
          label,
          score: averageScore(list),
        });
        genreBoxes.push({
          key: label,
          minX: blockX,
          maxX: blockX + blockW,
          minY: y - 8,
          maxY: y + headerH + rows * step + 10,
        });
      });
      y += rowH + blockGapY;
    }

    contentTop = 20;
    contentBottom = y + 28;
    for (let col = 1; col < blockCols; col += 1) {
      columnGuides.push(originX + col * (blockW + blockGapX) - blockGapX / 2);
    }
  }

  function layout() {
    if (mode === "genre") {
      const groups = new Map();
      nodes.forEach((node) => {
        const key = node.film.cluster || "Andere";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(node);
      });
      layoutColumns(groups);
      return;
    }
    const groups = new Map();
    nodes.forEach((node) => {
      const key = node.film.director || "Ohne Regie";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    });
    layoutColumns(groups);
  }

  function settle() {
    nodes.forEach((node) => {
      node.x = node.tx;
      node.y = node.ty;
    });
  }

  function clampScroll() {
    cam.z = 1;
    cam.x = cssW / 2;
    const span = contentBottom - contentTop;
    if (span <= cssH) {
      cam.y = contentTop + cssH / 2;
      return;
    }
    const atTop = contentTop + cssH / 2;
    const atBottom = contentBottom - cssH / 2;
    cam.y = Math.min(atBottom, Math.max(atTop, cam.y));
  }

  function focusNode(node) {
    cam.z = 1;
    cam.x = cssW / 2;
    cam.y = node.y - (cssH * 0.4 - cssH / 2);
    clampScroll();
  }

  function ensureLayout() {
    const width = viewWidth();
    if (Math.abs(width - laidWidth) < 1) return;
    const keep = selectedId ? byId.get(selectedId) : null;
    const beforeY = keep ? worldToScreen(keep.x, keep.y).y : null;
    layout();
    settle();
    laidWidth = width;
    if (keep && beforeY != null) cam.y = keep.y - (beforeY - cssH / 2);
    clampScroll();
  }

  function worldToScreen(x, y) {
    return {
      x: (x - cam.x) * cam.z + cssW / 2,
      y: (y - cam.y) * cam.z + cssH / 2,
    };
  }

  function screenToWorld(x, y) {
    return {
      x: (x - cssW / 2) / cam.z + cam.x,
      y: (y - cssH / 2) / cam.z + cam.y,
    };
  }

  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.round(cssW * pixelRatio);
    canvas.height = Math.round(cssH * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const previousTop = contentTop;
    const previousY = cam.y;
    layout();
    settle();
    laidWidth = viewWidth();
    cam.y = aligned ? contentTop + (previousY - previousTop) : contentTop + cssH / 2;
    aligned = true;
    clampScroll();
    draw();
  }

  function hitTest(event) {
    const point = screenToWorld(event.offsetX, event.offsetY);
    let found = null;
    let best = Infinity;
    nodes.forEach((node) => {
      const reach = radius() + 3 / cam.z;
      const dx = Math.abs(node.x - point.x);
      const dy = Math.abs(node.y - point.y);
      if (dx <= reach && dy <= reach && dx + dy < best) {
        best = dx + dy;
        found = node;
      }
    });
    return found;
  }

  function shared(a, b) {
    return a.filter((tag) => b.includes(tag));
  }

  function linksFor(film) {
    const ranked = [];
    FILMS.forEach((other) => {
      if (other.id === film.id) return;
      let score = 0;
      const reasons = [];
      if (film.director && film.director === other.director) {
        score += 100;
        reasons.push("Regisseur");
      }
      if (film.franchise && film.franchise === other.franchise) {
        score += 90;
        reasons.push("Kontext");
      }
      const both = shared(film.tags, other.tags);
      const distinctive = both.filter((tag) => !GENERIC.has(tag));
      const generic = both.filter((tag) => GENERIC.has(tag));
      score += distinctive.length * 24 + generic.length * 6;
      if (distinctive.length && !reasons.includes("Kontext")) reasons.push("Kontext");
      const genres = shared(film.genres, other.genres);
      if (genres.length || (film.cluster && film.cluster === other.cluster)) {
        score += 24 + Math.max(0, genres.length - 1) * 6;
        reasons.push("Genre");
      }
      let years = null;
      if (film.yearNum != null && other.yearNum != null) {
        years = Math.abs(film.yearNum - other.yearNum);
        if (years <= 4 && (genres.length || distinctive.length)) {
          score += years <= 1 ? 12 : 7;
          reasons.push("Zeit");
        }
      }
      if (!reasons.length || score < 22) return;
      let tier = "weak";
      if (score >= 80) tier = "strong";
      else if (score >= 36) tier = "mid";
      ranked.push({
        id: other.id,
        score,
        tier,
        reasons,
        genres,
        tags: distinctive.length ? distinctive : generic.slice(0, 2),
        years,
      });
    });
    ranked.sort((a, b) => b.score - a.score || (a.years ?? 99) - (b.years ?? 99));
    const kept = [];
    ranked.forEach((item) => {
      if (item.score >= 80 || kept.length < 14) kept.push(item);
    });
    return kept.slice(0, 16);
  }

  function pulseScale(id) {
    if (id !== selectedId) return 1;
    const t = (performance.now() - pulseAt) / 460;
    if (t < 0 || t >= 1) return 1;
    return 1 - 0.18 * Math.sin(t * Math.PI * 2);
  }

  function startPulse() {
    pulseAt = performance.now();
    if (pulseRaf) cancelAnimationFrame(pulseRaf);
    const step = () => {
      draw();
      if (performance.now() - pulseAt < 480) pulseRaf = requestAnimationFrame(step);
      else pulseRaf = 0;
    };
    pulseRaf = requestAnimationFrame(step);
  }

  function openFilm(node, focus) {
    selectedId = node.film.id;
    links = linksFor(node.film);
    activeLinkId = links[0] ? links[0].id : null;
    renderPanel(node);
    ensureLayout();
    if (focus) focusNode(node);
    startPulse();
  }

  function setActiveLink(id) {
    if (!id || id === activeLinkId || !links.some((link) => link.id === id)) return;
    activeLinkId = id;
    panel.querySelectorAll(".link").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.id === id);
    });
    draw();
  }

  function clearSelection() {
    selectedId = null;
    links = [];
    activeLinkId = null;
    panel.hidden = true;
    panel.replaceChildren();
    ensureLayout();
    draw();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderPanel(node) {
    const film = node.film;
    const row = entry(film.id);
    panel.replaceChildren();
    panel.hidden = false;

    const head = el("div", "panel-head");
    head.append(el("h1", null, film.title));
    if (film.year) head.append(el("p", "sub", film.year));
    if (film.director) head.append(el("p", "credit", `Regie ${film.director}`));
    const imdb = el("p", "imdb-line");
    imdb.append(el("span", "star", "★"), el("span", null, film.imdbLabel));
    head.append(imdb);
    if (film.genres.length) {
      const pills = el("ul", "pills");
      film.genres.forEach((genre) => pills.append(el("li", null, genre)));
      head.append(pills);
    }
    panel.append(head);

    const field = el("div", "block");
    const rateLabel = el("label", null, "Bewertung");
    rateLabel.htmlFor = "own-rate";
    const rateRow = el("div", "rate-row");
    const range = document.createElement("input");
    range.id = "own-rate";
    range.className = "rate";
    range.type = "range";
    range.min = "0";
    range.max = "10";
    range.step = "0.1";
    range.value = row.rating == null ? "0" : String(row.rating);
    const value = el("output", "rate-value", formatScore(row.rating));
    value.htmlFor = "own-rate";
    range.addEventListener("input", () => {
      const next = Math.round(Number(range.value) * 10) / 10;
      value.textContent = formatScore(next);
      writeEntry(film.id, { rating: next });
      draw();
    });
    rateRow.append(range, value);
    const memoLabel = el("label", null, "Notiz");
    memoLabel.htmlFor = "own-memo";
    memoLabel.style.marginTop = "16px";
    const memo = document.createElement("textarea");
    memo.id = "own-memo";
    memo.className = "memo";
    memo.maxLength = 500;
    memo.value = row.memo;
    memo.addEventListener("input", () => {
      writeEntry(film.id, { memo: memo.value });
    });
    field.append(rateLabel, rateRow, memoLabel, memo);
    panel.append(field);

    const toggles = el("div", "toggles block");
    toggles.append(
      toggle("Gesehen", row.watched, (on) => {
        writeEntry(film.id, { watched: on });
        renderPanel(node);
        draw();
      }),
      toggle("Favorit", row.favorite, (on) => {
        writeEntry(film.id, { favorite: on });
        renderPanel(node);
        draw();
      }),
      toggle("Als Nächstes", row.next, (on) => {
        writeEntry(film.id, { next: on });
        renderPanel(node);
        draw();
      }),
    );
    panel.append(toggles);

    const groups = [
      ["Regisseur", (link) => link.reasons.includes("Regisseur")],
      ["Kontext", (link) => link.reasons.includes("Kontext")],
      ["Genre", (link) => link.reasons.includes("Genre")],
      ["Zeit", (link) => link.reasons.includes("Zeit")],
    ];
    groups.forEach(([name, test]) => {
      const group = el("section", "group");
      const items = links.filter(test).slice(0, 6);
      if (!items.length) return;
      group.append(el("h2", null, name));
      items.forEach((link) => {
        const other = byId.get(link.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "link";
        button.dataset.id = other.film.id;
        if (other.film.id === activeLinkId) button.classList.add("is-active");
        const title = el("span", "link-title", other.film.title);
        const meta = el("span", "link-meta", linkMeta(film, other.film, link, name));
        button.append(title, meta);
        button.addEventListener("pointerenter", (event) => {
          if (event.pointerType === "touch") return;
          setActiveLink(other.film.id);
        });
        button.addEventListener("click", () => openFilm(other, true));
        group.append(button);
      });
      panel.append(group);
    });

    const close = el("button", "close", "Schließen");
    close.type = "button";
    close.addEventListener("click", clearSelection);
    panel.append(close);
  }

  function formatScore(value) {
    if (value == null || Number.isNaN(value)) return "–";
    return value.toFixed(1).replace(".", ",");
  }

  function linkMeta(film, other, link, group) {
    if (group === "Regisseur") return film.director || "gleiche Regie";
    if (group === "Kontext") {
      if (film.franchise && film.franchise === other.franchise) return film.franchise;
      return link.tags.slice(0, 3).join(" · ") || "gemeinsames Thema";
    }
    if (group === "Genre") return (link.genres.length ? link.genres : other.genres).slice(0, 2).join(" · ");
    if (link.years === 0) return other.year || "gleiches Jahr";
    if (link.years === 1) return "1 Jahr Abstand";
    return `${link.years} Jahre Abstand`;
  }

  function toggle(text, pressed, onChange) {
    const button = el("button", "toggle", text);
    button.type = "button";
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    button.addEventListener("click", () => onChange(!pressed));
    return button;
  }

  const LIFT = 5;

  function gridRoute(from, to) {
    return [
      { x: from.x, y: from.y },
      { x: from.x, y: to.y },
      { x: to.x, y: to.y },
    ];
  }

  function drawRoute(from, to, tier) {
    const points = gridRoute(from, to).map((point) => worldToScreen(point.x, point.y));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.25;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    if (tier === "strong") ctx.setLineDash([]);
    else if (tier === "mid") ctx.setLineDash([6, 7]);
    else ctx.setLineDash([2, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawLinkMark(node) {
    const at = worldToScreen(node.x, node.y);
    const side = Math.max(5, radius() * 0.7);
    ctx.fillStyle = "#fff";
    ctx.fillRect(at.x - side / 2, at.y - side / 2, side, side);
  }

  function drawNode(node) {
    const film = node.film;
    const row = entry(film.id);
    const selected = film.id === selectedId;
    const at = worldToScreen(node.x, node.y);
    const base = Math.max(radius() * cam.z, 1.4);
    const r = base * pulseScale(film.id);
    const revealed = node.group === activeGroup
      || (selectedId && byId.get(selectedId).group === node.group);
    const colored = revealed && row.watched && row.rating != null;
    const fill = colored ? imdbColor(row.rating) : "#d2d2d2";
    const lift = selected ? LIFT : 0;
    ctx.save();
    ctx.globalAlpha = selectedId && !selected ? 0.65 : 1;
    if (selected) {
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 16;
    }
    ctx.fillStyle = fill;
    ctx.fillRect(at.x - r, at.y - r - lift, r * 2, r * 2);
    ctx.shadowColor = "transparent";

    if (row.favorite) {
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 1;
      ctx.strokeRect(at.x - r - 4, at.y - r - 4 - lift, (r + 4) * 2, (r + 4) * 2);
    }
    if (row.next) {
      const d = r + 9;
      ctx.save();
      ctx.translate(at.x + d * 0.72, at.y - d * 0.72 - lift);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-2.2, -2.2, 4.4, 4.4);
      ctx.restore();
    }
    ctx.restore();
    return { at, r };
  }

  function label(text, x, y, alpha) {
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(text, x, y);
  }

  function draw() {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    columnGuides.forEach((x) => {
      const top = worldToScreen(x, contentTop);
      const bottom = worldToScreen(x, contentBottom);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.stroke();
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "15px Helvetica, Arial, sans-serif";
    clusterMarks.forEach((mark) => {
      const at = worldToScreen(mark.x, mark.y);
      if (at.x < -80 || at.y < -30 || at.x > cssW + 80 || at.y > cssH + 30) return;
      const score = mark.score == null ? "" : mark.score.toFixed(1).replace(".", ",");
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(score ? `★  ${score}  ${mark.label}` : mark.label, at.x, at.y);
    });

    ctx.lineCap = "square";
    nodes.forEach((node) => {
      if (node.film.id !== selectedId) drawNode(node);
    });
    if (selectedId) {
      const selected = byId.get(selectedId);
      const at = worldToScreen(selected.x, selected.y);
      const reach = Math.max(radius() * cam.z, 1.4) * 5.2;
      const shade = ctx.createRadialGradient(at.x, at.y, reach * 0.08, at.x, at.y, reach);
      shade.addColorStop(0, "rgba(0,0,0,0.72)");
      shade.addColorStop(0.42, "rgba(0,0,0,0.4)");
      shade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(at.x, at.y, reach, 0, Math.PI * 2);
      ctx.fill();
    }
    const active = links.find((link) => link.id === activeLinkId) || links[0];
    if (active && selectedId) {
      const target = byId.get(active.id);
      drawRoute(byId.get(selectedId), target, active.tier);
      drawLinkMark(target);
    }
    if (selectedId) drawNode(byId.get(selectedId));

    if (hoverId) {
      const node = byId.get(hoverId);
      const at = worldToScreen(node.x, node.y);
      const r = radius(node.film) * cam.z * pulseScale(node.film.id);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      label(node.film.title, at.x + r + 10, at.y, 0.92);
    }
  }

  function setMode(next) {
    mode = next;
    modeGenre.setAttribute("aria-selected", next === "genre" ? "true" : "false");
    modeDirector.setAttribute("aria-selected", next === "director" ? "true" : "false");
    layout();
    animateToTargets();
  }

  function animateToTargets() {
    const start = nodes.map((node) => ({ x: node.x, y: node.y }));
    const began = performance.now();
    const duration = 700;
    function step(now) {
      const t = Math.min(1, (now - began) / duration);
      const ease = 1 - (1 - t) ** 3;
      nodes.forEach((node, i) => {
        node.x = start[i].x + (node.tx - start[i].x) * ease;
        node.y = start[i].y + (node.ty - start[i].y) * ease;
      });
      draw();
      if (t < 1) requestAnimationFrame(step);
      else {
        settle();
        clampScroll();
        if (selectedId) focusNode(byId.get(selectedId));
        draw();
      }
    }
    requestAnimationFrame(step);
  }

  function showResults(query) {
    const q = query.trim().toLowerCase();
    results.replaceChildren();
    if (!q) {
      results.hidden = true;
      return;
    }
    const hits = FILMS.filter((film) => {
      const blob = `${film.title} ${film.original || ""} ${film.director || ""}`.toLowerCase();
      return blob.includes(q);
    }).slice(0, 8);
    if (!hits.length) {
      results.hidden = true;
      return;
    }
    hits.forEach((film) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = film.title;
      button.addEventListener("click", () => {
        search.value = film.title;
        results.hidden = true;
        openFilm(byId.get(film.id), true);
      });
      item.append(button);
      results.append(item);
    });
    results.hidden = false;
  }

  modeGenre.addEventListener("click", () => setMode("genre"));
  modeDirector.addEventListener("click", () => setMode("director"));

  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const first = results.querySelector("button");
    if (first) first.click();
  });
  search.addEventListener("input", () => showResults(search.value));
  panel.addEventListener("scroll", () => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const buttons = [...panel.querySelectorAll(".link")];
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      results.hidden = true;
      clearSelection();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    panning = true;
    moved = false;
    downX = event.clientX;
    downY = event.clientY;
    panX = event.clientX;
    panY = event.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (!panning) {
      const world = screenToWorld(event.offsetX, event.offsetY);
      const box = genreBoxes.find((item) => (
        world.x >= item.minX && world.x <= item.maxX && world.y >= item.minY && world.y <= item.maxY
      ));
      const nextGroup = box ? box.key : null;
      const hit = hitTest(event);
      const next = hit ? hit.film.id : null;
      canvas.classList.toggle("is-pointing", !!hit);
      if (next !== hoverId || nextGroup !== activeGroup) {
        hoverId = next;
        activeGroup = nextGroup;
        draw();
      }
      return;
    }
    const dy = event.clientY - panY;
    if (Math.abs(event.clientY - downY) > 4) {
      moved = true;
      canvas.classList.add("is-grabbing");
    }
    cam.y -= dy;
    clampScroll();
    panX = event.clientX;
    panY = event.clientY;
    draw();
  });

  canvas.addEventListener("pointerup", (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    panning = false;
    canvas.classList.remove("is-grabbing");
    if (moved) return;
    const hit = hitTest(event);
    if (hit) {
      const now = performance.now();
      if (hit.film.id === lastTapId && now - lastTapAt < 340) {
        writeEntry(hit.film.id, { watched: true });
      }
      lastTapAt = now;
      lastTapId = hit.film.id;
      openFilm(hit, false);
    } else {
      lastTapId = null;
      clearSelection();
    }
  });

  canvas.addEventListener("pointerleave", () => {
    if (!hoverId && !activeGroup) return;
    hoverId = null;
    activeGroup = null;
    canvas.classList.remove("is-pointing");
    draw();
  });

  canvas.addEventListener("pointercancel", (event) => {
    pointers.delete(event.pointerId);
    panning = false;
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const dy = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    cam.y += dy;
    clampScroll();
    draw();
  }, { passive: false });

  window.addEventListener("resize", resize);

  resize();
})();
