(function (global) {
  'use strict';

  function mean(arr, len) {
    let s = 0;
    for (let i = 0; i < len; i++) s += arr[i];
    return s / len;
  }
  function std(arr, len, m) {
    let s = 0;
    for (let i = 0; i < len; i++) { const d = arr[i] - m; s += d * d; }
    return Math.sqrt(s / Math.max(1, len - 1));
  }
  function medianSlice(arr, len) {
    const s = Float64Array.from(arr.slice(0, len)).sort();
    return len % 2 ? s[(len - 1) / 2] : (s[len / 2 - 1] + s[len / 2]) / 2;
  }

  function stackFrames(frames, method, opts) {
    method = method || 'sigmaClip';
    opts = opts || {};
    const k = frames.length;
    if (k === 0) throw new Error('No hay frames para apilar');
    const n = frames[0].length;
    const out = new Float64Array(n);
    const sigmaLow = opts.sigmaLow || 2.5;
    const sigmaHigh = opts.sigmaHigh || 2.5;
    const buf = new Float64Array(k);

    for (let i = 0; i < n; i++) {
      let valid = 0;
      for (let f = 0; f < k; f++) {
        const v = frames[f][i];
        if (v !== undefined && !Number.isNaN(v)) buf[valid++] = v;
      }
      if (valid === 0) { out[i] = 0; continue; }

      if (method === 'average') {
        out[i] = mean(buf, valid);
      } else if (method === 'median') {
        out[i] = medianSlice(buf, valid);
      } else {
        let m = mean(buf, valid);
        let s = std(buf, valid, m);
        let count = valid;
        for (let iter = 0; iter < 3 && count > 2; iter++) {
          let newCount = 0;
          for (let f = 0; f < count; f++) {
            const v = buf[f];
            if (v >= m - sigmaLow * s && v <= m + sigmaHigh * s) buf[newCount++] = v;
          }
          if (newCount === count) break;
          count = newCount;
          m = mean(buf, count);
          s = std(buf, count, m);
        }
        out[i] = count > 0 ? m : mean(buf, valid);
      }
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { stackFrames });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
