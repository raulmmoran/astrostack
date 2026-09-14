importScripts('lib/fits.js', 'lib/starDetect.js', 'lib/align.js', 'lib/calibration.js', 'lib/stack.js', 'lib/denoise.js', 'lib/stretch.js', 'lib/tiff.js', 'lib/trailDetect.js', 'lib/catalog.js', 'lib/quality.js', 'lib/gradient.js');

const { readFits, debayerSuperpixel, writeFits, planarToInterleaved } = AstroLib;
const { detectStars, estimateBackground } = AstroLib;
const { alignToReference, warpImage, composeTransform, applyTransform } = AstroLib;
const { combineFrames, normalizeFlat, calibrateLight } = AstroLib;
const { stackFrames } = AstroLib;
const { normalize01, autoStretch, levels, unsharpMask, adjustSaturation, mtf } = AstroLib;
const { edgeAwareDenoise } = AstroLib;
const { writeTiff16 } = AstroLib;
const { detectTrails, maskTrails } = AstroLib;
const { findNearbyObjects, extractRaDecFromHeader } = AstroLib;
const { computeFrameQuality, gradeFrames } = AstroLib;
const { removeGradient } = AstroLib;

function log(text) { postMessage({ type: 'log', text }); }
function progress(p, text) { postMessage({ type: 'progress', progress: p, text }); }

// Estado residente: los datos apilados (lineales, normalizados 0-1) se guardan aqui para que
// cada ajuste de edicion sea rapido y no haya que retransferir el buffer completo cada vez.
let residentData = null, residentWidth = 0, residentHeight = 0, residentChannels = 1;

async function readFitsFile(file) {
  const buf = await file.arrayBuffer();
  return readFits(buf);
}

async function loadFramesRaw(files, label) {
  const frames = [];
  let width, height, header;
  for (let i = 0; i < files.length; i++) {
    const f = await readFitsFile(files[i]);
    width = f.width; height = f.height; header = f.header;
    frames.push(f.data);
    progress(null, `Leyendo ${label} ${i + 1}/${files.length}`);
  }
  return { frames, width, height, header };
}

function luminanceOf(data, channels) {
  if (channels === 1) return data;
  const n = data.length / channels;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += data[i * channels + c];
    out[i] = s / channels;
  }
  return out;
}

function identifyObject(header) {
  if (!header) return null;
  const coords = extractRaDecFromHeader(header);
  if (!coords) return null;
  const nearby = findNearbyObjects(coords.ra, coords.dec, 3);
  return { coords, nearby };
}

function cornersOf(width, height, transform) {
  return [
    applyTransform(transform, { x: 0, y: 0 }),
    applyTransform(transform, { x: width, y: 0 }),
    applyTransform(transform, { x: 0, y: height }),
    applyTransform(transform, { x: width, y: height }),
  ];
}

async function runStack(opts) {
  const { lightFiles, darkFiles, flatFiles, biasFiles, stackMethod, sigmaLow, sigmaHigh,
    alignTolerance, alignMaxStars, sigmaThreshold, rejectTrails, mosaicMode,
    gradeQuality, qualityStrictness } = opts;

  let masterBias = null, masterDark = null, masterFlat = null;

  if (biasFiles.length) {
    log(`Combinando ${biasFiles.length} bias...`);
    const r = await loadFramesRaw(biasFiles, 'bias');
    masterBias = combineFrames(r.frames, 'median');
  }
  if (darkFiles.length) {
    log(`Combinando ${darkFiles.length} darks...`);
    const r = await loadFramesRaw(darkFiles, 'dark');
    masterDark = combineFrames(r.frames, 'median');
  }
  if (flatFiles.length) {
    log(`Combinando ${flatFiles.length} flats...`);
    const r = await loadFramesRaw(flatFiles, 'flat');
    const rawFlat = combineFrames(r.frames, 'median');
    masterFlat = normalizeFlat(rawFlat, masterBias);
  }

  if (!lightFiles.length) throw new Error('No hay light frames');

  // ---------- PASE 1: leer, calibrar, debayer, detectar estrellas y calidad de cada light ----------
  log(`Leyendo y calibrando ${lightFiles.length} light frames...`);
  let bayerPattern = null;
  let refHeader = null;
  let channels = 1;
  const frames = []; // { data, width, height, stars, quality }

  for (let i = 0; i < lightFiles.length; i++) {
    const f = await readFitsFile(lightFiles[i]);
    let width = f.width, height = f.height;
    if (i === 0) { refHeader = f.header; if (f.header.BAYERPAT) bayerPattern = String(f.header.BAYERPAT).trim(); }

    const calibrated = calibrateLight(f.data, masterDark, masterFlat, masterBias);

    let frameData;
    if (bayerPattern) {
      const d = debayerSuperpixel(width, height, calibrated, bayerPattern);
      frameData = d.data; width = d.width; height = d.height; channels = 3;
    } else {
      frameData = calibrated;
      channels = 1;
    }
    let lum = luminanceOf(frameData, channels);

    if (rejectTrails) {
      const { mask, trails } = detectTrails(width, height, lum, {});
      if (trails.length > 0) {
        frameData = maskTrails(width, height, frameData, mask, channels);
        lum = luminanceOf(frameData, channels);
        log(`Frame ${i + 1}: ${trails.length} rastro(s) de avión/satélite detectado(s) y excluido(s)`);
      }
    }

    const stars = detectStars(width, height, lum, { sigmaThreshold: sigmaThreshold || 6, maxStars: 200 });
    const bg = estimateBackground(lum);
    const quality = computeFrameQuality(stars, bg.background, bg.sigma);

    frames.push({ data: frameData, width, height, stars, quality });
    progress((i + 1) / lightFiles.length, `Frame ${i + 1}/${lightFiles.length} leído (${stars.length} estrellas)`);
  }

  // ---------- PASE 2: alinear cada frame contra el frame de referencia (indice 0) ----------
  const ref = frames[0];
  const placements = new Array(frames.length).fill(null);
  placements[0] = { scale: 1, theta: 0, tx: 0, ty: 0 };
  const directGroup = [0];
  const unplaced = [];

  for (let i = 1; i < frames.length; i++) {
    if (frames[i].stars.length < 3 || ref.stars.length < 3) { unplaced.push(i); continue; }
    const result = alignToReference(ref.stars, frames[i].stars, {
      maxStars: alignMaxStars || 20, tolerance: alignTolerance || 0.012, minVotes: 2,
    });
    if (result) {
      placements[i] = result.transform;
      directGroup.push(i);
      log(`Frame ${i + 1}/${frames.length}: alineado (${result.pairs.length} estrellas de referencia)`);
    } else {
      unplaced.push(i);
    }
  }

  // ---------- PASE 3 (opcional): ensamblado de mosaico para los frames que no comparten campo con la referencia ----------
  let mosaicPanelsPlaced = 0;
  if (mosaicMode && unplaced.length) {
    log(`Modo mosaico: intentando encajar ${unplaced.length} frame(s) que no comparten campo con la referencia...`);
    let progressMade = true;
    while (progressMade && unplaced.length) {
      progressMade = false;
      for (let idx = unplaced.length - 1; idx >= 0; idx--) {
        const i = unplaced[idx];
        if (frames[i].stars.length < 3) continue;
        for (let j = 0; j < frames.length; j++) {
          if (!placements[j] || j === i) continue;
          if (frames[j].stars.length < 3) continue;
          const result = alignToReference(frames[j].stars, frames[i].stars, {
            maxStars: 80, tolerance: alignTolerance || 0.015, minVotes: 2,
          });
          if (result) {
            placements[i] = composeTransform(result.transform, placements[j]);
            unplaced.splice(idx, 1);
            progressMade = true;
            mosaicPanelsPlaced++;
            log(`Frame ${i + 1}: encajado como panel de mosaico (referenciado contra frame ${j + 1})`);
            break;
          }
        }
      }
    }
  }

  for (const i of unplaced) {
    log(`Frame ${i + 1}: no se pudo alinear ni encajar, se omite`);
  }

  // ---------- PASE 4 (opcional): graduacion de calidad, solo dentro del grupo alineado directamente ----------
  let qualityRejected = new Set();
  if (gradeQuality && directGroup.length >= 6) {
    const qualities = directGroup.map((i) => frames[i].quality);
    const graded = gradeFrames(qualities, qualityStrictness || 'standard');
    graded.forEach((g, k) => {
      if (g.reject) {
        const frameIdx = directGroup[k];
        qualityRejected.add(frameIdx);
        log(`Frame ${frameIdx + 1}: descartado por calidad — ${g.reasons.join(', ')}`);
      }
    });
  }

  const finalIndices = [];
  for (let i = 0; i < frames.length; i++) {
    if (placements[i] && !qualityRejected.has(i)) finalIndices.push(i);
  }
  if (finalIndices.length < 1) throw new Error('No quedó ningún frame utilizable tras alinear y graduar calidad');

  // ---------- Lienzo: bounding box de todos los frames finales (permite mosaicos y aprovecha mas borde) ----------
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const i of finalIndices) {
    for (const c of cornersOf(frames[i].width, frames[i].height, placements[i])) {
      if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
    }
  }
  const canvasW = Math.max(1, Math.ceil(maxX - minX));
  const canvasH = Math.max(1, Math.ceil(maxY - minY));
  const offsetX = -minX, offsetY = -minY;
  const isMosaic = mosaicPanelsPlaced > 0;

  if (isMosaic) log(`Lienzo de mosaico: ${canvasW}×${canvasH}px (${mosaicPanelsPlaced} panel(es) encajado(s))`);

  const warpedFrames = finalIndices.map((i) => {
    const t = placements[i];
    const adjusted = { scale: t.scale, theta: t.theta, tx: t.tx + offsetX, ty: t.ty + offsetY };
    return warpImage(frames[i].width, frames[i].height, frames[i].data, adjusted, channels, canvasW, canvasH);
  });

  log(`Apilando ${warpedFrames.length} frames con método ${stackMethod}...`);
  const stackedRaw = stackFrames(warpedFrames, stackMethod, { sigmaLow, sigmaHigh });
  const norm = normalize01(stackedRaw);

  log('Stacking completo.');
  residentData = norm.data;
  residentWidth = canvasW; residentHeight = canvasH; residentChannels = channels;

  const objectGuess = identifyObject(refHeader);
  const omittedCount = frames.length - finalIndices.length;

  const previewCopy = norm.data.slice().buffer;
  postMessage({
    type: 'stack-result',
    width: canvasW, height: canvasH, channels,
    usedFrames: finalIndices.length, failedFrames: omittedCount,
    qualityRejectedCount: qualityRejected.size,
    mosaicPanelsPlaced, isMosaic,
    bayerPattern,
    objectGuess,
    data: previewCopy,
  }, [previewCopy]);
}

// Combina varias sesiones (cada una un FITS lineal ya apilado, exportado previamente por AstroStack)
// en un unico mega-stack, alineandolas entre si igual que frames individuales.
async function runCombineSessions(opts) {
  const { sessionFiles, stackMethod, sigmaLow, sigmaHigh, sigmaThreshold, alignMaxStars, alignTolerance } = opts;
  if (!sessionFiles || sessionFiles.length < 2) throw new Error('Se necesitan al menos 2 sesiones para combinar');

  log(`Cargando ${sessionFiles.length} sesiones...`);
  let width, height, channels;
  let refStars = null;
  const aligned = [];
  let failedCount = 0;

  for (let i = 0; i < sessionFiles.length; i++) {
    const f = await readFitsFile(sessionFiles[i]);
    const c = f.channels || 1;
    let data = f.data;
    if (c > 1) data = planarToInterleaved(f.width, f.height, f.data, c);

    if (i === 0) {
      width = f.width; height = f.height; channels = c;
    } else if (f.width !== width || f.height !== height || c !== channels) {
      failedCount++;
      log(`Sesión ${i + 1}: dimensiones o canales distintos a la sesión de referencia, se omite`);
      progress((i + 1) / sessionFiles.length, `Sesión ${i + 1} omitida (no coincide)`);
      continue;
    }

    const lum = luminanceOf(data, channels);
    const stars = detectStars(width, height, lum, { sigmaThreshold: sigmaThreshold || 6, maxStars: 200 });

    if (i === 0) {
      refStars = stars;
      aligned.push(data);
      progress((i + 1) / sessionFiles.length, `Sesión de referencia (${stars.length} estrellas)`);
      continue;
    }

    if (stars.length < 3 || refStars.length < 3) {
      failedCount++;
      log(`Sesión ${i + 1}: pocas estrellas detectadas, se omite`);
      progress((i + 1) / sessionFiles.length, `Sesión ${i + 1} omitida (pocas estrellas)`);
      continue;
    }

    const result = alignToReference(refStars, stars, {
      maxStars: alignMaxStars || 20, tolerance: alignTolerance || 0.02, minVotes: 2,
    });

    if (!result) {
      failedCount++;
      log(`Sesión ${i + 1}: no se pudo alinear, se omite`);
      progress((i + 1) / sessionFiles.length, `Sesión ${i + 1} omitida (sin alinear)`);
      continue;
    }

    const warped = warpImage(width, height, data, result.transform, channels);
    aligned.push(warped);
    log(`Sesión ${i + 1}/${sessionFiles.length}: alineada (${result.pairs.length} estrellas de referencia)`);
    progress((i + 1) / sessionFiles.length, `Sesión ${i + 1} alineada`);
  }

  if (aligned.length < 1) throw new Error('No se pudo alinear ninguna sesión');

  log(`Combinando ${aligned.length} sesiones (${failedCount} omitidas)...`);
  const combined = stackFrames(aligned, stackMethod || 'average', { sigmaLow, sigmaHigh });
  const norm = normalize01(combined);

  residentData = norm.data;
  residentWidth = width; residentHeight = height; residentChannels = channels;

  log('Mega-stack completo.');
  const previewCopy = norm.data.slice().buffer;
  postMessage({
    type: 'stack-result',
    width, height, channels,
    usedFrames: aligned.length, failedFrames: failedCount,
    qualityRejectedCount: 0, mosaicPanelsPlaced: 0, isMosaic: false,
    bayerPattern: null,
    objectGuess: null,
    megaStack: true,
    data: previewCopy,
  }, [previewCopy]);
}

function runEdit(opts) {
  const { denoiseStrength, denoiseSigma, targetBackground, shadowsClip,
    black, white, gamma, saturation, sharpenAmount, sharpenSigma,
    gradientRemoval, gradientStrength } = opts;

  if (!residentData) { postMessage({ type: 'error', message: 'No hay datos apilados en memoria todavia' }); return; }
  const width = residentWidth, height = residentHeight, channels = residentChannels;
  let data = residentData;

  if (gradientRemoval) {
    data = removeGradient(width, height, data, channels, { degree: 2, strength: gradientStrength, gridSize: 16 });
  }

  if (denoiseStrength > 0) {
    data = edgeAwareDenoise(width, height, data, denoiseStrength, denoiseSigma, channels);
  }

  const lum = luminanceOf(data, channels);
  const stf = autoStretch(lum, { targetBackground, shadowsClip });
  let stretched = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const denom = 1 - stf.c0 || 1e-6;
    const v = Math.min(1, Math.max(0, (data[i] - stf.c0) / denom));
    stretched[i] = mtf(v, stf.m);
  }

  let leveled = levels(stretched, black, white, gamma);

  if (channels === 3 && saturation !== 1) {
    leveled = adjustSaturation(leveled, saturation);
  }

  let final = leveled;
  if (sharpenAmount > 0) {
    final = unsharpMask(width, height, leveled, sharpenAmount, sharpenSigma, channels);
  }

  postMessage({ type: 'edit-result', width, height, channels, data: final.buffer }, [final.buffer]);
}

function runExportFits(opts) {
  if (!residentData) { postMessage({ type: 'error', message: 'No hay datos para exportar' }); return; }
  const data = new Float64Array(opts.buffer);
  const buf = writeFits(residentWidth, residentHeight, data, { PROGRAM: 'AstroStack' }, residentChannels);
  postMessage({ type: 'export-fits-result', buffer: buf, suggestedName: 'astrostack_resultado.fits' }, [buf]);
}

function runExportTiff(opts) {
  if (!residentData) { postMessage({ type: 'error', message: 'No hay datos para exportar' }); return; }
  const data = new Float64Array(opts.buffer);
  const buf = writeTiff16(residentWidth, residentHeight, data, residentChannels);
  postMessage({ type: 'export-tiff-result', buffer: buf, suggestedName: 'astrostack_resultado.tiff' }, [buf]);
}

// Exporta el stack LINEAL (sin editar/estirar) para poder combinarlo mas adelante con otras sesiones.
function runExportLinear() {
  if (!residentData) { postMessage({ type: 'error', message: 'No hay datos para exportar' }); return; }
  const buf = writeFits(residentWidth, residentHeight, residentData, { PROGRAM: 'AstroStack', ASTACKLI: 'linear-session' }, residentChannels);
  postMessage({ type: 'export-linear-result', buffer: buf, suggestedName: 'astrostack_sesion_lineal.fits' }, [buf]);
}

onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'stack') {
      await runStack(msg.opts);
    } else if (msg.type === 'combine-sessions') {
      await runCombineSessions(msg.opts);
    } else if (msg.type === 'edit') {
      runEdit(msg.opts);
    } else if (msg.type === 'export-fits') {
      runExportFits(msg.opts);
    } else if (msg.type === 'export-tiff') {
      runExportTiff(msg.opts);
    } else if (msg.type === 'export-linear') {
      runExportLinear();
    }
  } catch (err) {
    postMessage({ type: 'error', message: err.message, stack: err.stack });
  }
};
