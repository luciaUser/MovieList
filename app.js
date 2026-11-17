(() => {
  const ADDED_KEY = "moviebylucia-added-v1";
  let FILMS = window.FILMS || [];
  const STORE = "moviebylucia-v1";
  const GENERIC = new Set([
    "Serie", "Miniserie", "Kult", "Klassiker", "PlotTwist", "Buchverfilmung",
    "WahreBegebenheit", "Spannung", "Brutal", "Düster", "Übernatürlich",
    "Emotional", "Visuell", "Epos", "Fortsetzung", "Finale", "OriginStory",
    "Atmosphärisch", "Intensiv", "Satire", "SchwarzerHumor", "Kammerspiel",
    "Ensemble", "Meta", "Kultverdächtig", "Abgedreht", "Tempo", "Langsam",
    "Splatter", "Gore", "Trash",
  ]);

  const wall = document.getElementById("wall");
  const panel = document.getElementById("panel");
  const search = document.getElementById("search");
  const results = document.getElementById("results");
  const modeGenre = document.getElementById("mode-genre");
  const modeDirector = document.getElementById("mode-director");
  const modeRating = document.getElementById("mode-rating");

  const state = loadState();
  const byId = new Map(FILMS.map((film) => [film.id, film]));
  const posters = new Map();
  let added = loadAdded().filter((film) => !FILMS.some((item) => item.id === film.id));
  FILMS = FILMS.concat(added);
  added.forEach((film) => byId.set(film.id, film));
  added.forEach((film) => {
    if (film.poster) posters.set(film.id, film.poster);
  });

  let mode = "genre";
  let ratingView = false;
  let selectedId = null;
  let links = [];
  let activeLinkId = null;
  let lastTapAt = 0;
  let lastTapId = null;
  let wires = null;

  function loadAdded() {
    try {
      const raw = JSON.parse(localStorage.getItem(ADDED_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((film) => film && film.id && film.title) : [];
    } catch {
      return [];
    }
  }

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
      rating: typeof row.rating === "number" && Number.isFinite(row.rating) && row.rating > 0 ? row.rating : null,
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
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
  }

  function ratingColor(score) {
    const stops = [
      [0, "#9a221c"],
      [5, "#e4231a"],
      [6.2, "#f08a1a"],
      [7.4, "#f0d04a"],
      [8.6, "#8fce3a"],
      [10, "#12a34a"],
    ];
    if (score == null) return "#cfcfcf";
    if (score <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i += 1) {
      if (score <= stops[i][0]) {
        const span = stops[i][0] - stops[i - 1][0];
        return mix(stops[i - 1][1], stops[i][1], (score - stops[i - 1][0]) / span);
      }
    }
    return stops[stops.length - 1][1];
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

  function average(list) {
    const scores = list.map((film) => film.imdb).filter((value) => value != null);
    if (!scores.length) return -1;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }

  function filmGroups() {
    const groups = new Map();
    FILMS.forEach((film) => {
      const key = mode === "director" ? (film.director || "Ohne Regie") : (film.cluster || "Andere");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(film);
    });
    return [...groups.entries()]
      .sort((a, b) => average(b[1]) - average(a[1]) || a[0].localeCompare(b[0], "de"))
      .map(([label, list]) => ({
        label,
        films: list.slice().sort((a, b) => (
          (b.imdb ?? -1) - (a.imdb ?? -1) || a.title.localeCompare(b.title, "de")
        )),
      }));
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
    let line = "";
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
    )).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect width="500" height="750" fill="#000"/>${text}</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function escapeXml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function posterSrc(film) {
    return posters.get(film.id) || placeholder(film);
  }

  function buildWall() {
    const selected = selectedId;
    wall.replaceChildren();
    filmGroups().forEach((group) => {
      const bar = document.createElement("div");
      bar.className = "genre-bar";
      bar.dataset.ids = group.films.map((film) => film.id).join(",");
      bar.append(el("span", "genre-name", group.label), el("span", "genre-count", ""), el("span", "genre-score", "–"));
      wall.append(bar);
      group.films.forEach((film) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "poster";
        button.dataset.id = film.id;
        const image = document.createElement("img");
        image.alt = "";
        image.draggable = false;
        image.decoding = "async";
        image.src = posterSrc(film);
        const tint = document.createElement("span");
        tint.className = "tint";
        const score = document.createElement("span");
        score.className = "poster-score";
        button.append(image, tint, score);
        button.addEventListener("click", () => choose(film));
        wall.append(button);
      });
    });
    wires = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    wires.setAttribute("class", "wires");
    wires.setAttribute("aria-hidden", "true");
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

  function openFilm(film, focus) {
    selectedId = film.id;
    links = linksFor(film);
    activeLinkId = links[0] ? links[0].id : null;
    renderPanel(film);
    paint();
    if (focus) {
      wall.querySelector(`[data-id="${film.id}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
      requestAnimationFrame(drawLink);
    }
  }

  function setActiveLink(id) {
    if (!id || id === activeLinkId || !links.some((link) => link.id === id)) return;
    activeLinkId = id;
    panel.querySelectorAll(".link").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.id === id);
    });
    drawLink();
  }

  function clearSelection() {
    selectedId = null;
    links = [];
    activeLinkId = null;
    panel.hidden = true;
    panel.replaceChildren();
    paint();
  }

  function paint() {
    document.body.classList.toggle("has-selection", Boolean(selectedId));
    document.body.classList.toggle("is-rating", ratingView);
    wall.querySelectorAll(".poster").forEach((button) => {
      const row = entry(button.dataset.id);
      const selected = button.dataset.id === selectedId;
      button.classList.toggle("is-selected", selected);
      button.classList.toggle("is-rated", row.rating != null);
      button.classList.toggle("is-favorite", row.favorite);
      button.classList.toggle("is-next", row.next);
      const tint = button.querySelector(".tint");
      tint.style.background = row.rating == null ? "" : ratingColor(row.rating);
      button.querySelector(".poster-score").textContent = row.rating == null
        ? ""
        : `★  ${row.rating.toFixed(1).replace(".", ",")}`;
    });
    wall.querySelectorAll(".genre-bar").forEach((bar) => {
      const films = bar.dataset.ids.split(",").filter(Boolean).map((id) => byId.get(id)).filter(Boolean);
      const avg = myAverage(films);
      bar.querySelector(".genre-score").textContent = avg == null ? "–" : `★  ${avg.toFixed(1).replace(".", ",")}`;
      bar.querySelector(".genre-count").textContent = films.length === 1 ? "1 Film" : `${films.length} Filme`;
    });
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
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.left - base.left + a.width / 2));
    line.setAttribute("y1", String(a.top - base.top + a.height / 2));
    line.setAttribute("x2", String(b.left - base.left + b.width / 2));
    line.setAttribute("y2", String(b.top - base.top + b.height / 2));
    line.setAttribute("stroke", "#fff");
    line.setAttribute("stroke-width", "1.4");
    if (active.tier === "mid") line.setAttribute("stroke-dasharray", "7 8");
    if (active.tier === "weak") line.setAttribute("stroke-dasharray", "2 9");
    wires.append(line);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
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

  function renderPanel(film) {
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
      const rating = next > 0 ? next : null;
      value.textContent = formatScore(rating);
      writeEntry(film.id, { rating });
      paint();
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
    memo.addEventListener("input", () => writeEntry(film.id, { memo: memo.value }));
    field.append(rateLabel, rateRow, memoLabel, memo);
    panel.append(field);

    const toggles = el("div", "toggles block");
    toggles.append(
      toggle("Gesehen", row.watched, (on) => {
        writeEntry(film.id, { watched: on });
        renderPanel(film);
        paint();
      }),
      toggle("Favorit", row.favorite, (on) => {
        writeEntry(film.id, { favorite: on });
        renderPanel(film);
        paint();
      }),
      toggle("Als Nächstes", row.next, (on) => {
        writeEntry(film.id, { next: on });
        renderPanel(film);
        paint();
      }),
    );
    panel.append(toggles);

    [
      ["Regisseur", (link) => link.reasons.includes("Regisseur")],
      ["Kontext", (link) => link.reasons.includes("Kontext")],
      ["Genre", (link) => link.reasons.includes("Genre")],
      ["Zeit", (link) => link.reasons.includes("Zeit")],
    ].forEach(([name, test]) => {
      const items = links.filter(test).slice(0, 6);
      if (!items.length) return;
      const group = el("section", "group");
      group.append(el("h2", null, name));
      items.forEach((link) => {
        const other = byId.get(link.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "link";
        button.dataset.id = other.id;
        if (other.id === activeLinkId) button.classList.add("is-active");
        button.append(
          el("span", "link-title", other.title),
          el("span", "link-meta", linkMeta(film, other, link, name)),
        );
        button.addEventListener("pointerenter", (event) => {
          if (event.pointerType === "touch") return;
          setActiveLink(other.id);
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

  function setMode(next) {
    mode = next;
    modeGenre.setAttribute("aria-selected", next === "genre" ? "true" : "false");
    modeDirector.setAttribute("aria-selected", next === "director" ? "true" : "false");
    buildWall();
  }

  function showResults(query) {
    const q = query.trim().toLowerCase();
    results.replaceChildren();
    if (!q) {
      results.hidden = true;
      return;
    }
    const hits = FILMS.filter((film) => (
      `${film.title} ${film.original || ""} ${film.director || ""}`.toLowerCase().includes(q)
    )).slice(0, 8);
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
        openFilm(film, true);
      });
      item.append(button);
      results.append(item);
    });
    results.hidden = false;
  }

  async function readPosters() {
    try {
      const res = await fetch("/api/posters");
      if (res.ok) {
        const data = await res.json();
        if (data.posters && Object.keys(data.posters).length) return data;
      }
    } catch {
      /* a static host has no API */
    }
    try {
      const res = await fetch("data/posters.json");
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
        if (typeof url === "string" && url && posters.get(id) !== url) {
          posters.set(id, url);
          const image = wall.querySelector(`[data-id="${id}"] img`);
          if (image) image.src = url;
          changed = true;
        }
      });
      if (changed) requestAnimationFrame(drawLink);
      if (data.done || data.configured === false) return;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  modeGenre.addEventListener("click", () => setMode("genre"));
  modeDirector.addEventListener("click", () => setMode("director"));
  modeRating.addEventListener("click", () => {
    ratingView = !ratingView;
    modeRating.setAttribute("aria-pressed", ratingView ? "true" : "false");
    paint();
  });

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
  const addButton = document.getElementById("add-film");
  const addForm = document.getElementById("add-form");
  const addQuery = document.getElementById("add-query");
  const addStatus = document.getElementById("add-status");

  function closeAdd() {
    addForm.hidden = true;
    addButton.setAttribute("aria-expanded", "false");
    addStatus.textContent = "";
  }

  function placeFilm(film) {
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
    buildWall();
    openFilm(film, true);
  }

  addButton.addEventListener("click", () => {
    const open = addForm.hidden;
    addForm.hidden = !open;
    addButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) addQuery.focus();
  });

  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = addQuery.value.trim();
    if (!query) {
      addStatus.textContent = "Titel oder IMDb-Link eintragen.";
      return;
    }
    addStatus.textContent = "Ich hole Cover und IMDb-Wertung.";
    addForm.querySelector("button[type=submit]").disabled = true;
    try {
      const response = await fetch(`/api/film?q=${encodeURIComponent(query)}`);
      const data = response.ok ? await response.json() : null;
      if (!data?.film) {
        addStatus.textContent = "Dazu finde ich keinen Film.";
        return;
      }
      addQuery.value = "";
      placeFilm(data.film);
    } catch {
      addStatus.textContent = "Der Abruf ist gerade nicht möglich.";
    } finally {
      addForm.querySelector("button[type=submit]").disabled = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      results.hidden = true;
      if (!addForm.hidden) {
        closeAdd();
        return;
      }
      clearSelection();
    }
  });
  window.addEventListener("resize", () => drawLink());

  buildWall();
  loadPosters();
})();
