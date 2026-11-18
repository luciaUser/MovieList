(function attachLayout(root) {
  const KEYS = [
    'genreGap',
    'familyScale',
    'subGap',
    'mix',
    'kinFull',
    'kinWeight',
    'genreFamilies',
    'apart',
    'perplexity',
    'iterations',
    'learningRate',
    'exaggeration',
    'exaggerationIters',
    'momentum',
    'momentumFinal',
    'seed',
    'aspect',
    'margin',
    'poster',
    'neighborK',
    'placeK',
    'collisionTicks',
  ];

  function settings(opts) {
    const next = { ...root.SimilarityConfig.layout };
    KEYS.forEach((key) => {
      if (opts && opts[key] != null) next[key] = opts[key];
    });
    return next;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pause() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  function pairKey(a, b) {
    return String(a) < String(b) ? `${a}\0${b}` : `${b}\0${a}`;
  }

  function mainGenre(film) {
    return film?.genres?.[0] || '';
  }

  function firstSub(film) {
    return film?.subgenres?.[0] || '';
  }

  function readPosition(positions, id) {
    if (!positions) return null;
    const point = typeof positions.get === 'function' ? positions.get(id) : positions[id];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return point;
  }

  function listsGenre(film, genre) {
    const genres = film?.genres || [];
    return genres.some((item, index) => item === genre && (index === 0 || item !== 'Drama'));
  }

  function genreKinship(films) {
    const size = new Map();
    const from = new Map();
    films.forEach((film) => {
      const main = mainGenre(film);
      if (!main) return;
      size.set(main, (size.get(main) || 0) + 1);
      const seen = new Set();
      (film.genres || []).slice(1).forEach((genre) => {
        if (!genre || genre === main || genre === 'Drama' || seen.has(genre)) return;
        seen.add(genre);
        const key = `${main}\0${genre}`;
        from.set(key, (from.get(key) || 0) + 1);
      });
    });
    const kin = new Map();
    const names = [...size.keys()];
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const left = names[i];
        const right = names[j];
        const forth = (from.get(`${left}\0${right}`) || 0) / (size.get(left) || 1);
        const back = (from.get(`${right}\0${left}`) || 0) / (size.get(right) || 1);
        kin.set(pairKey(left, right), Math.min(1, (forth + back) / 2));
      }
    }
    return kin;
  }

  function distanceOf(left, right, sim, tune, kin) {
    let value = 1 - sim;
    const leftGenre = mainGenre(left);
    const rightGenre = mainGenre(right);
    if (leftGenre && rightGenre && leftGenre !== rightGenre) {
      const family = (tune.genreFamilies || []).some((group) => group.includes(leftGenre) && group.includes(rightGenre));
      if (family) value *= tune.familyScale || 0.7;
      else {
        const near = kin.get(pairKey(leftGenre, rightGenre)) || 0;
        const pull = Math.min(1, near / (tune.kinFull || 0.22)) * (tune.kinWeight || 0);
        let gap = tune.genreGap * (1 - pull);
        if (listsGenre(left, rightGenre) || listsGenre(right, leftGenre)) gap *= tune.mix;
        value += gap;
      }
    } else if (leftGenre === rightGenre && firstSub(left) !== firstSub(right)) {
      value += tune.subGap;
    }
    return value;
  }

  function hBeta(squared, beta) {
    const n = squared.length;
    let sum = 0;
    const row = new Float64Array(n);
    for (let j = 0; j < n; j += 1) {
      if (squared[j] < 0) continue;
      const value = Math.exp(-squared[j] * beta);
      row[j] = value;
      sum += value;
    }
    if (sum < 1e-20) sum = 1e-20;
    let entropy = 0;
    for (let j = 0; j < n; j += 1) {
      if (squared[j] < 0) continue;
      row[j] /= sum;
      if (row[j] > 1e-12) entropy -= row[j] * Math.log2(row[j]);
    }
    return { entropy, row };
  }

  function affinities(squared, perplexity) {
    const n = squared.length;
    const cond = Array.from({ length: n }, () => new Float64Array(n));
    const target = Math.log2(Math.min(perplexity, Math.max(n - 1.01, 1.01)));
    for (let i = 0; i < n; i += 1) {
      let beta = 1;
      let low = -Infinity;
      let high = Infinity;
      let row = null;
      for (let step = 0; step < 60; step += 1) {
        const result = hBeta(squared[i], beta);
        row = result.row;
        const diff = result.entropy - target;
        if (Math.abs(diff) < 1e-5) break;
        if (diff > 0) {
          low = beta;
          beta = high === Infinity ? beta * 2 : (beta + high) / 2;
        } else {
          high = beta;
          beta = low === -Infinity ? beta / 2 : (beta + low) / 2;
        }
      }
      cond[i] = row;
    }
    const joint = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const value = (cond[i][j] + cond[j][i]) / (2 * n);
        joint[i][j] = value;
        joint[j][i] = value;
      }
    }
    return joint;
  }

  async function embed(squared, tune, report) {
    const n = squared.length;
    const joint = affinities(squared, tune.perplexity);
    const rng = mulberry32(tune.seed);
    const y = new Float64Array(n * 2);
    const vel = new Float64Array(n * 2);
    const gains = new Float64Array(n * 2);
    const grad = new Float64Array(n * 2);
    const weight = new Float64Array(n * n);
    for (let i = 0; i < n; i += 1) {
      y[i * 2] = (rng() - 0.5) * 1e-4;
      y[i * 2 + 1] = (rng() - 0.5) * 1e-4;
      gains[i * 2] = 1;
      gains[i * 2 + 1] = 1;
    }
    const ticks = tune.iterations;
    for (let tick = 0; tick < ticks; tick += 1) {
      const boost = tick < tune.exaggerationIters ? tune.exaggeration : 1;
      let normal = 0;
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const dx = y[i * 2] - y[j * 2];
          const dy = y[i * 2 + 1] - y[j * 2 + 1];
          const pull = 1 / (1 + dx * dx + dy * dy);
          weight[i * n + j] = pull;
          weight[j * n + i] = pull;
          normal += pull * 2;
        }
      }
      if (normal < 1e-12) normal = 1e-12;
      grad.fill(0);
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const dx = y[i * 2] - y[j * 2];
          const dy = y[i * 2 + 1] - y[j * 2 + 1];
          const falloff = weight[i * n + j];
          const q = falloff / normal;
          const force = 4 * ((joint[i][j] * boost) - q) * falloff;
          grad[i * 2] += force * dx;
          grad[i * 2 + 1] += force * dy;
          grad[j * 2] -= force * dx;
          grad[j * 2 + 1] -= force * dy;
        }
      }
      const momentum = tick < tune.exaggerationIters ? tune.momentum : tune.momentumFinal;
      let meanX = 0;
      let meanY = 0;
      for (let i = 0; i < n; i += 1) {
        for (let axis = 0; axis < 2; axis += 1) {
          const at = i * 2 + axis;
          const same = grad[at] * vel[at] > 0;
          gains[at] = Math.max(0.01, same ? gains[at] * 0.8 : gains[at] + 0.2);
          vel[at] = (momentum * vel[at]) - (tune.learningRate * gains[at] * grad[at]);
          y[at] += vel[at];
        }
        meanX += y[i * 2];
        meanY += y[i * 2 + 1];
      }
      meanX /= n;
      meanY /= n;
      for (let i = 0; i < n; i += 1) {
        y[i * 2] -= meanX;
        y[i * 2 + 1] -= meanY;
      }
      if (report) await report(tick + 1, ticks);
    }
    const points = [];
    for (let i = 0; i < n; i += 1) points.push({ x: y[i * 2], y: y[i * 2 + 1] });
    return points;
  }

  function medianOf(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function anchorCore(points) {
    const mx = medianOf(points.map((point) => point.x));
    const my = medianOf(points.map((point) => point.y));
    const near = points.filter((point) => Math.hypot(point.x - mx, point.y - my) <= 0.18);
    return near.length ? near : points;
  }

  function setApart(films, points, tune) {
    const apart = tune.apart;
    if (!apart || !apart.genre || !apart.above) return;
    const members = [];
    const anchor = [];
    films.forEach((film, index) => {
      if (mainGenre(film) === apart.genre) members.push(points[index]);
      else if (mainGenre(film) === apart.above) anchor.push(points[index]);
    });
    if (!members.length || !anchor.length) return;
    const gap = apart.gap == null ? 0.04 : apart.gap;
    const core = anchorCore(anchor);
    const ax = core.reduce((sum, point) => sum + point.x, 0) / core.length;
    const top = core.reduce((min, point) => Math.min(min, point.y), Infinity);
    const cx = members.reduce((sum, point) => sum + point.x, 0) / members.length;
    const bottom = members.reduce((max, point) => Math.max(max, point.y), -Infinity);
    members.forEach((point) => {
      point.x += ax - cx;
      point.y += (top - gap) - bottom;
    });
    const ceiling = tune.margin * 0.5;
    const minY = members.reduce((min, point) => Math.min(min, point.y), Infinity);
    if (minY < ceiling) {
      const lift = ceiling - minY;
      members.forEach((point) => { point.y += lift; });
    }
    const others = points.filter((point) => !members.includes(point));
    const clearance = Math.max(tune.poster * 4, 0.016);
    for (let step = 0; step < 8; step += 1) {
      const crowded = members.some((point) => others.some((other) => (
        Math.hypot(point.x - other.x, point.y - other.y) < clearance
      )));
      if (!crowded) break;
      if (members.some((point) => point.y - 0.008 < ceiling)) break;
      members.forEach((point) => { point.y -= 0.008; });
    }
    const targetX = members.reduce((sum, point) => sum + point.x, 0) / members.length;
    const targetY = members.reduce((sum, point) => sum + point.y, 0) / members.length;
    const pull = apart.pull == null ? 0.06 : apart.pull;
    if (!pull) return;
    films.forEach((film, index) => {
      if (mainGenre(film) === apart.genre || !listsGenre(film, apart.genre)) return;
      const point = points[index];
      point.x += (targetX - point.x) * pull;
      point.y += (targetY - point.y) * pull;
    });
  }

  function fitFrame(points, tune) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
    const spanX = (maxX - minX) || 1;
    const spanY = (maxY - minY) || 1;
    const width = tune.aspect;
    const height = 1;
    const pad = tune.margin;
    const innerW = width * (1 - (2 * pad));
    const innerH = height * (1 - (2 * pad));
    points.forEach((point) => {
      point.x = (pad * width) + (((point.x - minX) / spanX) * innerW);
      point.y = (pad * height) + (((point.y - minY) / spanY) * innerH);
    });
  }

  function separate(points, tune) {
    const minDist = tune.poster * 2;
    const width = tune.aspect;
    const height = 1;
    for (let tick = 0; tick < tune.collisionTicks; tick += 1) {
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          let dx = points[j].x - points[i].x;
          let dy = points[j].y - points[i].y;
          let dist = Math.hypot(dx, dy);
          if (dist >= minDist) continue;
          if (dist < 1e-8) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          points[i].x -= ux * push;
          points[i].y -= uy * push;
          points[j].x += ux * push;
          points[j].y += uy * push;
        }
      }
      points.forEach((point) => {
        point.x = Math.min(width, Math.max(0, point.x));
        point.y = Math.min(height, Math.max(0, point.y));
      });
    }
  }

  function cross(o, a, b) {
    return ((a.x - o.x) * (b.y - o.y)) - ((a.y - o.y) * (b.x - o.x));
  }

  function convexHull(points) {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length <= 2) return sorted;
    const lower = [];
    sorted.forEach((point) => {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    });
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const point = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function outward(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dy / len, y: -dx / len };
  }

  function offsetHull(points, radius) {
    const n = points.length;
    if (n < 3) return points;
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const prev = points[(i - 1 + n) % n];
      const cur = points[i];
      const next = points[(i + 1) % n];
      const n1 = outward(prev, cur);
      const n2 = outward(cur, next);
      let bx = n1.x + n2.x;
      let by = n1.y + n2.y;
      const len = Math.hypot(bx, by) || 1;
      bx /= len;
      by /= len;
      const align = Math.max(0.35, bx * n1.x + by * n1.y);
      out.push({ x: cur.x + (bx * radius / align), y: cur.y + (by * radius / align) });
    }
    return out;
  }

  function curve(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * p1) + ((-p0 + p2) * t) + (((2 * p0) - (5 * p1) + (4 * p2) - p3) * t2) + (((-p0) + (3 * p1) - (3 * p2) + p3) * t3));
  }

  function smoothClosed(points, samples) {
    const n = points.length;
    if (n < 3) return points;
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      for (let step = 0; step < samples; step += 1) {
        const t = step / samples;
        out.push({
          x: curve(p0.x, p1.x, p2.x, p3.x, t),
          y: curve(p0.y, p1.y, p2.y, p3.y, t),
        });
      }
    }
    return out;
  }

  function circle(point, radius, count) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      out.push({ x: point.x + (Math.cos(angle) * radius), y: point.y + (Math.sin(angle) * radius) });
    }
    return out;
  }

  function capsule(a, b, radius) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * radius;
    const oy = (dx / len) * radius;
    const ux = (dx / len) * radius;
    const uy = (dy / len) * radius;
    return smoothClosed([
      { x: a.x + ox - ux, y: a.y + oy - uy },
      { x: b.x + ox + ux, y: b.y + oy + uy },
      { x: b.x - ox + ux, y: b.y - oy - uy },
      { x: a.x - ox - ux, y: a.y - oy - uy },
    ], 6);
  }

  function hullOf(members, radius) {
    if (!members.length) return [];
    const x = members.reduce((sum, point) => sum + point.x, 0) / members.length;
    const y = members.reduce((sum, point) => sum + point.y, 0) / members.length;
    const mean = members.reduce((sum, point) => sum + Math.hypot(point.x - x, point.y - y), 0) / members.length;
    const limit = mean * 2.5;
    const kept = mean === 0 ? members.slice() : members.filter((point) => Math.hypot(point.x - x, point.y - y) <= limit + 1e-9);
    const body = kept.length ? kept : members;
    const pad = Math.max(radius, 0.008);
    if (body.length === 1) return circle(body[0], pad, 18);
    if (body.length === 2) return capsule(body[0], body[1], pad);
    return smoothClosed(offsetHull(convexHull(body), pad), 7);
  }

  function islandsOf(films, points, pad) {
    const groups = new Map();
    films.forEach((film, index) => {
      const genre = mainGenre(film);
      if (!genre) return;
      if (!groups.has(genre)) groups.set(genre, []);
      groups.get(genre).push({ film, point: points[index] });
    });
    const order = root.SimilarityConfig.anchors?.order || [];
    const genres = [...groups.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'de');
    });
    return genres.map((genre) => {
      const rows = groups.get(genre);
      const x = rows.reduce((sum, row) => sum + row.point.x, 0) / rows.length;
      const y = rows.reduce((sum, row) => sum + row.point.y, 0) / rows.length;
      return {
        genre,
        x,
        y,
        ids: rows.map((row) => row.film.id).sort((a, b) => String(a).localeCompare(String(b))),
        hull: hullOf(rows.map((row) => row.point), pad),
      };
    });
  }

  function clustersOf(films, points) {
    const groups = new Map();
    films.forEach((film, index) => {
      const genre = mainGenre(film);
      const subgenre = firstSub(film);
      if (!genre || !subgenre) return;
      const key = `${genre}\0${subgenre}`;
      if (!groups.has(key)) groups.set(key, { genre, subgenre, x: 0, y: 0, count: 0 });
      const group = groups.get(key);
      group.x += points[index].x;
      group.y += points[index].y;
      group.count += 1;
    });
    return [...groups.values()]
      .filter((group) => group.count >= 3)
      .map((group) => ({
        genre: group.genre,
        subgenre: group.subgenre,
        x: group.x / group.count,
        y: group.y / group.count,
        count: group.count,
      }))
      .sort((a, b) => a.genre.localeCompare(b.genre, 'de') || b.count - a.count || a.subgenre.localeCompare(b.subgenre, 'de'));
  }

  function edgesOf(films, sims, k) {
    const pairs = new Map();
    films.forEach((film, index) => {
      const ranked = [];
      films.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        ranked.push({ index: otherIndex, sim: sims.get(pairKey(film.id, other.id)) || 0 });
      });
      ranked.sort((a, b) => b.sim - a.sim || String(films[a.index].id).localeCompare(String(films[b.index].id)));
      ranked.slice(0, k).forEach((item) => {
        const lo = Math.min(index, item.index);
        const hi = Math.max(index, item.index);
        const key = `${lo}:${hi}`;
        const prev = pairs.get(key);
        if (!prev || item.sim > prev.sim) {
          pairs.set(key, { source: films[lo].id, target: films[hi].id, sim: item.sim });
        }
      });
    });
    return [...pairs.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  }

  async function layoutAll(films, opts) {
    const options = opts || {};
    const tune = settings(options);
    const chunk = options.chunk || 40;
    const list = (films || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const n = list.length;
    root.Similarity.prepare(list);
    const sims = new Map();
    const kin = genreKinship(list);
    const squared = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const score = root.Similarity.similarity(list[i], list[j], 'layout').score;
        sims.set(pairKey(list[i].id, list[j].id), score);
        const dist = distanceOf(list[i], list[j], score, tune, kin);
        squared[i][j] = dist * dist;
        squared[j][i] = dist * dist;
      }
      squared[i][i] = -1;
      if ((i + 1) % chunk === 0 && i + 1 < n) await pause();
    }
    const points = n ? await embed(squared, tune, async (tick, ticks) => {
      if (tick % chunk !== 0 && tick !== ticks) return;
      if (typeof options.onProgress === 'function') options.onProgress({ tick, ticks });
      if (tick < ticks) await pause();
    }) : [];
    if (points.length) {
      fitFrame(points, tune);
      separate(points, tune);
      setApart(list, points, tune);
    }
    const islands = islandsOf(list, points, Math.max(tune.poster * 2.4, 0.012));
    return {
      nodes: list.map((film, index) => ({ id: film.id, x: points[index].x, y: points[index].y })),
      islands,
      clusters: clustersOf(list, points),
      edges: edgesOf(list, sims, tune.neighborK),
    };
  }

  function placeOne(film, films, positions) {
    const tune = settings();
    const roster = (films || []).some((item) => item && item.id === film.id)
      ? (films || []).slice()
      : (films || []).concat(film);
    root.Similarity.prepare(roster);
    const ranked = roster
      .filter((item) => item && item.id !== film.id)
      .map((item) => ({
        item,
        sim: root.Similarity.similarity(film, item, 'layout').score,
        point: readPosition(positions, item.id),
      }))
      .filter((item) => item.point)
      .sort((a, b) => b.sim - a.sim || String(a.item.id).localeCompare(String(b.item.id)))
      .slice(0, tune.placeK);
    let x = 0;
    let y = 0;
    if (ranked.length) {
      const weight = ranked.reduce((sum, item) => sum + Math.max(item.sim, 0.001), 0);
      x = ranked.reduce((sum, item) => sum + (item.point.x * Math.max(item.sim, 0.001)), 0) / weight;
      y = ranked.reduce((sum, item) => sum + (item.point.y * Math.max(item.sim, 0.001)), 0) / weight;
    }
    const minDist = tune.poster * 2;
    const placed = roster
      .filter((item) => item && item.id !== film.id)
      .map((item) => readPosition(positions, item.id))
      .filter(Boolean);
    for (let tick = 0; tick < tune.collisionTicks; tick += 1) {
      placed.forEach((point) => {
        let dx = x - point.x;
        let dy = y - point.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) return;
        if (dist < 1e-8) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        x += (dx / dist) * (minDist - dist);
        y += (dy / dist) * (minDist - dist);
      });
    }
    const apart = tune.apart;
    if (apart && apart.genre && mainGenre(film) !== apart.genre && listsGenre(film, apart.genre)) {
      const anchors = roster.filter((item) => item && mainGenre(item) === apart.genre && item.id !== film.id);
      const anchorPoints = anchors.map((item) => readPosition(positions, item.id)).filter(Boolean);
      if (anchorPoints.length) {
        const pull = apart.pull == null ? 0.14 : apart.pull;
        const ax = anchorPoints.reduce((sum, point) => sum + point.x, 0) / anchorPoints.length;
        const ay = anchorPoints.reduce((sum, point) => sum + point.y, 0) / anchorPoints.length;
        x += (ax - x) * pull;
        y += (ay - y) * pull;
      }
    }
    return { id: film.id, x, y };
  }

  root.Layout = { layoutAll, placeOne };
})(globalThis);
