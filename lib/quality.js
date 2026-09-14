(function (global) {
  'use strict';

  function median(arr) {
    const s = Float64Array.from(arr).sort();
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  function mad(arr, med) {
    const dev = arr.map((v) => Math.abs(v - med));
    return median(dev) * 1.4826 || 1e-6;
  }

  // Metricas de calidad de un frame individual a partir de sus estrellas detectadas y su fondo.
  function computeFrameQuality(stars, background, backgroundSigma) {
    const starCount = stars.length;
    const topStars = [...stars].sort((a, b) => b.flux - a.flux).slice(0, 10);
    const sizes = topStars.map((s) => s.size);
    const sharpnessSize = sizes.length ? median(sizes) : null; // menor = mas nitido/redondo
    return { starCount, background, backgroundSigma, sharpnessSize };
  }

  // strictness: 'lenient' | 'standard' | 'strict'
  function gradeFrames(qualities, strictness) {
    const kMap = { lenient: 5, standard: 3.5, strict: 2.5 };
    const k = kMap[strictness] || 3;

    const starCounts = qualities.map((q) => q.starCount);
    const backgrounds = qualities.map((q) => q.background);
    const sharpSizes = qualities.filter((q) => q.sharpnessSize !== null).map((q) => q.sharpnessSize);

    const medStars = median(starCounts), madStars = mad(starCounts, medStars);
    const medBg = median(backgrounds), madBg = mad(backgrounds, medBg);
    const medSharp = sharpSizes.length ? median(sharpSizes) : null;
    const madSharp = sharpSizes.length ? mad(sharpSizes, medSharp) : null;

    const results = qualities.map((q, i) => {
      const reasons = [];
      if (q.starCount < medStars - k * madStars) reasons.push('pocas estrellas (posible nube)');
      if (q.background > medBg + k * madBg) reasons.push('fondo de cielo muy brillante (nube/crepúsculo)');
      if (medSharp !== null && q.sharpnessSize !== null && q.sharpnessSize > medSharp + k * madSharp) {
        reasons.push('estrellas mal definidas (enfoque/trailing)');
      }
      return { index: i, reject: reasons.length > 0, reasons };
    });

    // red de seguridad: si se rechazarian demasiados frames, es mas probable que la
    // tanda entera tenga variación normal que un problema real -> nos quedamos con todos.
    const rejectedCount = results.filter((r) => r.reject).length;
    if (rejectedCount > qualities.length * 0.6) {
      return results.map((r) => ({ ...r, reject: false, reasons: [] }));
    }
    return results;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { computeFrameQuality, gradeFrames });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
