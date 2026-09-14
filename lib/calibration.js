(function (global) {
  'use strict';

  function medianOfArray(values) {
    const s = Float64Array.from(values).sort();
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  function combineFrames(frames, method) {
    method = method || 'median';
    if (frames.length === 0) throw new Error('No hay frames para combinar');
    const n = frames[0].length;
    const out = new Float64Array(n);
    const k = frames.length;
    const buf = new Float64Array(k);
    for (let i = 0; i < n; i++) {
      for (let f = 0; f < k; f++) buf[f] = frames[f][i];
      if (method === 'median') {
        out[i] = medianOfArray(buf);
      } else {
        let sum = 0;
        for (let f = 0; f < k; f++) sum += buf[f];
        out[i] = sum / k;
      }
    }
    return out;
  }

  function normalizeFlat(flat, bias) {
    const n = flat.length;
    const corrected = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      corrected[i] = bias ? flat[i] - bias[i] : flat[i];
      sum += corrected[i];
    }
    const mean = sum / n;
    for (let i = 0; i < n; i++) corrected[i] = corrected[i] / (mean || 1);
    return corrected;
  }

  function calibrateLight(light, masterDark, masterFlatNorm, masterBias) {
    const n = light.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let val = light[i];
      if (masterDark) val -= masterDark[i];
      else if (masterBias) val -= masterBias[i];
      if (masterFlatNorm) {
        const f = masterFlatNorm[i];
        val = f > 1e-6 ? val / f : val;
      }
      out[i] = val;
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { combineFrames, normalizeFlat, calibrateLight, medianOfArray });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
