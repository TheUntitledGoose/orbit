// physics-worker.js
let g = 6.637e-15;
let dt = 1;
let paused = false;

// stride layout: 0:px, 1:py, 2:vx, 3:vy, 4:mass, 5:static, 6:gravIdx, 7:ax, 8:ay, 9:rad
const S = 10;

self.onmessage = function(e) {
  const m = e.data;

  if (m.type === 'step') {
    dt = m.dt; paused = m.paused;
    const buf = m.data;
    const d = new Float64Array(buf);
    const n = m.count;

    if (!paused) {
      // reset accelerations
      for (let i = 0; i < n; i++) {
        const s = i * S;
        d[s + 7] = 0;
        d[s + 8] = 0;
      }

      // compute accelerations
      for (let i = 0; i < n; i++) {
        const s = i * S;
        if (d[s + 5] !== 0) continue;

        if (d[s + 6] >= 0) {
          const ts = (d[s + 6] | 0) * S;
          if (d[ts + 5] !== 0) continue;
          const dx = d[ts] - d[s];
          const dy = d[ts + 1] - d[s + 1];
          const inv = 1 / Math.hypot(dx, dy);
          const f = g * d[ts + 4] * inv * inv;
          d[s + 7] = dx * inv * f;
          d[s + 8] = dy * inv * f;
        } else {
          let ax = 0, ay = 0;
          for (let j = i + 1; j < n; j++) {
            const js = j * S;
            if (d[js + 5] !== 0 || d[js + 6] >= 0) continue;
            const dx = d[js] - d[s];
            const dy = d[js + 1] - d[s + 1];
            const inv = 1 / Math.hypot(dx, dy);
            const inv2 = inv * inv;
            ax += dx * g * d[js + 4] * inv2;
            ay += dy * g * d[js + 4] * inv2;
            d[js + 7] -= dx * g * d[s + 4] * inv2;
            d[js + 8] -= dy * g * d[s + 4] * inv2;
          }
          d[s + 7] = ax;
          d[s + 8] = ay;
        }
      }

      // integrate
      for (let i = 0; i < n; i++) {
        const s = i * S;
        if (d[s + 5] !== 0) continue;
        d[s + 2] += d[s + 7] * dt;
        d[s + 3] += d[s + 8] * dt;
        d[s + 0] += d[s + 2] * dt;
        d[s + 1] += d[s + 3] * dt;
      }
    }

    self.postMessage({ type: 'stepped', data: d.buffer }, [d.buffer]);
    return;
  }

  if (m.type === 'predict') {
    dt = m.dt;
    const buf = m.data;
    const d = new Float64Array(buf);
    const n = m.count;
    const steps = m.steps;
    const pb = n * S;

    // init predict from current state
    for (let i = 0; i < n; i++) {
      const s = i * S;
      const ps = i * S + pb;
      d[ps] = d[s]; d[ps + 1] = d[s + 1];
      d[ps + 2] = d[s + 2]; d[ps + 3] = d[s + 3];
      d[ps + 4] = d[s + 4]; d[ps + 5] = d[s + 5];
      d[ps + 6] = d[s + 6]; d[ps + 9] = d[s + 9];
    }

    for (let step = 0; step < steps; step++) {
      // reset predict acc
      for (let i = 0; i < n; i++) {
        const ps = i * S + pb;
        d[ps + 7] = 0; d[ps + 8] = 0;
      }
      // compute predict acc
      for (let i = 0; i < n; i++) {
        const ps = i * S + pb;
        if (d[ps + 5] !== 0) continue;
        if (d[ps + 6] >= 0) {
          const ts = (d[ps + 6] | 0) * S + pb;
          if (d[ts + 5] !== 0) continue;
          const dx = d[ts] - d[ps];
          const dy = d[ts + 1] - d[ps + 1];
          const inv = 1 / Math.hypot(dx, dy);
          const f = g * d[ts + 4] * inv * inv;
          d[ps + 7] = dx * inv * f;
          d[ps + 8] = dy * inv * f;
        } else {
          let ax = 0, ay = 0;
          for (let j = i + 1; j < n; j++) {
            const fj = j * S + pb;
            if (d[fj + 5] !== 0 || d[fj + 6] >= 0) continue;
            const dx = d[fj] - d[ps];
            const dy = d[fj + 1] - d[ps + 1];
            const inv = 1 / Math.hypot(dx, dy);
            const inv2 = inv * inv;
            ax += dx * g * d[fj + 4] * inv2;
            ay += dy * g * d[fj + 4] * inv2;
            d[fj + 7] -= dx * g * d[ps + 4] * inv2;
            d[fj + 8] -= dy * g * d[ps + 4] * inv2;
          }
          d[ps + 7] = ax;
          d[ps + 8] = ay;
        }
      }
      // integrate predict
      for (let i = 0; i < n; i++) {
        const ps = i * S + pb;
        if (d[ps + 5] !== 0) continue;
        d[ps + 2] += d[ps + 7] * dt;
        d[ps + 3] += d[ps + 8] * dt;
        d[ps + 0] += d[ps + 2] * dt;
        d[ps + 1] += d[ps + 3] * dt;
      }
    }

    self.postMessage({ type: 'predicted', data: d.buffer }, [d.buffer]);
    return;
  }
};
