(function (global) {
  'use strict';

  const BLOCK = 2880;
  const CARD = 80;
  const decoder = (typeof TextDecoder !== 'undefined') ? new TextDecoder('ascii') : null;
  const encoder = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;

  function bytesToAscii(u8, start, end) {
    if (decoder) return decoder.decode(u8.subarray(start, end));
    let s = '';
    for (let i = start; i < end; i++) s += String.fromCharCode(u8[i]);
    return s;
  }

  function parseHeader(u8, dv, offset) {
    const header = {};
    let pos = offset;
    let end = false;
    while (!end) {
      for (let i = 0; i < BLOCK / CARD; i++) {
        const card = bytesToAscii(u8, pos + i * CARD, pos + (i + 1) * CARD);
        const key = card.slice(0, 8).trim();
        if (key === 'END') { end = true; break; }
        if (!key || key === 'COMMENT' || key === 'HISTORY') continue;
        const rest = card.slice(8);
        if (rest[0] !== '=') continue;
        let valuePart = rest.slice(1).trim();
        let value;
        if (valuePart.startsWith("'")) {
          const m = valuePart.match(/^'([^']*)'/);
          value = m ? m[1].trim() : valuePart;
        } else {
          const slashIdx = valuePart.indexOf('/');
          const numPart = (slashIdx >= 0 ? valuePart.slice(0, slashIdx) : valuePart).trim();
          if (numPart === 'T') value = true;
          else if (numPart === 'F') value = false;
          else value = parseFloat(numPart);
        }
        header[key] = value;
      }
      pos += BLOCK;
    }
    const headerBlocks = Math.ceil((pos - offset) / BLOCK);
    return { header, dataOffset: offset + headerBlocks * BLOCK };
  }

  function readFits(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    const { header, dataOffset } = parseHeader(u8, dv, 0);
    const bitpix = header.BITPIX;
    const naxis = header.NAXIS;
    const width = header.NAXIS1;
    const height = header.NAXIS2;
    const naxis3 = naxis >= 3 ? header.NAXIS3 : 1;
    const bzero = header.BZERO !== undefined ? header.BZERO : 0;
    const bscale = header.BSCALE !== undefined ? header.BSCALE : 1;
    const n = width * height * naxis3;

    let bytesPer, reader;
    switch (bitpix) {
      case 8: bytesPer = 1; reader = (o) => dv.getUint8(o); break;
      case 16: bytesPer = 2; reader = (o) => dv.getInt16(o, false); break;
      case 32: bytesPer = 4; reader = (o) => dv.getInt32(o, false); break;
      case -32: bytesPer = 4; reader = (o) => dv.getFloat32(o, false); break;
      case -64: bytesPer = 8; reader = (o) => dv.getFloat64(o, false); break;
      default: throw new Error('BITPIX no soportado: ' + bitpix);
    }

    const data = new Float64Array(n);
    let pos = dataOffset;
    for (let i = 0; i < n; i++) {
      data[i] = reader(pos) * bscale + bzero;
      pos += bytesPer;
    }
    return { header, width, height, channels: naxis3, data };
  }

  function padCard(line) {
    if (line.length > CARD) line = line.slice(0, CARD);
    while (line.length < CARD) line += ' ';
    return line;
  }

  function writeFits(width, height, data, extraHeader, channels) {
    channels = channels || 1;
    const headerLines = [];
    const push = (k, v, comment) => {
      let line;
      if (typeof v === 'string') line = `${k.padEnd(8)}= '${v}'`;
      else if (typeof v === 'boolean') line = `${k.padEnd(8)}= ${v ? 'T' : 'F'}`;
      else line = `${k.padEnd(8)}= ${String(v)}`;
      if (comment) line += ' / ' + comment;
      headerLines.push(padCard(line));
    };
    push('SIMPLE', true);
    push('BITPIX', -32);
    push('NAXIS', channels > 1 ? 3 : 2);
    push('NAXIS1', width);
    push('NAXIS2', height);
    if (channels > 1) push('NAXIS3', channels);
    push('BZERO', 0);
    push('BSCALE', 1);
    if (extraHeader) {
      for (const k in extraHeader) push(k, extraHeader[k]);
    }
    headerLines.push(padCard('END'));
    while (headerLines.length % (BLOCK / CARD) !== 0) headerLines.push(padCard(''));
    const headerStr = headerLines.join('');
    const headerBytes = encoder ? encoder.encode(headerStr) : Uint8Array.from(Array.from(headerStr).map(c => c.charCodeAt(0)));

    const n = width * height;
    const dataBytes = new Uint8Array(n * channels * 4);
    const dataDv = new DataView(dataBytes.buffer);
    if (channels === 1) {
      for (let i = 0; i < n; i++) dataDv.setFloat32(i * 4, data[i], false);
    } else {
      for (let c = 0; c < channels; c++) {
        for (let i = 0; i < n; i++) {
          dataDv.setFloat32((c * n + i) * 4, data[i * channels + c], false);
        }
      }
    }
    const pad = (BLOCK - (dataBytes.length % BLOCK)) % BLOCK;
    const total = new Uint8Array(headerBytes.length + dataBytes.length + pad);
    total.set(headerBytes, 0);
    total.set(dataBytes, headerBytes.length);
    return total.buffer;
  }

  // Debayer bilineal (uso ocasional / referencia). Para stacking usamos debayerSuperpixel (ver mas abajo)
  // ya que evita el speckle de color en estrellas pequenas.
  function debayer(width, height, data, pattern) {
    const rgb = new Float64Array(width * height * 3);
    const at = (x, y) => data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
    const map = {
      RGGB: [['R', 'G'], ['G', 'B']],
      BGGR: [['B', 'G'], ['G', 'R']],
      GRBG: [['G', 'R'], ['B', 'G']],
      GBRG: [['G', 'B'], ['R', 'G']],
    };
    function colorAt(x, y) {
      const evenRow = y % 2 === 0, evenCol = x % 2 === 0;
      const p = map[pattern] || map.RGGB;
      return p[evenRow ? 0 : 1][evenCol ? 0 : 1];
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const c = colorAt(x, y);
        let r, g, b;
        if (c === 'R') {
          r = at(x, y);
          g = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 4;
          b = (at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) / 4;
        } else if (c === 'B') {
          b = at(x, y);
          g = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 4;
          r = (at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) / 4;
        } else {
          g = at(x, y);
          const evenRow = y % 2 === 0;
          if (evenRow) { r = (at(x - 1, y) + at(x + 1, y)) / 2; b = (at(x, y - 1) + at(x, y + 1)) / 2; }
          else { b = (at(x - 1, y) + at(x + 1, y)) / 2; r = (at(x, y - 1) + at(x, y + 1)) / 2; }
        }
        rgb[idx] = r; rgb[idx + 1] = g; rgb[idx + 2] = b;
      }
    }
    return rgb;
  }

  // Debayer "superpixel": bloque 2x2 -> un pixel RGB real, sin interpolar (recomendado).
  function debayerSuperpixel(width, height, data, pattern) {
    const outW = Math.floor(width / 2);
    const outH = Math.floor(height / 2);
    const rgb = new Float64Array(outW * outH * 3);
    const map = {
      RGGB: { r: [0, 0], g1: [1, 0], g2: [0, 1], b: [1, 1] },
      BGGR: { b: [0, 0], g1: [1, 0], g2: [0, 1], r: [1, 1] },
      GRBG: { g1: [0, 0], r: [1, 0], b: [0, 1], g2: [1, 1] },
      GBRG: { g1: [0, 0], b: [1, 0], r: [0, 1], g2: [1, 1] },
    };
    const p = map[pattern] || map.RGGB;
    for (let by = 0; by < outH; by++) {
      for (let bx = 0; bx < outW; bx++) {
        const x0 = bx * 2, y0 = by * 2;
        const at = (dx, dy) => data[(y0 + dy) * width + (x0 + dx)];
        const r = at(p.r[0], p.r[1]);
        const b = at(p.b[0], p.b[1]);
        const g = (at(p.g1[0], p.g1[1]) + at(p.g2[0], p.g2[1])) / 2;
        const oi = (by * outW + bx) * 3;
        rgb[oi] = r; rgb[oi + 1] = g; rgb[oi + 2] = b;
      }
    }
    return { width: outW, height: outH, data: rgb };
  }

  function planarToInterleaved(width, height, data, channels) {
    const n = width * height;
    const out = new Float64Array(n * channels);
    for (let c = 0; c < channels; c++) {
      for (let i = 0; i < n; i++) out[i * channels + c] = data[c * n + i];
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { readFits, writeFits, debayer, debayerSuperpixel, planarToInterleaved });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
