/* Farben der Kugel (Login-Animation und Profilkugel) in OKLab.
   Eine «Welle» ist [base, third, middle, top] = von unten nach oben = Profilkugel [outer, under, mid, core]. */
(() => {
  const R = Math.random;

  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    const x = Math.min(1, Math.max(0, c));
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  }

  function rgbToLab(r, g, b) {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  function labToLinear(c) {
    const l_ = c[0] + 0.3963377774 * c[1] + 0.2158037573 * c[2];
    const m_ = c[0] - 0.1055613458 * c[1] - 0.0638541728 * c[2];
    const s_ = c[0] - 0.0894841775 * c[1] - 1.2914855480 * c[2];
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
  }

  function hslToRgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }

  function cssToLab(value) {
    const text = String(value || '').trim();
    let rgb = null;
    const hex = text.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const hsl = text.match(/hsl\(\s*([0-9.]+)\s*,?\s*([0-9.]+)%\s*,?\s*([0-9.]+)%\s*\)/i);
    if (!rgb && hsl) rgb = hslToRgb(Number(hsl[1]) % 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    if (!rgb) rgb = [0.6, 0.6, 0.6];
    return rgbToLab(rgb[0], rgb[1], rgb[2]);
  }

  function labToHsl(lab) {
    const [r, g, b] = labToLinear(lab).map(linearToSrgb);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return `hsl(${Math.round(h) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
  }

  function lch(L, C, hDeg) {
    const h = hDeg * Math.PI / 180;
    return [L, C * Math.cos(h), C * Math.sin(h)];
  }

  function fit(L, C, hDeg) {
    let c = C;
    while (c > 0.03) {
      const lab = lch(L, c, hDeg);
      if (labToLinear(lab).every((x) => x >= -0.0005 && x <= 1.0005)) return lab;
      c -= 0.004;
    }
    return lch(L, 0.03, hDeg);
  }

  function hueDist(a, b) {
    const d = Math.abs((((a - b) % 360) + 360) % 360);
    return d > 180 ? 360 - d : d;
  }

  function isBrownZone(h) {
    const x = ((h % 360) + 360) % 360;
    return x > 35 && x < 110;
  }

  const FALLBACK = ['#F4B48E', '#4A3BC4', '#2F5BEA', '#6FE3F0'];

  // Schwarz-Weiss (Login): helle und dunkle Bänder wechseln sich ab, oben am hellsten.
  function greyWave() {
    const g = (a, b) => [a + R() * (b - a), 0, 0];
    if (R() < 0.5) return [g(0.84, 0.95), g(0.16, 0.28), g(0.62, 0.76), g(0.92, 0.98)];
    return [g(0.20, 0.32), g(0.68, 0.82), g(0.30, 0.42), g(0.92, 0.98)];
  }

  // Farbe (Registrieren und neue Profilkugeln): Farbrichtung, milde und kräftige Töne gemischt, nie schwarz.
  function colourWave() {
    for (let tries = 0; tries < 40; tries += 1) {
      const dir = R() < 0.5 ? 1 : -1;
      const hMid = R() * 360;
      const hTop = hMid + dir * (30 + R() * 40);
      const hThird = hMid - dir * (14 + R() * 18);
      let Lt = 0.84 + R() * 0.06;
      let Lm = 0.60 + R() * 0.08;
      let L3 = 0.38 + R() * 0.14;
      if (isBrownZone(hTop)) Lt = Math.max(Lt, 0.88);
      if (isBrownZone(hMid)) Lm = Math.max(Lm, 0.76);
      if (isBrownZone(hThird)) L3 = Math.max(L3, 0.70);
      const hBase = R() * 360;
      if (Math.min(hueDist(hBase, hTop), hueDist(hBase, hMid), hueDist(hBase, hThird)) < 70) continue;
      let Lb;
      let Cb;
      if (R() < 0.6 || isBrownZone(hBase)) {
        Lb = 0.74 + R() * 0.12;
        Cb = 0.08 + R() * 0.07;
      } else {
        Lb = 0.42 + R() * 0.12;
        Cb = 0.15 + R() * 0.06;
      }
      const mode = Math.floor(R() * 3);
      const k = mode === 0 ? [0.55, 1, 1, 1] : mode === 1 ? [1, 0.6, 0.55, 0.6] : [0.6, 1, 0.55, 1];
      return [fit(Lb, Cb * k[0] + 0.02, hBase), fit(L3, 0.2 * k[1], hThird), fit(Lm, 0.21 * k[2], hMid), fit(Lt, 0.15 * k[3], hTop)];
    }
    return FALLBACK.map(cssToLab);
  }

  // wild, aber ausgewogen: 1–2 Schichten knallig (maximal gesättigt, mutige Farbsprünge),
  // die übrigen mild – hell-pastell oder tief-dunkel –, damit nie die ganze Kugel grell ist
  function wildWave() {
    const base = R() * 360;
    const scheme = Math.floor(R() * 4);
    const dir = R() < 0.5 ? 1 : -1;
    let hues;
    if (scheme === 0) hues = [base, base + dir * 45, base + dir * 95, base + dir * 150];
    else if (scheme === 1) hues = [base + 180, base + dir * 20, base, base - dir * 35];
    else if (scheme === 2) hues = [base, base + 120, base + 240, base + 120 + dir * 30];
    else hues = [base + 150 + R() * 60, base + dir * 60, base, base + dir * 30];
    const light = [0.66 + R() * 0.1, 0.52 + R() * 0.12, 0.6 + R() * 0.12, 0.82 + R() * 0.08];
    // der Rand (grösste Fläche) ist nur selten knallig
    const pool = R() < 0.2 ? [0, 1, 2, 3] : [1, 2, 3];
    const strong = new Set();
    const count = R() < 0.55 ? 1 : 2;
    while (strong.size < count) strong.add(pool[Math.floor(R() * pool.length)]);
    return hues.map((h, i) => {
      const hue = ((h % 360) + 360) % 360;
      if (strong.has(i)) {
        // Gelb/Oliv nur hell (sonst wird es braun-trüb)
        const L = hue > 30 && hue < 130 ? Math.max(light[i], 0.84) : light[i];
        return fit(L, 0.34, hue);
      }
      const pale = R() < 0.55;
      const L = pale ? 0.84 + R() * 0.1 : 0.24 + R() * 0.16;
      const C = pale ? 0.03 + R() * 0.06 : 0.02 + R() * 0.06;
      return fit(L, C, hue);
    });
  }

  // wie weich die Übergänge auf der Kugel sein sollen: je härter der Kontrast benachbarter Schichten, desto weicher
  function edgeOf(colours) {
    let most = 0;
    for (let i = 1; i < colours.length; i += 1) {
      const a = colours[i - 1];
      const b = colours[i];
      most = Math.max(most, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
    return Math.min(1, Math.max(0, (most - 0.18) / 0.32)) * 0.12;
  }

  // selten: Schwarz-, Weiss- oder Grautöne mischen sich in einen Verlauf
  function rareWave() {
    const pick = Math.floor(R() * 3);
    if (pick === 0) return greyWave();
    const w = colourWave();
    const slot = 1 + Math.floor(R() * 3);
    if (pick === 1) w[slot === 3 ? 1 : slot] = [0.12 + R() * 0.06, 0, 0];
    else w[slot] = [0.95 + R() * 0.03, 0, 0];
    return w;
  }

  // dieselbe weiche Kurve wie im Shader (B-Spline in OKLCh) an Position s
  function samplePath(slotAt, s) {
    const i = Math.floor(s);
    const t = s - i;
    const lchOf = (c) => {
      const C = Math.hypot(c[1], c[2]);
      return [c[0], C, C > 0.0001 ? Math.atan2(c[2], c[1]) : 0];
    };
    const wrap = (d) => (d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d);
    const a = lchOf(slotAt(i - 1));
    const b = lchOf(slotAt(i));
    const c = lchOf(slotAt(i + 1));
    const d = lchOf(slotAt(i + 2));
    if (b[1] < 0.02) b[2] = c[2];
    if (c[1] < 0.02) c[2] = b[2];
    if (a[1] < 0.02) a[2] = b[2];
    if (d[1] < 0.02) d[2] = c[2];
    a[2] = b[2] + wrap(a[2] - b[2]);
    c[2] = b[2] + wrap(c[2] - b[2]);
    d[2] = c[2] + wrap(d[2] - c[2]);
    const t2 = t * t;
    const t3 = t2 * t;
    const w0 = (1 - 3 * t + 3 * t2 - t3) / 6;
    const w1 = (3 * t3 - 6 * t2 + 4) / 6;
    const w2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
    const w3 = t3 / 6;
    const r = [0, 1, 2].map((k) => a[k] * w0 + b[k] * w1 + c[k] * w2 + d[k] * w3);
    return [r[0], r[1] * Math.cos(r[2]), r[1] * Math.sin(r[2])];
  }

  function chroma(lab) {
    return Math.hypot(lab[1], lab[2]);
  }

  function waveToAvatar(wave, seed) {
    const w = Array.isArray(wave) && wave.length === 4 ? wave : colourWave();
    return {
      outer: labToHsl(w[0]),
      under: labToHsl(w[1]),
      mid: labToHsl(w[2]),
      core: labToHsl(w[3]),
      seed: seed == null ? Math.floor(R() * 1e9) : seed,
    };
  }

  function avatarToWave(colors) {
    const c = colors || {};
    return [cssToLab(c.outer), cssToLab(c.under), cssToLab(c.mid), cssToLab(c.core)];
  }

  globalThis.SphereColours = {
    greyWave,
    colourWave,
    rareWave,
    wildWave,
    edgeOf,
    samplePath,
    chroma,
    lch,
    fit,
    isBrownZone,
    labToLinear,
    cssToLab,
    labToHsl,
    waveToAvatar,
    avatarToWave,
    randomAvatar: () => waveToAvatar(colourWave()),
  };
})();
