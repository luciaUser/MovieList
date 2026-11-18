(function attachSimilarity(root) {
  const SETS = {
    genres: ['Genre', 'genre'],
    subgenres: ['Subgenre', 'subgenre'],
    themes: ['Thema', 'theme'],
    tone: ['Ton', 'tone'],
    narrative: ['Erzählweise', 'narrative'],
    origin: ['Herkunft', 'origin'],
  };

  let idf = null;

  function config() {
    return root.SimilarityConfig;
  }

  function list(film, field) {
    const value = film?.[field];
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === 'string' && item.trim());
  }

  function bag(film, field) {
    const counts = new Map();
    list(film, field).forEach((value, index) => {
      const amount = field === 'genres' && index === 0 ? 2 : 1;
      counts.set(value, Math.max(counts.get(value) || 0, amount));
    });
    return counts;
  }

  function prepare(films) {
    const rows = Array.isArray(films) ? films : [];
    const counts = {};
    Object.keys(SETS).forEach((field) => { counts[field] = new Map(); });
    rows.forEach((film) => {
      Object.keys(SETS).forEach((field) => {
        new Set(list(film, field)).forEach((value) => {
          counts[field].set(value, (counts[field].get(value) || 0) + 1);
        });
      });
    });
    const total = Math.max(rows.length, 1);
    idf = {};
    Object.keys(SETS).forEach((field) => {
      idf[field] = new Map();
      counts[field].forEach((count, value) => {
        idf[field].set(value, Math.log(1 + total / count));
      });
    });
  }

  function weightOf(field, value) {
    return idf?.[field]?.get(value) || 0;
  }

  function jaccard(a, b, field) {
    const left = bag(a, field);
    const right = bag(b, field);
    if (!left.size || !right.size) return null;
    let shared = 0;
    let union = 0;
    const parts = [];
    new Set([...left.keys(), ...right.keys()]).forEach((key) => {
      const weight = weightOf(field, key);
      const countA = left.get(key) || 0;
      const countB = right.get(key) || 0;
      shared += Math.min(countA, countB) * weight;
      union += Math.max(countA, countB) * weight;
      if (countA && countB && weight) parts.push({ key, mass: Math.min(countA, countB) * weight });
    });
    if (!union) return { sim: 0, union: 0, parts: [] };
    return { sim: shared / union, union, parts };
  }

  function yearNumber(film) {
    if (typeof film?.yearNum === 'number' && Number.isFinite(film.yearNum)) return film.yearNum;
    const match = String(film?.year || '').match(/\d{4}/);
    return match ? Number(match[0]) : null;
  }

  function text(value) {
    return String(value || '').trim();
  }

  function similarity(a, b, mode) {
    const weights = config().weights[mode] || config().weights.links;
    const modeSum = Object.values(weights).reduce((sum, value) => sum + value, 0);
    const reasons = [];
    let weighted = 0;
    let used = 0;

    function keep(weight, sim) {
      if (!weight || sim == null) return;
      weighted += weight * sim;
      used += weight;
    }

    Object.entries(SETS).forEach(([field, [prefix, kind]]) => {
      const weight = weights[field];
      const result = weight ? jaccard(a, b, field) : null;
      if (!result) return;
      keep(weight, result.sim);
      result.parts.forEach((part) => {
        reasons.push({
          kind,
          label: `${prefix}: ${part.key}`,
          contribution: result.union ? weight * (part.mass / result.union) : 0,
        });
      });
    });

    const epochReady = text(a?.epoch) && text(b?.epoch);
    const placeReady = text(a?.place) && text(b?.place);
    if (weights.epochPlace && (epochReady || placeReady)) {
      const parts = [];
      if (epochReady) parts.push({ kind: 'epoch', label: 'gleiche Epoche', sim: a.epoch === b.epoch ? 1 : 0 });
      if (placeReady) parts.push({ kind: 'place', label: 'gleicher Ort', sim: a.place === b.place ? 1 : 0 });
      const sim = parts.reduce((sum, part) => sum + part.sim, 0) / parts.length;
      keep(weights.epochPlace, sim);
      parts.forEach((part) => {
        if (!part.sim) return;
        reasons.push({
          kind: part.kind,
          label: part.label,
          contribution: weights.epochPlace * (part.sim / parts.length),
        });
      });
    }

    if (weights.intensity && typeof a?.intensity === 'number' && typeof b?.intensity === 'number') {
      const sim = 1 - Math.abs(a.intensity - b.intensity) / 4;
      keep(weights.intensity, sim);
      if (sim >= 0.5) {
        reasons.push({ kind: 'intensity', label: 'ähnliche Intensität', contribution: weights.intensity * sim });
      }
    }

    const leftYear = yearNumber(a);
    const rightYear = yearNumber(b);
    if (weights.year && leftYear != null && rightYear != null) {
      const sim = Math.exp(-Math.abs(leftYear - rightYear) / 8);
      keep(weights.year, sim);
      if (sim >= 0.5) {
        reasons.push({ kind: 'year', label: 'ähnliches Jahr', contribution: weights.year * sim });
      }
    }

    const scale = used ? modeSum / used : 0;
    const coverage = modeSum ? used / modeSum : 0;
    const thin = Math.sqrt(coverage);
    let score = (used ? (weighted / used) * modeSum : 0) * thin;
    reasons.forEach((reason) => { reason.contribution *= scale * thin; });

    if (mode === 'links') {
      const bonus = config().bonuses;
      const directorA = text(a?.director);
      const directorB = text(b?.director);
      if (directorA && directorA.toLowerCase() === directorB.toLowerCase()) {
        score += bonus.director;
        reasons.push({ kind: 'director', label: `Regie: ${directorA}`, contribution: bonus.director });
      }
      const franchiseA = text(a?.franchise);
      const franchiseB = text(b?.franchise);
      if (franchiseA && franchiseA.toLowerCase() === franchiseB.toLowerCase()) {
        score += bonus.franchise;
        reasons.push({ kind: 'franchise', label: `Franchise: ${franchiseA}`, contribution: bonus.franchise });
      }
      const names = new Map();
      list(a, 'cast').forEach((name) => names.set(name.toLowerCase(), name));
      [...new Set(list(b, 'cast').map((name) => names.get(name.toLowerCase())).filter(Boolean))]
        .slice(0, bonus.castMax)
        .forEach((name) => {
          score += bonus.cast;
          reasons.push({ kind: 'cast', label: `Mit: ${name}`, contribution: bonus.cast });
        });
      score = Math.min(1, score);
    }

    reasons.sort((left, right) => right.contribution - left.contribution || left.label.localeCompare(right.label, 'de'));
    return {
      score,
      reasons: reasons.map((reason) => ({ kind: reason.kind, label: reason.label })),
    };
  }

  function neighbors(film, films, mode, k) {
    const ranked = [];
    (films || []).forEach((other) => {
      if (!other || other.id === film.id) return;
      const result = similarity(film, other, mode);
      ranked.push({ film: other, score: result.score, reasons: result.reasons });
    });
    ranked.sort((left, right) => right.score - left.score || String(left.film.title).localeCompare(String(right.film.title), 'de'));
    return ranked.slice(0, k);
  }

  root.Similarity = { prepare, similarity, neighbors };
})(globalThis);
