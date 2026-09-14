(function (global) {
  'use strict';

  function medianFilter(width, height, data, radius) {
    radius = radius || 1;
    const out = new Float64Array(data.length);
    const win = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        win.length = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            win.push(data[ny * width + nx]);
          }
        }
        win.sort((a, b) => a - b);
        out[y * width + x] = win[Math.floor(win.length / 2)];
      }
    }
    return out;
  }

  function gaussianKernel1D(sigma) {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = new Float64Array(radius * 2 + 1);
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const v = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel[i + radius] = v;
      sum += v;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
    return { kernel, radius };
  }

  function gaussianBlur(width, height, data, sigma, channels) {
    sigma = sigma === undefined ? 1.5 : sigma;
    channels = channels || 1;
    if (sigma <= 0) return data.slice();
    const { kernel, radius } = gaussianKernel1D(sigma);
    const tmp = new Float64Array(data.length);
    const out = new Float64Array(data.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < channels; c++) {
          let acc = 0;
          for (let k = -radius; k <= radius; k++) {
            const xx = Math.min(width - 1, Math.max(0, x + k));
            acc += data[(y * width + xx) * channels + c] * kernel[k + radius];
          }
          tmp[(y * width + x) * channels + c] = acc;
        }
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < channels; c++) {
          let acc = 0;
          for (let k = -radius; k <= radius; k++) {
            const yy = Math.min(height - 1, Math.max(0, y + k));
            acc += tmp[(yy * width + x) * channels + c] * kernel[k + radius];
          }
          out[(y * width + x) * channels + c] = acc;
        }
      }
    }
    return out;
  }

  function edgeAwareDenoise(width, height, data, strength, sigma, channels) {
    strength = strength === undefined ? 0.6 : strength;
    sigma = sigma === undefined ? 1.8 : sigma;
    channels = channels || 1;
    const blurred = gaussianBlur(width, height, data, sigma, channels);
    const out = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] * (1 - strength) + blurred[i] * strength;
    }
    return out;
  }

  function smoothChrominance(width, height, rgb, sigma) {
    sigma = sigma === undefined ? 1.3 : sigma;
    const n = width * height;
    const blurred = gaussianBlur(width, height, rgb, sigma, 3);
    const out = new Float64Array(rgb.length);
    for (let i = 0; i < n; i++) {
      const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
      const l = (r + g + b) / 3;
      const rb = blurred[i * 3], gb = blurred[i * 3 + 1], bb = blurred[i * 3 + 2];
      const lb = (rb + gb + bb) / 3;
      const ratio = lb > 1e-6 ? l / lb : 1;
      out[i * 3] = rb * ratio;
      out[i * 3 + 1] = gb * ratio;
      out[i * 3 + 2] = bb * ratio;
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { medianFilter, gaussianBlur, edgeAwareDenoise, smoothChrominance });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
