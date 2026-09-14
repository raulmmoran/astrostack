(function (global) {
  'use strict';

  function median(arr) {
    const s = Float64Array.from(arr).sort();
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  function estimateBackground(data) {
    const n = data.length;
    const step = Math.max(1, Math.floor(n / 20000));
    const sample = [];
    for (let i = 0; i < n; i += step) sample.push(data[i]);
    const med = median(sample);
    let sumAbsDev = 0;
    for (const v of sample) sumAbsDev += Math.abs(v - med);
    const mad = sumAbsDev / sample.length;
    const sigma = mad * 1.4826;
    return { background: med, sigma };
  }

  function detectStars(width, height, data, opts) {
    opts = opts || {};
    const { background, sigma } = estimateBackground(data);
    const threshold = background + (opts.sigmaThreshold || 5) * Math.max(sigma, 1e-6);
    const visited = new Uint8Array(width * height);
    const stars = [];
    const maxStars = opts.maxStars || 200;
    const stack = new Int32Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx] || data[idx] < threshold) continue;
        let sp = 0;
        stack[sp++] = idx;
        visited[idx] = 1;
        let sumI = 0, sumX = 0, sumY = 0, count = 0, peak = 0;
        while (sp > 0) {
          const cur = stack[--sp];
          const cy = Math.floor(cur / width);
          const cx = cur % width;
          const val = data[cur];
          const w = val - background;
          sumI += w; sumX += w * cx; sumY += w * cy; count++;
          if (val > peak) peak = val;
          if (count > 500) break;
          const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nidx = ny * width + nx;
            if (!visited[nidx] && data[nidx] >= threshold) {
              visited[nidx] = 1;
              stack[sp++] = nidx;
            }
          }
        }
        if (count >= (opts.minPixels || 3) && sumI > 0) {
          stars.push({ x: sumX / sumI, y: sumY / sumI, flux: sumI, peak, size: count });
        }
      }
    }
    stars.sort((a, b) => b.flux - a.flux);
    return stars.slice(0, maxStars);
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { detectStars, estimateBackground });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
