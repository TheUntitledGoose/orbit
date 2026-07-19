// render-worker.js — draws all bodies on an OffscreenCanvas
let canvas, ctx;

const S = 10; // stride: px,py,vx,vy,mass,static,gravIdx,ax,ay,rad

function initCanvas(w, h) {
  canvas = new OffscreenCanvas(w, h);
  ctx = canvas.getContext('2d');
}

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'init') {
    initCanvas(msg.width, msg.height);
    return;
  }

  if (msg.type === 'resize') {
    initCanvas(msg.width, msg.height);
    return;
  }

  if (msg.type === 'render') {
    const {
      ballsData, count, originX, originY, scale, width, height,
      showHistory, showPredictions, showVelocities, showLabels,
      showRelativeTrajectories, isLocked, lockedBallIndex,
      lockedBallHistory, ballInfos
    } = msg;

    if (!canvas || canvas.width !== width || canvas.height !== height) {
      initCanvas(width, height);
    }

    const cx = width / 2;
    const cy = height / 2;
    const s = scale;

    ctx.clearRect(0, 0, width, height);

    // ---- Batch-draw static stars ----
    const staticBalls = [];
    const dynamicBalls = [];
    for (let i = 0; i < count; i++) {
      const os = i * S;
      if (ballsData[os + 5] !== 0) staticBalls.push(i);
      else dynamicBalls.push(i);
    }

    if (staticBalls.length > 0) {
      ctx.fillStyle = "yellow";
      ctx.beginPath();
      for (let k = 0; k < staticBalls.length; k++) {
        const os = staticBalls[k] * S;
        const sx = (ballsData[os] - originX) * s + cx;
        const sy = (ballsData[os + 1] - originY) * s + cy;
        if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) continue;
        ctx.moveTo(sx + 1, sy);
        ctx.arc(sx, sy, 1, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // ---- Draw dynamic bodies ----
    for (let k = 0; k < dynamicBalls.length; k++) {
      const i = dynamicBalls[k];
      const os = i * S;
      const px = ballsData[os];
      const py = ballsData[os + 1];
      const vx = ballsData[os + 2];
      const vy = ballsData[os + 3];
      const gravIdx = ballsData[os + 6];
      const rad = ballsData[os + 9];

      const sx = (px - originX) * s + cx;
      const sy = (py - originY) * s + cy;
      const sr = rad * s;

      if (sx < -50 || sx > width + 50 || sy < -50 || sy > height + 50) {
        if (gravIdx >= 0) continue;
      }

      const info = ballInfos[i];
      if (!info) continue;
      const drawR = Math.max(0.5, sr);

      // History trail
      if (showHistory && info.history && info.history.length > 1) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(0.0001 / s));

        if (isLocked && lockedBallHistory && lockedBallHistory.length > 0 && showRelativeTrajectories) {
          const lh = lockedBallHistory;
          const lastL = lh[lh.length - 1];
          ctx.moveTo(
            info.history[0][0] - lh[0][0] + lastL[0],
            info.history[0][1] - lh[0][1] + lastL[1]
          );
          for (let h = 1; h < info.history.length && h < lh.length; h += step) {
            ctx.lineTo(
              info.history[h][0] - lh[h][0] + lastL[0],
              info.history[h][1] - lh[h][1] + lastL[1]
            );
          }
        } else {
          ctx.moveTo(info.history[0][0], info.history[0][1]);
          for (let h = 1; h < info.history.length; h += step) {
            ctx.lineTo(info.history[h][0], info.history[h][1]);
          }
        }
        ctx.stroke();
      }

      // Glow
      if (s > 0.0001 && gravIdx < 0) {
        ctx.shadowBlur = 50;
        ctx.shadowColor = info.clr;
      }

      // Body
      ctx.beginPath();
      ctx.arc(sx, sy, drawR, 0, Math.PI * 2);
      ctx.fillStyle = info.clr;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Velocity vector
      if (showVelocities) {
        ctx.beginPath();
        ctx.lineWidth = Math.max(0.5, 2.5 / s);
        ctx.strokeStyle = "red";
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + vx * 10 * s, sy + vy * 10 * s);
        ctx.stroke();
      }

      // Predictions
      if (showPredictions && info.futureHist && info.futureHist.length > 1) {
        ctx.strokeStyle = "rgba(255,100,100,0.3)";
        ctx.lineWidth = Math.max(0.5, 1.5 / s);
        ctx.beginPath();
        const pstep = Math.max(1, Math.floor(0.0001 / s));
        ctx.moveTo(info.futureHist[0][0], info.futureHist[0][1]);
        for (let h = 1; h < info.futureHist.length; h += pstep) {
          ctx.lineTo(info.futureHist[h][0], info.futureHist[h][1]);
        }
        ctx.stroke();
      }
    }

    // ---- Labels ----
    if (showLabels) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'white';
      for (let k = 0; k < dynamicBalls.length; k++) {
        const i = dynamicBalls[k];
        const info = ballInfos[i];
        if (!info || !info.text) continue;
        const os = i * S;
        const sx = (ballsData[os] - originX) * s + cx;
        const sy = (ballsData[os + 1] - originY) * s + cy;
        const sr = info.rad * s;

        let alpha = 1;
        if (s <= 1e-6) alpha = Math.max(0, (1e-7 - s) / (1e-8 - 1e-6));
        ctx.globalAlpha = alpha;
        ctx.fillText(info.text, sx + sr, sy + sr / 2);
      }
      ctx.globalAlpha = 1;
    }

    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ type: 'rendered', bitmap }, [bitmap]);
  }
};
