// Setup functions for quality rendering -- I'm not a graphics programmer

// -----------------------------
// Minimal FBM / value noise (fast and good-looking)
// -----------------------------
function hash2(x, y) {
  // returns value in [0,1)
  return fract(Math.sin(dot2(x, y, 127.1, 311.7)) * 43758.5453123);
}
function dot2(a, b, c, d) { return a * c + b * d; }
function fract(x) { return x - Math.floor(x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fade(t) { return t * t * (3 - 2 * t); }

function valueNoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);

  const a = hash2(xi + 0, yi + 0);
  const b = hash2(xi + 1, yi + 0);
  const c = hash2(xi + 0, yi + 1);
  const d = hash2(xi + 1, yi + 1);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm2(x, y, octaves = 5) {
  let value = 0, amplitude = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2(x * freq, y * freq);
    freq *= 2;
    amplitude *= 0.5;
  }
  return value;
}

// END == Setup functions for quality rendering

// small utilities
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (r === undefined) r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}