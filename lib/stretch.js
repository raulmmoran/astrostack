(function (global) {
  'use strict';

  function median(arr) {
    const s = Float64Array.from(arr).sort();
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  function minMax(data) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < mn) mn = data[i];
      if (data[i] > mx) mx = data[i];
    }
    return [mn, mx];
  }

  function normalize01(data) {
    const [mn, mx] = minMax(data);
    const range = mx - mn || 1;
    const out = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = (data[i] - mn) / range;
    return { data: out, mn, mx };
  }

  function mtf(x, m) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (m === 0.5) return x;
    return ((m - 1) * x) / ((2 * m - 1) * x - m);
  }

  function solveMidtone(x, targetB) {
    if (x <= 0) return 0.5;
    const denom = (2 * targetB * x - targetB - x);
    if (Math.abs(denom) < 1e-9) return 0.5;
    let m = (x * (targetB - 1)) / denom;
    if (!isFinite(m)) m = 0.5;
    return Math.min(1, Math.max(0, m));
  }

  function autoStretch(data, opts) {
    opts = opts || {};
    const targetBackground = opts.targetBackground === undefined ? 0.25 : opts.targetBackground;
    const shadowsClip = opts.shadowsClip === undefined ? 2.8 : opts.shadowsClip;

    const sampleStep = Math.max(1, Math.floor(data.length / 50000));
    const sample = [];
    for (let i = 0; i < data.length; i += sampleStep) sample.push(data[i]);
    const med = median(sample);
    let sumAbs = 0;
    for (const v of sample) sumAbs += Math.abs(v - med);
    const mad = sumAbs / sample.length;
    const sigma = mad * 1.4826;

    let c0 = med - shadowsClip * sigma;
    c0 = Math.min(0.99, Math.max(0, c0));
    const denom = 1 - c0 || 1e-6;
    const xMed = Math.max(0, (med - c0) / denom);
    const m = solveMidtone(xMed, targetBackground);

    const out = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const v = Math.min(1, Math.max(0, (data[i] - c0) / denom));
      out[i] = mtf(v, m);
    }
    return { data: out, c0, m, median: med, sigma };
  }

  function levels(data, black, white, gamma) {
    black = black || 0; white = white === undefined ? 1 : white; gamma = gamma || 1;
    const out = new Float64Array(data.length);
    const range = (white - black) || 1e-6;
    const invGamma = 1 / gamma;
    for (let i = 0; i < data.length; i++) {
      let v = (data[i] - black) / range;
      v = Math.min(1, Math.max(0, v));
      out[i] = Math.pow(v, invGamma);
    }
    return out;
  }

  function applyCurve(data, points) {
    const pts = [...points].sort((a, b) => a.x - b.x);
    if (pts[0].x > 0) pts.unshift({ x: 0, y: 0 });
    if (pts[pts.length - 1].x < 1) pts.push({ x: 1, y: 1 });

    const out = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const v = Math.min(1, Math.max(0, data[i]));
      let j = 0;
      while (j < pts.length - 2 && pts[j + 1].x < v) j++;
      const p0 = pts[j], p1 = pts[j + 1];
      const t = (p1.x - p0.x) > 1e-9 ? (v - p0.x) / (p1.x - p0.x) : 0;
      out[i] = p0.y + t * (p1.y - p0.y);
    }
    return out;
  }

  function unsharpMask(width, height, data, amount, sigma, channels) {
    amount = amount === undefined ? 0.6 : amount;
    sigma = sigma === undefined ? 1.2 : sigma;
    channels = channels || 1;
    const blurred = global.AstroLib.gaussianBlur(width, height, data, sigma, channels);
    const out = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = Math.min(1, Math.max(0, data[i] + amount * (data[i] - blurred[i])));
    }
    return out;
  }

  function adjustSaturation(rgb, factor) {
    factor = factor === undefined ? 1 : factor;
    const out = new Float64Array(rgb.length);
    for (let i = 0; i < rgb.length; i += 3) {
      const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (mx + mn) / 2;
      for (let c = 0; c < 3; c++) {
        const v = rgb[i + c];
        out[i + c] = Math.min(1, Math.max(0, l + (v - l) * factor));
      }
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { autoStretch, levels, applyCurve, unsharpMask, adjustSaturation, normalize01, mtf });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
