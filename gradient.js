(function (global) {
  'use strict';

  // Muestrea el fondo del cielo en una rejilla, usando un percentil bajo por celda
  // (evita que las estrellas contaminen la estimacion de fondo).
  function sampleBackgroundGrid(width, height, plane, gridSize) {
    const cellW = width / gridSize, cellH = height / gridSize;
    const samples = [];
    for (let gy = 0; gy < gridSize; gy++) {
      const y0 = Math.floor(gy * cellH), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * cellH));
      for (let gx = 0; gx < gridSize; gx++) {
        const x0 = Math.floor(gx * cellW), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cellW));
        const vals = [];
        for (let y = y0; y < y1 && y < height; y++) {
          for (let x = x0; x < x1 && x < width; x++) vals.push(plane[y * width + x]);
        }
        if (!vals.length) continue;
        vals.sort((a, b) => a - b);
        const idx = Math.floor(vals.length * 0.15);
        samples.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, value: vals[idx] });
      }
    }
    return samples;
  }

  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
      const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
      if (Math.abs(M[col][col]) < 1e-12) continue;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.abs(M[i][i]) > 1e-12 ? M[i][n] / M[i][i] : 0;
    return x;
  }

  // Ajusta un polinomio 2D de bajo orden (coordenadas normalizadas a [-1,1] para estabilidad numerica).
  function fitPolynomial2D(samples, degree, width, height) {
    const terms = [];
    for (let total = 0; total <= degree; total++) {
      for (let i = 0; i <= total; i++) terms.push([total - i, i]);
    }
    const n = terms.length;
    const AtA = Array.from({ length: n }, () => new Float64Array(n));
    const Atb = new Float64Array(n);
    const hw = width / 2, hh = height / 2;

    for (const s of samples) {
      const nx = (s.x - hw) / hw, ny = (s.y - hh) / hh;
      const row = new Float64Array(n);
      for (let i = 0; i < n; i++) row[i] = Math.pow(nx, terms[i][0]) * Math.pow(ny, terms[i][1]);
      for (let i = 0; i < n; i++) {
        Atb[i] += row[i] * s.value;
        for (let j = 0; j < n; j++) AtA[i][j] += row[i] * row[j];
      }
    }
    const coeffs = solveLinearSystem(AtA.map(r => Array.from(r)), Atb);
    return { terms, coeffs, hw, hh };
  }

  function evalPolynomial2D(model, x, y) {
    const nx = (x - model.hw) / model.hw, ny = (y - model.hh) / model.hh;
    let v = 0;
    for (let i = 0; i < model.terms.length; i++) {
      v += model.coeffs[i] * Math.pow(nx, model.terms[i][0]) * Math.pow(ny, model.terms[i][1]);
    }
    return v;
  }

  // Elimina el gradiente de cielo de una imagen (mono o color, intercalada). strength: 0=sin efecto, 1=correccion completa.
  function removeGradient(width, height, data, channels, opts) {
    opts = opts || {};
    const degree = opts.degree || 2;
    const strength = opts.strength === undefined ? 1 : opts.strength;
    const gridSize = opts.gridSize || 16;
    channels = channels || 1;
    const out = new Float64Array(data.length);

    for (let c = 0; c < channels; c++) {
      const plane = new Float64Array(width * height);
      for (let i = 0; i < width * height; i++) plane[i] = data[i * channels + c];

      const samples = sampleBackgroundGrid(width, height, plane, gridSize);
      const model = fitPolynomial2D(samples, degree, width, height);
      const values = Float64Array.from(samples.map(s => s.value)).sort();
      const globalMedian = values[Math.floor(values.length / 2)];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const modeled = evalPolynomial2D(model, x, y);
          const idx = (y * width + x) * channels + c;
          out[idx] = plane[y * width + x] - (modeled - globalMedian) * strength;
        }
      }
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { removeGradient, sampleBackgroundGrid, fitPolynomial2D, evalPolynomial2D });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
