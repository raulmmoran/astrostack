(function (global) {
  'use strict';

  // Detecta rastros lineales brillantes (aviones, satelites) en un frame individual.
  // Devuelve una mascara booleana (Uint8Array, 1 = pixel de rastro) para excluir esos
  // pixeles SOLO de ese frame concreto durante el stacking, sin descartar el frame entero.
  function detectTrails(width, height, data, opts) {
    opts = opts || {};
    const minLength = opts.minLength || 25; // longitud minima en pixeles para considerarlo rastro
    const minElongation = opts.minElongation || 4.5; // ratio eje mayor/menor
    const sigmaThreshold = opts.sigmaThreshold || 5;

    // estimacion de fondo/ruido (mismo enfoque que starDetect)
    const n = data.length;
    const step = Math.max(1, Math.floor(n / 20000));
    const sample = [];
    for (let i = 0; i < n; i += step) sample.push(data[i]);
    const sorted = Float64Array.from(sample).sort();
    const med = sorted[Math.floor(sorted.length / 2)];
    let sumAbsDev = 0;
    for (const v of sample) sumAbsDev += Math.abs(v - med);
    const mad = sumAbsDev / sample.length;
    const sigma = mad * 1.4826;
    const threshold = med + sigmaThreshold * Math.max(sigma, 1e-6);

    const visited = new Uint8Array(width * height);
    const mask = new Uint8Array(width * height);
    const stack = new Int32Array(width * height);
    const trails = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx] || data[idx] < threshold) continue;
        let sp = 0;
        stack[sp++] = idx;
        visited[idx] = 1;
        const pixels = [];
        while (sp > 0) {
          const cur = stack[--sp];
          pixels.push(cur);
          if (pixels.length > 20000) break; // seguridad
          const cy = Math.floor(cur / width), cx = cur % width;
          const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
            [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nidx = ny * width + nx;
            if (!visited[nidx] && data[nidx] >= threshold) {
              visited[nidx] = 1;
              stack[sp++] = nidx;
            }
          }
        }

        if (pixels.length < minLength) continue;

        // PCA simple 2x2 para medir elongacion del componente
        let sx = 0, sy = 0;
        for (const p of pixels) { sx += p % width; sy += Math.floor(p / width); }
        const mx = sx / pixels.length, my = sy / pixels.length;
        let sxx = 0, syy = 0, sxy = 0;
        for (const p of pixels) {
          const dx = (p % width) - mx, dy = Math.floor(p / width) - my;
          sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        }
        sxx /= pixels.length; syy /= pixels.length; sxy /= pixels.length;
        const trace = sxx + syy;
        const det = sxx * syy - sxy * sxy;
        const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
        const lambda1 = trace / 2 + disc;
        const lambda2 = Math.max(1e-6, trace / 2 - disc);
        const elongation = Math.sqrt(lambda1 / lambda2);
        const majorAxisLength = 4 * Math.sqrt(lambda1); // aprox longitud total

        if (elongation >= minElongation && majorAxisLength >= minLength) {
          trails.push({ size: pixels.length, elongation, length: majorAxisLength });
          for (const p of pixels) mask[p] = 1;
        }
      }
    }
    return { mask, trails };
  }

  // Aplica la mascara: pone NaN en los pixeles marcados (en todos los canales) para que
  // el stacking los ignore en ese frame concreto.
  function maskTrails(width, height, data, mask, channels) {
    channels = channels || 1;
    const out = data.slice();
    for (let i = 0; i < width * height; i++) {
      if (mask[i]) {
        for (let c = 0; c < channels; c++) out[i * channels + c] = NaN;
      }
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { detectTrails, maskTrails });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
