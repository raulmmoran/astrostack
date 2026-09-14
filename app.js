const state = {
  lights: [], darks: [], flats: [], bias: [], sessions: [],
  stackWidth: 0, stackHeight: 0, stackChannels: 1,
  currentEditBuffer: null,
};

const worker = new Worker('worker.js');

// ---------- navegacion por pasos ----------
function gotoStep(n) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('panel-' + n).classList.remove('hidden');
  document.querySelectorAll('.step').forEach(s => {
    s.classList.toggle('active', Number(s.dataset.step) === n);
  });
}
document.querySelectorAll('.step').forEach(s => {
  s.addEventListener('click', () => {
    if (s.disabled) return;
    gotoStep(Number(s.dataset.step));
  });
});

// ---------- paso 1: carga de archivos ----------
function renderFileList(kind) {
  const el = document.getElementById('list-' + kind);
  const arr = state[kind];
  if (!arr.length) { el.innerHTML = '<span class="empty">Ningún archivo cargado</span>'; return; }
  el.innerHTML = arr.map(f => `<span class="file-chip">${f.name}</span>`).join('');
}

['lights', 'darks', 'flats', 'bias'].forEach(kind => {
  document.getElementById('input-' + kind).addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      state[kind] = state[kind].concat(files);
      renderFileList(kind);
      document.getElementById('btn-goto-2').disabled = state.lights.length === 0;
    }
    e.target.value = '';
  });
});

document.getElementById('btn-goto-2').addEventListener('click', () => {
  document.querySelectorAll('.step')[1].disabled = false;
  gotoStep(2);
});

// ---------- modo: nueva sesión vs combinar sesiones ----------
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.mode;
    document.getElementById('panel-1-normal').classList.toggle('hidden', mode !== 'new');
    document.getElementById('panel-combine').classList.toggle('hidden', mode !== 'combine');
  });
});

document.getElementById('input-sessions').addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length) {
    state.sessions = state.sessions.concat(files);
    const el = document.getElementById('list-sessions');
    el.innerHTML = state.sessions.map(f => `<span class="file-chip">${f.name}</span>`).join('');
    document.getElementById('btn-combine').disabled = state.sessions.length < 2;
  }
  e.target.value = '';
});

function logLineCombine(text) {
  const log = document.getElementById('log-combine');
  log.textContent += text + '\n';
  log.scrollTop = log.scrollHeight;
}

document.getElementById('btn-combine').addEventListener('click', () => {
  state.activeFlow = 'combine';
  document.getElementById('progress-wrap-combine').classList.remove('hidden');
  document.getElementById('log-combine').textContent = '';
  document.getElementById('btn-combine').disabled = true;

  worker.postMessage({
    type: 'combine-sessions',
    opts: {
      sessionFiles: state.sessions,
      stackMethod: document.getElementById('combine-method').value,
      sigmaLow: 2.5, sigmaHigh: 2.5,
      sigmaThreshold: 6, alignMaxStars: 20, alignTolerance: 0.02,
    },
  });
});

// ---------- paso 2: procesar ----------
document.getElementById('stack-method').addEventListener('change', (e) => {
  document.getElementById('sigma-params').style.display = e.target.value === 'sigmaClip' ? 'block' : 'none';
});
document.getElementById('star-threshold').addEventListener('input', (e) => {
  document.getElementById('star-threshold-val').textContent = Number(e.target.value).toFixed(1) + ' σ';
});
document.getElementById('grade-quality').addEventListener('change', (e) => {
  document.getElementById('quality-strictness-row').style.display = e.target.checked ? 'block' : 'none';
});

function logLine(text) {
  const log = document.getElementById('log');
  log.textContent += text + '\n';
  log.scrollTop = log.scrollHeight;
}

document.getElementById('btn-process').addEventListener('click', () => {
  state.activeFlow = 'stack';
  document.getElementById('progress-wrap').classList.remove('hidden');
  document.getElementById('log').textContent = '';
  document.getElementById('btn-process').disabled = true;

  const opts = {
    lightFiles: state.lights, darkFiles: state.darks, flatFiles: state.flats, biasFiles: state.bias,
    stackMethod: document.getElementById('stack-method').value,
    sigmaLow: parseFloat(document.getElementById('sigma-low').value),
    sigmaHigh: parseFloat(document.getElementById('sigma-high').value),
    sigmaThreshold: parseFloat(document.getElementById('star-threshold').value),
    alignMaxStars: 20,
    alignTolerance: 0.012,
    rejectTrails: document.getElementById('reject-trails').checked,
    mosaicMode: document.getElementById('mosaic-mode').checked,
    gradeQuality: document.getElementById('grade-quality').checked,
    qualityStrictness: document.getElementById('quality-strictness').value,
  };
  worker.postMessage({ type: 'stack', opts });
});

// ---------- paso 3: edicion con vista previa en vivo ----------
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');

function renderToCanvas(canvas, ctx, width, height, data, channels) {
  canvas.width = width; canvas.height = height;
  const imgData = ctx.createImageData(width, height);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    let r, g, b;
    if (channels === 3) { r = data[i * 3]; g = data[i * 3 + 1]; b = data[i * 3 + 2]; }
    else { r = g = b = data[i]; }
    imgData.data[i * 4] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    imgData.data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    imgData.data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}

function currentEditOpts() {
  return {
    denoiseStrength: parseFloat(document.getElementById('denoise-strength').value),
    denoiseSigma: parseFloat(document.getElementById('denoise-radius').value),
    targetBackground: parseFloat(document.getElementById('target-bg').value),
    shadowsClip: parseFloat(document.getElementById('shadows-clip').value),
    black: parseFloat(document.getElementById('black').value),
    white: parseFloat(document.getElementById('white').value),
    gamma: parseFloat(document.getElementById('gamma').value),
    saturation: parseFloat(document.getElementById('saturation').value),
    sharpenAmount: parseFloat(document.getElementById('sharp-amount').value),
    sharpenSigma: parseFloat(document.getElementById('sharp-radius').value),
    gradientRemoval: document.getElementById('gradient-removal').checked,
    gradientStrength: parseFloat(document.getElementById('gradient-strength').value),
  };
}

let editDebounce = null;
function requestEdit() {
  document.getElementById('preview-status').textContent = 'Procesando…';
  clearTimeout(editDebounce);
  editDebounce = setTimeout(() => {
    worker.postMessage({ type: 'edit', opts: currentEditOpts() });
  }, 150);
}

document.getElementById('gradient-removal').addEventListener('change', requestEdit);

const editControlIds = ['target-bg', 'shadows-clip', 'black', 'white', 'gamma', 'denoise-strength', 'denoise-radius', 'sharp-amount', 'sharp-radius', 'saturation', 'gradient-strength'];
const valSpanMap = {
  'target-bg': 'bg-val', 'shadows-clip': 'clip-val', black: 'black-val', white: 'white-val', gamma: 'gamma-val',
  'denoise-strength': 'denoise-val', 'denoise-radius': 'denoise-radius-val',
  'sharp-amount': 'sharp-val', 'sharp-radius': 'sharp-radius-val', saturation: 'sat-val',
  'gradient-strength': 'gradient-val',
};
editControlIds.forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    document.getElementById(valSpanMap[id]).textContent = Number(e.target.value).toFixed(2);
    requestEdit();
  });
});

document.getElementById('btn-reset-edit').addEventListener('click', () => {
  const defaults = { 'target-bg': 0.25, 'shadows-clip': 2.8, black: 0, white: 1, gamma: 1, 'denoise-strength': 0.35, 'denoise-radius': 1.5, 'sharp-amount': 0.4, 'sharp-radius': 1.2, saturation: 1.2, 'gradient-strength': 0.8 };
  for (const [id, v] of Object.entries(defaults)) {
    document.getElementById(id).value = v;
    document.getElementById(valSpanMap[id]).textContent = Number(v).toFixed(2);
  }
  document.getElementById('gradient-removal').checked = false;
  requestEdit();
});

document.getElementById('btn-goto-4').addEventListener('click', () => {
  document.querySelectorAll('.step')[3].disabled = false;
  gotoStep(4);
  const canvas2 = document.getElementById('preview-canvas-2');
  canvas2.width = previewCanvas.width; canvas2.height = previewCanvas.height;
  canvas2.getContext('2d').drawImage(previewCanvas, 0, 0);
});

// ---------- paso 4: exportar / compartir ----------
async function saveFile(blob, filename) {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      logLine('Compartido: ' + filename);
      return;
    }
  } catch (err) {
    // el usuario cancelo el share sheet u otro error: seguimos con descarga directa
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  logLine('Descargado: ' + filename);
}

document.getElementById('export-png').addEventListener('click', () => {
  previewCanvas.toBlob((blob) => saveFile(blob, 'astrostack_resultado.png'), 'image/png');
});

document.getElementById('export-tiff16').addEventListener('click', () => {
  if (!state.currentEditBuffer) return;
  const copy = state.currentEditBuffer.slice();
  worker.postMessage({ type: 'export-tiff', opts: { buffer: copy.buffer } }, [copy.buffer]);
});

document.getElementById('export-fits').addEventListener('click', () => {
  if (!state.currentEditBuffer) return;
  const copy = state.currentEditBuffer.slice();
  worker.postMessage({ type: 'export-fits', opts: { buffer: copy.buffer } }, [copy.buffer]);
});

document.getElementById('export-linear').addEventListener('click', () => {
  worker.postMessage({ type: 'export-linear', opts: {} });
});

// ---------- plate-solving opcional (astrometry.net) ----------
const astrometryKeyInput = document.getElementById('astrometry-key');
astrometryKeyInput.value = localStorage.getItem('astrostack_astrometry_key') || '';
astrometryKeyInput.addEventListener('change', () => {
  localStorage.setItem('astrostack_astrometry_key', astrometryKeyInput.value.trim());
});

document.getElementById('btn-platesolve').addEventListener('click', async () => {
  const apiKey = astrometryKeyInput.value.trim();
  const statusEl = document.getElementById('platesolve-status');
  const resultEl = document.getElementById('platesolve-result');
  resultEl.innerHTML = '';
  if (!apiKey) { statusEl.textContent = 'Introduce tu API key de astrometry.net primero.'; return; }
  if (!state.currentEditBuffer) { statusEl.textContent = 'Primero procesa y edita una imagen.'; return; }

  document.getElementById('btn-platesolve').disabled = true;
  try {
    const blob = await new Promise((resolve) => previewCanvas.toBlob(resolve, 'image/png'));
    const result = await PlateSolve.solve(apiKey, blob, 'astrostack.png', (msg) => { statusEl.textContent = msg; });
    statusEl.textContent = 'Resuelto correctamente.';
    const c = result.calibration;
    const names = result.annotations
      .map(a => (a.names && a.names.length ? a.names.join(' / ') : null))
      .filter(Boolean);
    const uniqueNames = [...new Set(names)];
    resultEl.innerHTML = `
      <div class="platesolve-summary">
        <div><strong>Centro:</strong> RA ${c.ra.toFixed(4)}°, Dec ${c.dec.toFixed(4)}°</div>
        <div><strong>Escala:</strong> ${c.pixscale.toFixed(2)} arcsec/px</div>
        <div><strong>Orientación:</strong> ${c.orientation.toFixed(1)}°</div>
        ${uniqueNames.length ? `<div><strong>Objetos identificados:</strong> ${uniqueNames.join(', ')}</div>` : '<div>No se identificaron objetos catalogados en el campo.</div>'}
      </div>`;
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  } finally {
    document.getElementById('btn-platesolve').disabled = false;
  }
});

// ---------- mensajes del worker ----------
worker.onmessage = (e) => {
  const msg = e.data;
  const combine = state.activeFlow === 'combine';

  if (msg.type === 'log') {
    (combine ? logLineCombine : logLine)(msg.text);
  } else if (msg.type === 'progress') {
    if (combine) {
      if (msg.progress !== null) document.getElementById('progress-fill-combine').style.width = Math.round(msg.progress * 100) + '%';
      document.getElementById('progress-text-combine').textContent = msg.text;
    } else {
      if (msg.progress !== null) document.getElementById('progress-fill').style.width = Math.round(msg.progress * 100) + '%';
      document.getElementById('progress-text').textContent = msg.text;
    }
  } else if (msg.type === 'stack-result') {
    state.stackWidth = msg.width; state.stackHeight = msg.height; state.stackChannels = msg.channels;
    document.getElementById('saturation-block').style.display = msg.channels === 3 ? 'block' : 'none';

    const summary = msg.megaStack
      ? `Mega-stack listo: ${msg.usedFrames} sesiones combinadas, ${msg.failedFrames} omitidas.`
      : `Listo: ${msg.usedFrames} frames apilados, ${msg.failedFrames} omitidos.` +
        `${msg.bayerPattern ? ' Patrón Bayer: ' + msg.bayerPattern + ' (superpixel, media resolución).' : ' (mono).'}` +
        `${msg.qualityRejectedCount ? ` ${msg.qualityRejectedCount} frame(s) descartado(s) por calidad.` : ''}` +
        `${msg.isMosaic ? ` Mosaico detectado: ${msg.mosaicPanelsPlaced} panel(es) encajado(s), lienzo ${msg.width}×${msg.height}px.` : ''}`;
    (combine ? logLineCombine : logLine)(summary);

    const guessEl = document.getElementById('object-guess');
    if (msg.objectGuess && msg.objectGuess.nearby && msg.objectGuess.nearby.length) {
      const top = msg.objectGuess.nearby[0];
      const distTxt = top.distanceDeg < 0.05 ? '' : ` (a ${top.distanceDeg.toFixed(2)}° del centro estimado)`;
      guessEl.textContent = `Podría ser: ${top.id}${top.name ? ' — ' + top.name : ''}${distTxt}`;
      guessEl.classList.remove('hidden');
    } else {
      guessEl.classList.add('hidden');
    }

    document.getElementById('btn-process').disabled = false;
    document.getElementById('btn-combine').disabled = false;
    document.querySelectorAll('.step')[2].disabled = false;
    gotoStep(3);
    requestEdit();
  } else if (msg.type === 'edit-result') {
    const data = new Float64Array(msg.data);
    state.currentEditBuffer = data;
    renderToCanvas(previewCanvas, previewCtx, msg.width, msg.height, data, msg.channels);
    document.getElementById('preview-status').textContent = `${msg.width} × ${msg.height}px`;
  } else if (msg.type === 'export-fits-result') {
    saveFile(new Blob([msg.buffer], { type: 'application/octet-stream' }), msg.suggestedName);
  } else if (msg.type === 'export-tiff-result') {
    saveFile(new Blob([msg.buffer], { type: 'image/tiff' }), msg.suggestedName);
  } else if (msg.type === 'export-linear-result') {
    saveFile(new Blob([msg.buffer], { type: 'application/octet-stream' }), msg.suggestedName);
  } else if (msg.type === 'error') {
    (combine ? logLineCombine : logLine)('ERROR: ' + msg.message);
    document.getElementById('btn-process').disabled = false;
    document.getElementById('btn-combine').disabled = false;
    console.error(msg.stack);
  }
};

// ---------- service worker (uso offline) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
