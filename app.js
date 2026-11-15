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
  const modeNote = document.getElementById("mode-note");
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
  let panning = false;
  let moved = false;
  let panX = 0;
  let panY = 0;
  let downX = 0;
  let downY = 0;
  let clearTimer = 0;
  let lastTap = 0;
  let lastTapId = null;
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
      note: typeof row.note === "string" ? row.note : "",
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
      [5, "#bc4036"],
      [6.4, "#d4783a"],
      [7.2, "#d4b048"],
      [8, "#8fbe45"],
      [9, "#3cba6a"],
      [10, "#12824c"],
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

  function radius(film) {
    if (film.imdb == null) return 3.3;
    const t = Math.min(1, Math.max(0, (film.imdb - 5.2) / 4.2));
    return 2.7 + t * 5.2;
  }

  function placeDisc(list, cx, cy, gap) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    list.forEach((node, i) => {
      if (list.length === 1) {
        node.tx = cx;
        node.ty = cy;
        return;
      }
      const r = gap * Math.sqrt(i);
      const a = i * golden;
      node.tx = cx + Math.cos(a) * r;
      node.ty = cy + Math.sin(a) * r * 0.92;
    });
  }

  function spread(groups) {
    const ordered = [];
    const rest = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    while (rest.length) {
      ordered.push(rest.shift());
      if (rest.length) ordered.push(rest.pop());
    }
    const n = Math.max(ordered.length, 1);
    const rx = 460 + n * 28;
    const ry = rx * 0.62;
    ordered.forEach(([label, list], i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const cx = Math.cos(a) * rx;
      const cy = Math.sin(a) * ry;
      placeDisc(list, cx, cy, 20);
      list.center = { x: cx, y: cy, label };
    });
    return ordered;
  }

  let clusterMarks = [];

  function layout() {
    clusterMarks = [];
    if (mode === "genre") {
      const groups = new Map();
      nodes.forEach((node) => {
        const key = node.film.cluster || "Andere";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(node);
      });
      spread(groups).forEach(([, list]) => {
        clusterMarks.push(list.center);
      });
      return;
    }

    const byDirector = new Map();
    nodes.forEach((node) => {
      const key = node.film.director || "";
      if (!byDirector.has(key)) byDirector.set(key, []);
      byDirector.get(key).push(node);
    });
    const multi = [];
    const singles = [];
    const unknown = [];
    byDirector.forEach((list, name) => {
      if (!name) unknown.push(...list);
      else if (list.length >= 2) multi.push([name, list]);
      else singles.push(list[0]);
    });

    const inner = spread(new Map(multi));
    inner.forEach(([, list]) => clusterMarks.push(list.center));

    const singleRing = singles.length;
    singles.forEach((node, i) => {
      const a = -Math.PI / 2 + (i / Math.max(singleRing, 1)) * Math.PI * 2;
      node.tx = Math.cos(a) * 1180;
      node.ty = Math.sin(a) * 760;
    });

    const outer = new Map();
    unknown.forEach((node) => {
      const key = node.film.cluster || "Andere";
      if (!outer.has(key)) outer.set(key, []);
      outer.get(key).push(node);
    });
    const outerGroups = [...outer.entries()].sort((a, b) => b[1].length - a[1].length);
    const on = Math.max(outerGroups.length, 1);
    outerGroups.forEach(([label, list], i) => {
      const a = -Math.PI / 2 + (i / on) * Math.PI * 2;
      const cx = Math.cos(a) * 1680;
      const cy = Math.sin(a) * 1080;
      placeDisc(list, cx, cy, 18);
      clusterMarks.push({ x: cx, y: cy, label });
    });
  }

  function settle() {
    nodes.forEach((node) => {
      node.x = node.tx;
      node.y = node.ty;
    });
  }

  function bounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    });
    return { minX, minY, maxX, maxY };
  }

  function fit() {
    const box = bounds();
    const dx = Math.max(box.maxX - box.minX, 1);
    const dy = Math.max(box.maxY - box.minY, 1);
    const pad = 120;
    cam.z = Math.min((cssW - 40) / (dx + pad), (cssH - 40) / (dy + pad), 1.35);
    cam.z = Math.max(cam.z, 0.18);
    cam.x = (box.minX + box.maxX) / 2;
    cam.y = (box.minY + box.maxY) / 2;
  }

  function focusNode(node) {
    cam.x = node.x;
    cam.y = node.y;
    cam.z = Math.max(cam.z, 0.85);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function hitTest(event) {
    const point = screenToWorld(event.offsetX, event.offsetY);
    let found = null;
    let best = 18 / cam.z;
    nodes.forEach((node) => {
      const dist = Math.hypot(node.x - point.x, node.y - point.y);
      const reach = Math.max(radius(node.film) + 6, best);
      if (dist <= reach && dist < best) {
        best = dist;
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

  function openFilm(node, markWatched) {
    selectedId = node.film.id;
    if (markWatched) writeEntry(node.film.id, { watched: true });
    links = linksFor(node.film);
    focusNode(node);
    renderPanel(node);
    draw();
  }

  function clearSelection() {
    selectedId = null;
    links = [];
    panel.hidden = true;
    panel.replaceChildren();
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

    panel.append(el("h1", null, film.title));
    const bits = [];
    if (film.original && film.original !== film.title) bits.push(film.original);
    if (film.year) bits.push(film.year);
    if (film.kind === "serie") bits.push("Serie");
    if (film.director) bits.push(film.director);
    else bits.push("Regie offen");
    panel.append(el("p", "sub", bits.join(" · ")));

    const score = el("div", "score-row");
    const swatch = el("span", "swatch-inline");
    swatch.style.background = row.watched ? imdbColor(film.imdb) : "#f4f4f4";
    const strong = el("strong", null, film.imdbLabel);
    const caption = el("span", null, row.watched ? "gesehen · IMDb" : "IMDb · noch weiß");
    score.append(swatch, strong, caption);
    panel.append(score);

    const genres = el("p", "sub", film.genres.join(" · "));
    panel.append(genres);

    const field = el("div", "field");
    const label = el("label", null, "Eigene Note");
    label.htmlFor = "own-note";
    const input = document.createElement("input");
    input.id = "own-note";
    input.className = "note";
    input.type = "text";
    input.maxLength = 40;
    input.placeholder = "nur Text, ändert die Farbe nicht";
    input.value = row.note;
    input.addEventListener("input", () => {
      writeEntry(film.id, { note: input.value });
    });
    field.append(label, input);
    panel.append(field);

    const toggles = el("div", "toggles");
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

    if (film.tags.length) {
      const tags = el("ul", "tags");
      film.tags.forEach((tag) => tags.append(el("li", null, tag)));
      panel.append(tags);
    }

    const groups = [
      ["Regisseur", (link) => link.reasons.includes("Regisseur")],
      ["Kontext", (link) => link.reasons.includes("Kontext")],
      ["Genre", (link) => link.reasons.includes("Genre")],
      ["Zeit", (link) => link.reasons.includes("Zeit")],
    ];
    groups.forEach(([name, test]) => {
      const group = el("section", "group");
      group.append(el("h2", null, name));
      const items = links.filter(test).slice(0, 6);
      if (!items.length) {
        group.append(el("p", "sub", "keine"));
      }
      items.forEach((link) => {
        const other = byId.get(link.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "link";
        const title = el("span", "link-title", other.film.title);
        const meta = el("span", "link-meta", linkMeta(film, other.film, link, name));
        button.append(title, meta);
        button.addEventListener("click", () => openFilm(other, false));
        group.append(button);
      });
      panel.append(group);
    });

    const close = el("button", "close", "Schließen");
    close.type = "button";
    close.addEventListener("click", clearSelection);
    panel.append(close);
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

  function drawLink(a, b, tier) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (tier === "strong") {
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.lineWidth = 1.15;
      ctx.setLineDash([]);
    } else if (tier === "mid") {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 9]);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 16]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawNode(node) {
    const film = node.film;
    const row = entry(film.id);
    const at = worldToScreen(node.x, node.y);
    const r = Math.max(radius(film) * cam.z, 1.6);
    const selected = film.id === selectedId;
    const fill = row.watched ? imdbColor(film.imdb) : "#f7f7f7";

    if (r > 4.5 || selected) {
      const glow = ctx.createRadialGradient(at.x, at.y, r * 0.2, at.x, at.y, r * (selected ? 7 : 4.2));
      glow.addColorStop(0, selected ? "rgba(242,214,90,0.55)" : "rgba(255,255,255,0.28)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(at.x, at.y, r * (selected ? 7 : 4.2), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (row.favorite) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 1;
      ctx.arc(at.x, at.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (row.next) {
      const d = r + 9;
      ctx.save();
      ctx.translate(at.x + d * 0.72, at.y - d * 0.72);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-2.2, -2.2, 4.4, 4.4);
      ctx.restore();
    }
    return { at, r };
  }

  function label(text, x, y, alpha) {
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(text, x, y);
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssW, cssH);

    if (cam.z > 0.28) {
      ctx.textAlign = "center";
      clusterMarks.forEach((mark) => {
        const at = worldToScreen(mark.x, mark.y);
        if (at.x < -40 || at.y < -20 || at.x > cssW + 40 || at.y > cssH + 20) return;
        label(mark.label, at.x, at.y, 0.22);
      });
    }

    ctx.lineCap = "round";
    links.forEach((link) => {
      const a = worldToScreen(byId.get(selectedId).x, byId.get(selectedId).y);
      const other = byId.get(link.id);
      const b = worldToScreen(other.x, other.y);
      drawLink(a, b, link.tier);
    });

    nodes.forEach((node) => drawNode(node));

    ctx.textAlign = "left";
    const labeled = new Set();
    if (selectedId) {
      const node = byId.get(selectedId);
      const at = worldToScreen(node.x, node.y);
      label(node.film.title, at.x + 10, at.y - 8, 0.92);
      labeled.add(selectedId);
      links.forEach((link) => {
        const other = byId.get(link.id);
        const pos = worldToScreen(other.x, other.y);
        if (pos.x < 0 || pos.y < 12 || pos.x > cssW - 20 || pos.y > cssH - 8) return;
        label(other.film.title, pos.x + 8, pos.y - 6, link.tier === "weak" ? 0.45 : 0.78);
        labeled.add(link.id);
      });
    }
    if (hoverId && !labeled.has(hoverId)) {
      const node = byId.get(hoverId);
      const at = worldToScreen(node.x, node.y);
      label(node.film.title, at.x + 10, at.y - 8, 0.85);
    }
  }

  function setMode(next) {
    mode = next;
    modeGenre.setAttribute("aria-selected", next === "genre" ? "true" : "false");
    modeDirector.setAttribute("aria-selected", next === "director" ? "true" : "false");
    modeNote.hidden = next !== "director";
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
      if (t > 0.45 && t < 0.55) fit();
      draw();
      if (t < 1) requestAnimationFrame(step);
      else {
        settle();
        fit();
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
      const small = el("small", null, [film.year, film.director || film.cluster].filter(Boolean).join(" · "));
      button.append(small);
      button.addEventListener("click", () => {
        search.value = film.title;
        results.hidden = true;
        openFilm(byId.get(film.id), false);
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
    if (pointers.size === 2 && pinchDist) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = canvas.getBoundingClientRect();
      const before = screenToWorld(mid.x - rect.left, mid.y - rect.top);
      cam.z = Math.min(4, Math.max(0.18, cam.z * (dist / pinchDist)));
      const after = screenToWorld(mid.x - rect.left, mid.y - rect.top);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      pinchDist = dist;
      moved = true;
      draw();
      return;
    }
    if (!panning) {
      const hit = hitTest(event);
      const next = hit ? hit.film.id : null;
      canvas.classList.toggle("is-pointing", !!hit);
      if (next !== hoverId) {
        hoverId = next;
        draw();
      }
      return;
    }
    const dx = event.clientX - panX;
    const dy = event.clientY - panY;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 4) {
      moved = true;
      canvas.classList.add("is-grabbing");
    }
    cam.x -= dx / cam.z;
    cam.y -= dy / cam.z;
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
    const now = performance.now();
    if (hit && now - lastTap < 320 && lastTapId === hit.film.id) {
      window.clearTimeout(clearTimer);
      lastTap = 0;
      openFilm(hit, true);
      return;
    }
    lastTap = now;
    lastTapId = hit ? hit.film.id : null;
    if (!hit) {
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(clearSelection, 280);
    }
  });

  canvas.addEventListener("pointercancel", (event) => {
    pointers.delete(event.pointerId);
    panning = false;
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const before = screenToWorld(event.offsetX, event.offsetY);
    cam.z = Math.min(4, Math.max(0.18, cam.z * Math.exp(-event.deltaY * 0.0011)));
    const after = screenToWorld(event.offsetX, event.offsetY);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    draw();
  }, { passive: false });

  window.addEventListener("resize", resize);

  layout();
  settle();
  resize();
  fit();
  draw();
})();
