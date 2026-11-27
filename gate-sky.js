/* Login-/Registrier-Animation (Raum mit Lichtbändern und Kugel), WebGL.
   Übernommen aus den Claude-Design-Dateien v14 (schwarz-weiss) und v16 (Farbe), ohne React.
   API: const sky = GateSky.create(canvas); sky.start('bw'|'colour'); sky.setMode(...); sky.setHome({x,y,r});
        sky.palette(); sky.login(waveLab, () => ({x,y,r}), done); sky.stop(); */
(() => {
  const S = () => globalThis.SphereColours;
  const imageCache = new Map();
  let imageSky = null;
  let imageFailed = false;

  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uLab[16];
uniform float uShift;
uniform float uWall;
uniform float uHorizon;
uniform vec3 uSphere;
uniform float uCurve;
uniform float uDepth;
uniform vec2 uRoom;
uniform float uFloor;
uniform float uRibs;
uniform vec3 uShimmer;
uniform float uSoft;
uniform float uPhase;
uniform float uCut;

const float H0 = -0.08;
const float D = 0.085;

vec3 pick(float k) {
  vec3 r = uLab[0];
  for (int i = 0; i < 16; i++) { if (float(i) == k) r = uLab[i]; }
  return r;
}

vec3 lchOf(vec3 c) {
  float C = length(c.yz);
  return vec3(c.x, C, C > 0.0001 ? atan(c.z, c.y) : 0.0);
}

float wrapA(float d) {
  if (d > 3.14159265) d -= 6.28318531;
  if (d < -3.14159265) d += 6.28318531;
  return d;
}

float th(float x) {
  float e = exp(2.0 * clamp(x, -10.0, 10.0));
  return (e - 1.0) / (e + 1.0);
}

vec3 labAt(float s) {
  s = clamp(s, 0.0, 15.0);
  float i = floor(s);
  float t = s - i;
  vec3 a = lchOf(pick(max(i - 1.0, 0.0)));
  vec3 b = lchOf(pick(i));
  vec3 c = lchOf(pick(min(i + 1.0, 15.0)));
  vec3 d = lchOf(pick(min(i + 2.0, 15.0)));
  if (b.y < 0.02) b.z = c.z;
  if (c.y < 0.02) c.z = b.z;
  if (a.y < 0.02) a.z = b.z;
  if (d.y < 0.02) d.z = c.z;
  a.z = b.z + wrapA(a.z - b.z);
  c.z = b.z + wrapA(c.z - b.z);
  d.z = c.z + wrapA(d.z - c.z);
  float t2 = t * t;
  float t3 = t2 * t;
  float w0 = (1.0 - 3.0 * t + 3.0 * t2 - t3) / 6.0;
  float w1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
  float w2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
  float w3 = t3 / 6.0;
  vec3 r = a * w0 + b * w1 + c * w2 + d * w3;
  return vec3(r.x, r.y * cos(r.z), r.y * sin(r.z));
}

vec3 toLin(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return max(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0);
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float softEll(vec2 q, vec3 e, float soft) {
  float d = length(vec2(q.x / e.y, (q.y - e.x) / e.z));
  return 1.0 / (1.0 + exp((d - 1.0) / soft));
}

vec3 wallLight(float h, float sx) {
  float u0 = h - H0;
  float s = (u0 >= 0.0 ? u0 / D : u0 / (D * (1.0 - 11.76 * u0))) + uShift;
  vec3 wc = toLin(labAt(s));
  float sp = s + uPhase;
  float band = mix(0.80 + 0.20 * cos(6.28318531 * sp), 0.90 + 0.10 * cos(6.28318531 * sp), uSoft);
  float topd = abs(fract((sp - 5.0) / 8.0 + 0.5) - 0.5) * 8.0;
  float glow = mix(exp(-topd * topd / 0.045), exp(-topd * topd / 0.11) * 0.8, uSoft);
  float fall = exp(-pow(max(h, 0.0) / 0.24, 2.0)) * exp(-pow(max(-h, 0.0) / 0.27, 2.0));
  float cut = 1.0 - smoothstep(0.22, 0.34, h);
  float side = exp(-pow(abs(sx) / uDepth, 2.0));
  float env = fall * cut * side;
  float shd = abs(fract((sp - 6.6) / 8.0 + 0.5) - 0.5) * 8.0;
  float shim = mix(exp(-shd * shd / 0.02), exp(-shd * shd / 0.06) * 0.7, uSoft) * (1.0 - smoothstep(0.12, 0.24, h));
  return wc * (band * 0.52 + glow * 0.85) * env + mix(wc, vec3(1.0), 0.35) * glow * 0.18 * env
       + uShimmer * shim * 0.22 * env;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x / uDpr, uRes.y - gl_FragCoord.y / uDpr);
  float sx = (px.x - uRoom.x) / uRes.y;
  float sy = (uRoom.y - px.y) / uRes.y;
  float bend = uCurve * sx * sx;
  float h = sy * (sy < 0.0 ? 1.7 : 1.0) + bend * max(th(sy / 0.03), 0.0);
  vec3 wall = wallLight(h, sx);

  float cx = abs(px.x - uRoom.x);
  float dl = min(cx, abs(cx - uRes.x * 0.25));
  float rib = exp(-pow(dl / 0.9, 2.0));
  float ribs = uRibs * smoothstep(-0.004, 0.004, sy);
  wall *= 1.0 + 0.9 * ribs * rib;
  wall *= 1.0 - 0.12 * ribs * (1.0 - exp(-pow(dl / 12.0, 2.0)));

  if (sy < 0.0) {
    float depthF = exp(sy / 0.04);
    vec3 refl = wallLight(-sy * 1.4, sx);
    wall += refl * uFloor * depthF;
  }

  vec3 hz = toLin(labAt(-H0 / D + uShift));
  wall += hz * 0.10 * exp(-pow(sy / 0.022, 2.0)) * exp(-pow(sx / uDepth, 2.0));

  vec3 col = wall * uWall;

  vec2 q = vec2(px.x - uSphere.x, uSphere.y - px.y) / uSphere.z;
  float rr = dot(q, q);
  float dist = (sqrt(rr) - 1.0) * uSphere.z;
  float a = 1.0 - smoothstep(-0.7, 0.7, dist);
  vec3 sc = vec3(0.0);
  if (a > 0.0) {
    float soft = mix(0.0, 0.06, uSoft);
    float local = softEll(q, vec3(0.16, 0.955, 0.836), 0.16 + soft)
                + softEll(q, vec3(0.16, 0.93, 0.70), 0.15 + soft)
                + softEll(q, vec3(0.365, 0.645, 0.48), 0.14 + soft);
    sc = toLin(labAt(uShift + mix(-1.0, 3.0, local / 3.0)));
    float nz = sqrt(max(0.0, 1.0 - rr));
    sc *= 0.92 + 0.08 * nz;
    col = mix(col, sc, a);
  }

  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  // Profilbild: nur die Kugel, aussen transparent
  if (uCut > 0.5) {
    gl_FragColor = vec4(toSrgb(sc) + (n - 0.5) / 255.0, a);
    return;
  }
  gl_FragColor = vec4(toSrgb(col) + (n - 0.5) / 255.0, 1.0);
}`;

  const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const UNIFORMS = ['uRes', 'uDpr', 'uLab', 'uShift', 'uWall', 'uHorizon', 'uSphere', 'uCurve', 'uDepth', 'uRoom', 'uFloor', 'uRibs', 'uShimmer', 'uSoft', 'uPhase', 'uCut'];
  const ROOM = { curve: 4, depth: 0.2, floor: 0.1, ribs: 0, cycle: 7 };

  const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
  const easeCubic = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  const approach = (value, goal, dt, rate) => value + (goal - value) * (1 - Math.exp(-dt * rate));
  const black = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];

  class Sky {
    constructor(canvas) {
      this.canvas = canvas;
      this.mode = 'bw';
      this.raf = 0;
      this.E = null;
      this.home = { x: 195, y: 338, r: 100 };
      this.reduce = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.ok = this.initGL();
    }

    initGL() {
      const gl = this.canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
      if (!gl) return false;
      const mk = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.warn('[gate-sky] shader', gl.getShaderInfoLog(sh));
          return null;
        }
        return sh;
      };
      const v = mk(gl.VERTEX_SHADER, VERT);
      const f = mk(gl.FRAGMENT_SHADER, FRAG);
      if (!v || !f) return false;
      const prog = gl.createProgram();
      gl.attachShader(prog, v);
      gl.attachShader(prog, f);
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      UNIFORMS.forEach((name) => { this.u[name] = gl.getUniformLocation(prog, name); });
      this.gl = gl;
      this.labBuf = new Float32Array(48);
      return true;
    }

    size() {
      if (this.fixed) {
        if (this.canvas.width !== this.fixed || this.canvas.height !== this.fixed) {
          this.canvas.width = this.fixed;
          this.canvas.height = this.fixed;
        }
        this.W = this.fixed;
        this.H = this.fixed;
        this.dpr = 1;
        return;
      }
      const W = Math.max(1, this.canvas.clientWidth || window.innerWidth);
      const H = Math.max(1, this.canvas.clientHeight || window.innerHeight);
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      // grosse Bildschirme: Pixelzahl begrenzen, damit die Animation flüssig bleibt
      const budget = 2.6e6;
      if (W * H * dpr * dpr > budget) dpr = Math.max(1, Math.sqrt(budget / (W * H)));
      const w = Math.round(W * dpr);
      const h = Math.round(H * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.W = W;
      this.H = H;
      this.dpr = w / W;
    }

    palette() {
      return this.mode === 'colour' ? S().colourWave() : S().greyWave();
    }

    running() {
      return Boolean(this.E) && this.E.phase !== 'done';
    }

    setHome(home) {
      if (!home) return;
      this.home = { x: home.x, y: home.y, r: home.r };
      if (this.E && !this.raf && this.E.phase !== 'exit' && this.E.phase !== 'done') {
        this.E.sphere = { ...this.home };
        this.E.room = { x: this.home.x, y: this.home.y };
        this.draw();
      }
    }

    start(mode) {
      if (!this.ok) return;
      this.mode = mode === 'colour' ? 'colour' : 'bw';
      this.stopLoop();
      const colour = this.mode === 'colour';
      const H = { ...this.home };
      if (this.reduce) {
        this.E = {
          prev: [[0, 0, 0], [0, 0, 0]], cur: this.palette(), target: null, phase: 'still', u: 0, p: 0, t: 0, time: 0,
          horizon: 1, wall: 1, sphere: H, room: { x: H.x, y: H.y }, intro: false, login: false,
          chroma: colour ? 1 : 0, chromaGoal: colour ? 1 : 0, soft: colour ? 1 : 0, softGoal: colour ? 1 : 0,
        };
        this.draw();
        return;
      }
      this.E = {
        prev: [[0, 0, 0], [0, 0, 0]], cur: black(), target: this.palette(),
        phase: 'introLine', u: 0, p: 0, t: 0, time: 0, riseDur: 2.0,
        horizon: 0, wall: 1, sphere: H, room: { x: H.x, y: H.y },
        intro: true, login: false, isLoginRise: false, darkColour: colour,
        chroma: colour ? 1 : 0, chromaGoal: colour ? 1 : 0, soft: colour ? 1 : 0, softGoal: colour ? 1 : 0,
      };
      this.startLoop();
    }

    setMode(mode) {
      const next = mode === 'colour' ? 'colour' : 'bw';
      if (!this.E) {
        this.start(next);
        return;
      }
      if (this.mode === next) return;
      this.mode = next;
      const E = this.E;
      if (E.login) return;
      const colour = next === 'colour';
      E.chromaGoal = colour ? 1 : 0;
      E.softGoal = colour ? 1 : 0;
      // die wartende Welle ist noch unsichtbar: gleich im neuen Modus wählen
      if (E.phase === 'hold') {
        E.target = this.palette();
        E.darkColour = colour;
      }
      if (this.reduce) {
        E.cur = this.palette();
        E.chroma = E.chromaGoal;
        E.soft = E.softGoal;
        this.draw();
        return;
      }
      if (!this.raf && E.phase !== 'done') this.startLoop();
    }

    // die gerade sichtbare Welle (zum «Einfangen» der Farben bei der Registrierung)
    visibleWave() {
      const E = this.E;
      if (!E) return null;
      if (E.phase === 'rise' && E.target && E.p > 0.5) return E.target;
      return E.cur;
    }

    // Profilfarben beginnen einzulaufen, während im Hintergrund noch geladen wird (landen erst nach release)
    prepare(wave) {
      if (!this.ok) return;
      if (!this.E) this.start(this.mode);
      const E = this.E;
      if (!E || E.login) return;
      E.login = true;
      E.waitRelease = true;
      E.loginWave = wave;
      E.loginAt = E.time;
      E.chromaGoal = 1;
      if (this.reduce) return;
      if (E.phase === 'introLine') {
        E.horizon = 1;
        E.phase = 'hold';
        E.t = 0;
      } else if (E.phase === 'rise' && !E.isLoginRise) {
        const rem = Math.max(0.01, 1 - E.u);
        if (rem * E.riseDur > 0.6) E.riseDur = 0.6 / rem;
      }
      if (!this.raf) this.startLoop();
    }

    // alles geladen: Farben landen fertig auf der Kugel, dann fliegt sie an ihren Platz
    release(targetFn, done) {
      if (!this.ok) {
        if (done) done();
        return;
      }
      this.targetFn = targetFn;
      this.onDone = done;
      const E = this.E;
      if (!E) {
        this.finish();
        return;
      }
      if (this.reduce) {
        E.cur = E.loginWave || E.cur;
        E.target = null;
        E.wall = 0;
        E.horizon = 0;
        E.chroma = 1;
        const to = this.exitTarget();
        if (to) E.sphere = to;
        this.draw();
        window.setTimeout(() => this.finish(), 250);
        return;
      }
      E.waitRelease = false;
      // mindestens ca. 2.2 s seit Beginn der Profilfarben, damit es auch bei schnellem Laden nicht hetzt
      E.landBy = Math.max(E.time + 0.9, (E.loginAt || E.time) + 2.2);
      if (!this.raf) this.startLoop();
    }

    login(wave, targetFn, done) {
      this.prepare(wave);
      this.release(targetFn, done);
    }

    exitTarget() {
      try {
        const box = this.targetFn ? this.targetFn() : null;
        if (box && box.r > 0) return box;
      } catch {
        /* kein Ziel: die Kugel bleibt in der Mitte */
      }
      return null;
    }

    finish() {
      const cb = this.onDone;
      this.onDone = null;
      if (cb) cb();
    }

    startRise(isLogin) {
      const E = this.E;
      if (isLogin) {
        E.target = E.loginWave;
        E.riseDur = 2.4;
        E.isLoginRise = true;
        if (E.landBy != null) E.landBy = Math.max(E.landBy, E.time + 1.4);
      } else {
        if (!E.target) E.target = this.palette();
        E.riseDur = ROOM.cycle * 0.75;
      }
      E.phase = 'rise';
      E.u = 0;
    }

    makeDark(t, ob) {
      const E = this.E;
      if (E.isLoginRise) return [ob, ob];
      const lch = S().lch;
      const hT = Math.atan2(t[3][2], t[3][1]) * 180 / Math.PI;
      if (E.darkColour) {
        const cB = Math.hypot(ob[1], ob[2]);
        const hB = cB < 0.02 ? hT : Math.atan2(ob[2], ob[1]) * 180 / Math.PI;
        const L = (h, l) => (S().isBrownZone(h) ? Math.max(l, 0.72) : l);
        return [S().fit(L(hT, 0.52), 0.15, hT), S().fit(L(hB, 0.48), 0.13, hB)];
      }
      const hB = Math.atan2(ob[2], ob[1]) * 180 / Math.PI;
      return [lch(0.15, 0.04, hT), lch(0.085, 0.015, hB)];
    }

    completeRise() {
      const E = this.E;
      const ob = E.cur[0];
      const dk = E.target ? this.makeDark(E.target, ob) : [ob, ob];
      E.prev = [dk[0], dk[1]];
      E.cur = E.target;
      E.target = null;
      E.u = 0;
      E.p = 0;
      E.intro = false;
      if (E.isLoginRise) {
        E.phase = 'settle';
        E.t = 0;
        return;
      }
      if (E.login) {
        this.startRise(true);
        return;
      }
      E.target = this.palette();
      E.darkColour = this.mode === 'colour';
      E.phase = 'hold';
      E.t = 0;
    }

    update(dt) {
      const E = this.E;
      if (!E) return;
      E.time += dt;
      E.chroma = approach(E.chroma, E.chromaGoal, dt, E.login ? 8 : 2.5);
      E.soft = approach(E.soft, E.softGoal, dt, 2.5);
      if (E.phase !== 'exit' && E.phase !== 'done') {
        const k = 1 - Math.exp(-dt * 6);
        E.sphere = {
          x: E.sphere.x + (this.home.x - E.sphere.x) * k,
          y: E.sphere.y + (this.home.y - E.sphere.y) * k,
          r: E.sphere.r + (this.home.r - E.sphere.r) * k,
        };
        E.room = { x: E.sphere.x, y: E.sphere.y };
      }
      if (E.phase === 'introLine') {
        E.t += dt;
        E.horizon = easeSine(E.t / 0.5);
        if (E.t >= 0.5) {
          E.horizon = 1;
          E.phase = 'rise';
          E.u = 0;
          E.riseDur = 2.6;
        }
      } else if (E.phase === 'rise') {
        if (E.isLoginRise && E.waitRelease) {
          // noch am Laden: die Farben steigen weiter, werden aber langsamer und landen noch nicht ganz
          // bei längerem Laden pendeln sie sanft weiter, damit nichts stillsteht
          const goal = 0.8 + 0.05 * Math.sin((E.time - (E.loginAt || 0)) * 1.2);
          E.u += (goal - E.u) * (1 - Math.exp(-dt / 0.9));
        } else if (E.isLoginRise && E.landBy != null) {
          const left = Math.max(0.05, E.landBy - E.time);
          E.u += (1 - E.u) * Math.min(1, dt / left);
          if (E.landBy - E.time <= 0) E.u = 1;
        } else {
          E.u += dt / E.riseDur;
        }
        E.p = easeSine(E.u);
        if (E.u >= 1) this.completeRise();
      } else if (E.phase === 'hold') {
        E.t += dt;
        if (E.login) this.startRise(true);
        else if (E.t >= ROOM.cycle * 0.25) this.startRise(false);
      } else if (E.phase === 'settle') {
        E.t += dt;
        if (E.t >= 0.45) {
          E.phase = 'exit';
          E.t = 0;
          E.exitFrom = { ...E.sphere };
        }
      } else if (E.phase === 'exit') {
        E.t += dt;
        const k = easeCubic(E.t / 0.8);
        const to = this.exitTarget() || E.exitFrom;
        E.wall = 1 - k;
        E.horizon = 1 - k;
        E.sphere = {
          x: E.exitFrom.x + (to.x - E.exitFrom.x) * k,
          y: E.exitFrom.y + (to.y - E.exitFrom.y) * k,
          r: E.exitFrom.r + (to.r - E.exitFrom.r) * k,
        };
        if (E.t >= 0.8) {
          E.phase = 'done';
          this.finish();
        }
      }
    }

    startLoop() {
      if (this.raf || !this.ok) return;
      this.last = performance.now();
      const tick = (now) => {
        this.raf = 0;
        const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        this.update(dt);
        this.draw();
        if (this.E && this.E.phase !== 'done' && this.canvas.isConnected) this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    stopLoop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    stop() {
      this.stopLoop();
      this.E = null;
      this.targetFn = null;
      this.onDone = null;
    }

    draw() {
      const E = this.E;
      if (!this.gl || !E) return;
      const base = E.cur[0];
      const nextW = E.target || [base, base, base, base];
      const dark = E.target ? this.makeDark(E.target, base) : [base, base];
      const c = E.chroma;
      const stack = [nextW[0], nextW[0]].concat(nextW, dark, [base, base], E.cur, E.prev)
        .map((v) => [v[0], v[1] * c, v[2] * c]);
      let shimmer = [0, 0, 0];
      if (E.target && !E.isLoginRise) {
        const top = E.target[3];
        shimmer = S().labToLinear([top[0], top[1] * c, top[2] * c]).map((x) => Math.max(0, Math.min(1, x)));
      }
      this.render({
        stack,
        shift: E.phase === 'rise' ? 10 - 8 * E.p : 10,
        phase: 0,
        wall: E.wall,
        horizon: E.horizon,
        sphere: E.sphere,
        roomY: E.room.y,
        soft: E.soft,
        shimmer,
      });
    }

    render(o) {
      const gl = this.gl;
      const u = this.u;
      if (!gl) return;
      this.size();
      for (let i = 0; i < 16; i += 1) {
        const v = o.stack[i];
        this.labBuf[i * 3] = v[0];
        this.labBuf[i * 3 + 1] = v[1];
        this.labBuf[i * 3 + 2] = v[2];
      }
      // breite Bildschirme: der Raum wird mit der Breite gestreckt, die Bögen entsprechend flacher
      const k = Math.max(1, (this.W / this.H) / (390 / 844));
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform2f(u.uRes, this.W, this.H);
      gl.uniform1f(u.uDpr, this.dpr);
      gl.uniform3fv(u.uLab, this.labBuf);
      gl.uniform1f(u.uShift, o.shift);
      gl.uniform1f(u.uPhase, o.phase || 0);
      gl.uniform1f(u.uCut, o.cut ? 1 : 0);
      gl.uniform1f(u.uWall, o.wall);
      gl.uniform1f(u.uHorizon, o.horizon);
      gl.uniform3f(u.uSphere, o.sphere.x, o.sphere.y, Math.max(1, o.sphere.r));
      gl.uniform1f(u.uCurve, ROOM.curve / (k * k));
      gl.uniform1f(u.uDepth, ROOM.depth * k);
      gl.uniform2f(u.uRoom, this.W / 2, o.roomY);
      gl.uniform1f(u.uFloor, ROOM.floor);
      gl.uniform1f(u.uRibs, ROOM.ribs);
      gl.uniform1f(u.uSoft, o.soft);
      const sh = o.shimmer || [0, 0, 0];
      gl.uniform3f(u.uShimmer, sh[0], sh[1], sh[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /* ---------- Kugel-Editor: Farbverläufe von Hand durchwischen ---------- */

  // Wellen liegen untereinander: Welle n (0 = aktuelle Kugel) hat ihre Basis bei Index -8n,
  // darunter zwei Basis-Kopien, zwei Übergangs-Slots und dann die nächste Welle (wie in der Animation).
  class SphereEditor {
    constructor(sky, options) {
      this.sky = sky;
      this.opts = options || {};
      this.waves = [this.opts.start || S().colourWave()];
      this.darks = [];
      this.v = 0;
      this.vel = 0;
      this.dragging = false;
      this.moved = false;
      this.state = 'open';
      this.t = 0;
      this.wall = 0;
      this.raf = 0;
    }

    waveAt(n) {
      while (this.waves.length <= n) {
        const index = this.waves.length;
        // ganz selten (erst nach vielen Verläufen) kommen Schwarz- oder Weisstöne dazu
        const rare = index >= 8 && Math.random() < 0.07;
        this.waves.push(rare ? S().rareWave() : S().colourWave());
      }
      return this.waves[n];
    }

    darkAt(n) {
      if (!this.darks[n]) {
        const coming = this.waveAt(n + 1)[3];
        const leaving = this.waveAt(n)[0];
        const hT = Math.atan2(coming[2], coming[1]) * 180 / Math.PI;
        const cB = Math.hypot(leaving[1], leaving[2]);
        const hB = cB < 0.02 ? hT : Math.atan2(leaving[2], leaving[1]) * 180 / Math.PI;
        const L = (h, l) => (S().isBrownZone(h) ? Math.max(l, 0.72) : l);
        const cT = Math.hypot(coming[1], coming[2]);
        this.darks[n] = [
          cT < 0.02 ? [coming[0] * 0.6 + 0.2, 0, 0] : S().fit(L(hT, 0.52), 0.15, hT),
          cB < 0.02 ? [leaving[0] * 0.6 + 0.2, 0, 0] : S().fit(L(hB, 0.48), 0.13, hB),
        ];
      }
      return this.darks[n];
    }

    slot(i) {
      const n = Math.floor((3 - i) / 8);
      if (n < 0) return this.waveAt(0)[3];
      const j = i + 8 * n;
      const w = this.waveAt(n);
      if (j >= 0) return w[j];
      if (j >= -2) return w[0];
      return this.darkAt(n)[j + 4];
    }

    // Farben der vier Schichten genau an der aktuellen Position (auch zwischen zwei Verläufen)
    currentWave() {
      if (Math.abs(this.v) < 0.01) return this.waves[0];
      const X = -8 * this.v;
      const at = (s) => S().samplePath((i) => this.slot(i), s);
      return [at(X), at(X + 1), at(X + 2), at(X + 3)];
    }

    home() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      return { x: W / 2, y: H * 0.42, r: Math.min(130, Math.max(70, Math.min(W, H) * 0.28)) };
    }

    frame() {
      const X = -8 * this.v;
      const w0 = Math.floor(X) - 5;
      const stack = [];
      for (let k = 0; k < 16; k += 1) stack.push(this.slot(w0 + k));
      const next = this.waveAt(Math.max(0, Math.floor(this.v)) + 1)[3];
      const shimmer = S().labToLinear(next).map((x) => Math.max(0, Math.min(1, x)));
      const home = this.home();
      let sphere = home;
      if (this.state === 'open' && this.from) {
        const k = easeCubic(this.t / 0.7);
        sphere = {
          x: this.from.x + (home.x - this.from.x) * k,
          y: this.from.y + (home.y - this.from.y) * k,
          r: this.from.r + (home.r - this.from.r) * k,
        };
      } else if (this.state === 'close') {
        const to = (this.opts.target && this.opts.target()) || this.from || home;
        const k = easeCubic(this.t / 0.75);
        sphere = {
          x: this.closeFrom.x + (to.x - this.closeFrom.x) * k,
          y: this.closeFrom.y + (to.y - this.closeFrom.y) * k,
          r: this.closeFrom.r + (to.r - this.closeFrom.r) * k,
        };
      }
      this.sphere = sphere;
      this.sky.render({
        stack,
        shift: X - w0,
        phase: (((w0 + 10) % 8) + 8) % 8,
        wall: this.wall,
        horizon: this.wall,
        sphere,
        roomY: home.y,
        soft: 1,
        shimmer,
      });
    }

    step(dt) {
      this.t += dt;
      if (this.state === 'open') {
        this.wall = easeCubic(this.t / 0.7);
        if (this.t >= 0.7) {
          this.state = 'edit';
          this.wall = 1;
        }
      }
      if (this.state === 'close') {
        this.wall = 1 - easeCubic(this.t / 0.75);
        if (this.t >= 0.75) {
          this.state = 'done';
          const cb = this.closeDone;
          this.closeDone = null;
          if (cb) cb();
          return;
        }
      }
      if (this.state === 'rewind') {
        this.v += (0 - this.v) * (1 - Math.exp(-dt * 9));
        if (Math.abs(this.v) < 0.003) {
          this.v = 0;
          this.beginClose(this.afterRewind);
        }
        return;
      }
      if (!this.dragging) {
        if (Math.abs(this.vel) > 0.0005) {
          this.v += this.vel * dt;
          this.vel *= Math.exp(-dt * 3.2);
        } else this.vel = 0;
        if (this.v < 0) {
          this.vel = 0;
          this.v += (0 - this.v) * (1 - Math.exp(-dt * 10));
          if (this.v > -0.001) this.v = 0;
        }
      }
    }

    start(from) {
      this.from = from || null;
      this.t = 0;
      this.state = 'open';
      this.loop();
    }

    loop() {
      if (this.raf) return;
      let last = performance.now();
      const tick = (now) => {
        this.raf = 0;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        this.step(dt);
        if (this.state === 'done') return;
        this.frame();
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    drag(deltaWaves) {
      let next = this.v + deltaWaves;
      if (next < 0) next = this.v < 0 ? this.v + deltaWaves * 0.3 : next * 0.3;
      this.v = Math.max(-0.2, next);
      if (Math.abs(deltaWaves) > 0.002) this.moved = true;
    }

    beginClose(done) {
      this.closeFrom = { ...(this.sphere || this.home()) };
      this.state = 'close';
      this.t = 0;
      this.closeDone = done;
    }

    save(done) {
      if (this.state !== 'edit' && this.state !== 'open') return;
      this.vel = 0;
      const wave = this.currentWave();
      this.beginClose(() => done && done(wave));
    }

    cancel(done) {
      if (this.state !== 'edit' && this.state !== 'open') return;
      this.vel = 0;
      this.afterRewind = done;
      this.state = 'rewind';
    }

    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.state = 'done';
    }
  }

  globalThis.GateSky = {
    create(canvas) {
      const sky = new Sky(canvas);
      return sky.ok ? sky : null;
    },
    editor(canvas, options) {
      const sky = new Sky(canvas);
      return sky.ok ? new SphereEditor(sky, options) : null;
    },
    // Profilkugel als Bild, mit demselben Shader wie die Animation (scharf und mit feinen Verläufen)
    sphereImage(wave, px) {
      if (imageFailed || !Array.isArray(wave) || wave.length !== 4) return '';
      const size = Math.max(32, Math.round(px || 192));
      const key = `${size}|${wave.map((c) => c.map((x) => x.toFixed(4)).join(',')).join('|')}`;
      if (imageCache.has(key)) return imageCache.get(key);
      if (!imageSky) {
        const canvas = document.createElement('canvas');
        imageSky = new Sky(canvas);
        if (!imageSky.ok) {
          imageFailed = true;
          imageSky = null;
          return '';
        }
      }
      imageSky.fixed = size;
      const stack = [];
      for (let i = 0; i < 10; i += 1) stack.push(wave[0]);
      stack.push(wave[0], wave[1], wave[2], wave[3], wave[3], wave[3]);
      const r = size / 2;
      imageSky.render({
        stack, shift: 10, phase: 0, wall: 0, horizon: 0, sphere: { x: r, y: r, r: r - 0.75 }, roomY: r, soft: 1, cut: true,
      });
      let url = '';
      try {
        url = imageSky.canvas.toDataURL('image/png');
      } catch {
        url = '';
      }
      if (url) imageCache.set(key, url);
      return url;
    },
  };
})();
