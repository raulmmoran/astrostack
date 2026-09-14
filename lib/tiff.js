(function (global) {
  'use strict';

  function writeTiff16(width, height, data, channels) {
    channels = channels || 1;
    const dataSize = width * height * channels * 2;
    const headerSize = 8;
    let pos = headerSize;
    const dataOffset = pos;
    pos += dataSize;
    if (pos % 2 !== 0) pos += 1;

    let extraOffset = pos;
    const needsExternalBPS = channels > 1;
    let bpsOffset = 0, sfOffset = 0;
    if (needsExternalBPS) { bpsOffset = extraOffset; extraOffset += channels * 2; }
    const needsExternalSF = channels > 1;
    if (needsExternalSF) { sfOffset = extraOffset; extraOffset += channels * 2; }
    if (extraOffset % 2 !== 0) extraOffset += 1;

    const ifdOffset = extraOffset;
    const entries = [];
    const addEntry = (tag, type, count, valueOrOffset, isOffset) => {
      entries.push({ tag, type, count, value: valueOrOffset, isOffset });
    };
    const TYPE_SHORT = 3, TYPE_LONG = 4;

    addEntry(256, TYPE_LONG, 1, width, false);
    addEntry(257, TYPE_LONG, 1, height, false);
    if (needsExternalBPS) addEntry(258, TYPE_SHORT, channels, bpsOffset, true);
    else addEntry(258, TYPE_SHORT, 1, 16, false);
    addEntry(259, TYPE_SHORT, 1, 1, false);
    addEntry(262, TYPE_SHORT, 1, channels === 3 ? 2 : 1, false);
    addEntry(273, TYPE_LONG, 1, dataOffset, false);
    addEntry(277, TYPE_SHORT, 1, channels, false);
    addEntry(278, TYPE_LONG, 1, height, false);
    addEntry(279, TYPE_LONG, 1, dataSize, false);
    addEntry(284, TYPE_SHORT, 1, 1, false);
    if (needsExternalSF) addEntry(339, TYPE_SHORT, channels, sfOffset, true);
    else addEntry(339, TYPE_SHORT, 1, 1, false);

    entries.sort((a, b) => a.tag - b.tag);
    const ifdSize = 2 + entries.length * 12 + 4;
    const totalSize = ifdOffset + ifdSize;
    const buf = new ArrayBuffer(totalSize);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    u8[0] = 0x49; u8[1] = 0x49; // 'II'
    dv.setUint16(2, 42, true);
    dv.setUint32(4, ifdOffset, true);

    let p = dataOffset;
    for (let i = 0; i < width * height * channels; i++) {
      const v = Math.round(Math.min(1, Math.max(0, data[i])) * 65535);
      dv.setUint16(p, v, true);
      p += 2;
    }

    if (needsExternalBPS) for (let c = 0; c < channels; c++) dv.setUint16(bpsOffset + c * 2, 16, true);
    if (needsExternalSF) for (let c = 0; c < channels; c++) dv.setUint16(sfOffset + c * 2, 1, true);

    let ip = ifdOffset;
    dv.setUint16(ip, entries.length, true); ip += 2;
    for (const e of entries) {
      dv.setUint16(ip, e.tag, true);
      dv.setUint16(ip + 2, e.type, true);
      dv.setUint32(ip + 4, e.count, true);
      if (e.isOffset) {
        dv.setUint32(ip + 8, e.value, true);
      } else {
        if (e.type === TYPE_SHORT) dv.setUint16(ip + 8, e.value, true);
        else dv.setUint32(ip + 8, e.value, true);
      }
      ip += 12;
    }
    dv.setUint32(ip, 0, true);

    return buf;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { writeTiff16 });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
