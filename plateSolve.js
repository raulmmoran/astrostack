(function () {
  'use strict';
  const API = 'https://nova.astrometry.net/api';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function login(apiKey) {
    const body = new URLSearchParams();
    body.set('request-json', JSON.stringify({ apikey: apiKey }));
    const res = await fetch(`${API}/login`, { method: 'POST', body });
    const data = await res.json();
    if (data.status !== 'success') {
      throw new Error('No se pudo iniciar sesión en astrometry.net (revisa tu API key): ' + (data.errormessage || data.status));
    }
    return data.session;
  }

  async function uploadFile(sessionKey, blob, filename) {
    const fd = new FormData();
    fd.append('request-json', JSON.stringify({
      session: sessionKey, publicly_visible: 'n', allow_commercial_use: 'n', allow_modifications: 'n',
    }));
    fd.append('file', blob, filename);
    const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.status !== 'success') throw new Error('Fallo al subir la imagen a astrometry.net: ' + JSON.stringify(data));
    return data.subid;
  }

  async function getSubmissionStatus(subId) {
    const res = await fetch(`${API}/submissions/${subId}`);
    return res.json();
  }

  async function getJobStatus(jobId) {
    const res = await fetch(`${API}/jobs/${jobId}`);
    return res.json();
  }

  async function getCalibration(jobId) {
    const res = await fetch(`${API}/jobs/${jobId}/calibration/`);
    return res.json();
  }

  async function getAnnotations(jobId) {
    const res = await fetch(`${API}/jobs/${jobId}/annotations/`);
    return res.json();
  }

  // Orquesta el flujo completo: login -> subir -> esperar submission -> esperar job -> resultados.
  async function solve(apiKey, blob, filename, onProgress) {
    const notify = onProgress || (() => {});

    notify('Iniciando sesión en astrometry.net…');
    const session = await login(apiKey);

    notify('Subiendo imagen…');
    const subId = await uploadFile(session, blob, filename);

    notify('Esperando a que comience el procesado…');
    let jobId = null;
    for (let i = 0; i < 40; i++) {
      const sub = await getSubmissionStatus(subId);
      if (sub.jobs && sub.jobs.length && sub.jobs[0]) { jobId = sub.jobs[0]; break; }
      await sleep(3000);
    }
    if (!jobId) throw new Error('Astrometry.net no ha empezado a procesar la imagen (tiempo de espera agotado). Puede que el servidor esté saturado — inténtalo de nuevo más tarde.');

    notify('Resolviendo el campo (puede tardar 1-2 minutos)…');
    let solved = false, failed = false;
    for (let i = 0; i < 60; i++) {
      const job = await getJobStatus(jobId);
      if (job.status === 'success') { solved = true; break; }
      if (job.status === 'failure') { failed = true; break; }
      await sleep(4000);
    }
    if (failed) throw new Error('Astrometry.net no pudo identificar el campo (puede necesitar más estrellas o mejor resolución).');
    if (!solved) throw new Error('Tiempo de espera agotado esperando la resolución.');

    notify('Obteniendo resultados…');
    const calibration = await getCalibration(jobId);
    const annotationsRes = await getAnnotations(jobId);
    return { jobId, calibration, annotations: annotationsRes.annotations || [] };
  }

  window.PlateSolve = { solve, login, uploadFile, getCalibration, getAnnotations };
})();
