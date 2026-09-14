(function (global) {
  'use strict';

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // Genera triangulos SOLO a partir de vecinos cercanos espacialmente (como astroalign), no de
  // todas las combinaciones posibles. Esto es mucho mas rapido (O(n*k^2) en vez de O(n^3)) y mas
  // robusto: los triangulos "locales" son mucho menos propensos a coincidir por pura casualidad
  // con triangulos de otra zona del cielo que los triangulos formados por estrellas lejanas entre si.
  function buildTriangles(stars, maxStars, neighborK) {
    const pts = stars.slice(0, maxStars);
    const n = pts.length;
    const k = Math.min(neighborK || 7, n - 1);
    const triangles = [];
    if (n < 3) return triangles;

    for (let i = 0; i < n; i++) {
      const dists = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        dists.push({ j, d: dist(pts[i], pts[j]) });
      }
      dists.sort((a, b) => a.d - b.d);
      const neighbors = dists.slice(0, k).map((e) => e.j);

      for (let a = 0; a < neighbors.length; a++) {
        for (let b = a + 1; b < neighbors.length; b++) {
          const A = pts[i], B = pts[neighbors[a]], C = pts[neighbors[b]];
          const ab = dist(A, B), bc = dist(B, C), ca = dist(C, A);
          const verts = [{ p: A, opp: bc }, { p: B, opp: ca }, { p: C, opp: ab }];
          verts.sort((u, v) => u.opp - v.opp);
          const L1 = verts[0].opp, L2 = verts[1].opp, L3 = verts[2].opp;
          if (L1 < 1e-3) continue;
          const r1 = L2 / L3, r2 = L1 / L3;
          if (!isFinite(r1) || !isFinite(r2)) continue;
          triangles.push({ verts: verts.map((v) => v.p), r1, r2, perim: L1 + L2 + L3 });
        }
      }
    }
    return triangles;
  }

  function computeSimilarityTransform(pairs) {
    const n = pairs.length;
    let sxm = 0, sym = 0, dxm = 0, dym = 0;
    for (const p of pairs) { sxm += p.src.x; sym += p.src.y; dxm += p.dst.x; dym += p.dst.y; }
    sxm /= n; sym /= n; dxm /= n; dym /= n;

    let sxx = 0, sxy = 0, syx = 0, syy = 0;
    for (const p of pairs) {
      const sx = p.src.x - sxm, sy = p.src.y - sym;
      const dx = p.dst.x - dxm, dy = p.dst.y - dym;
      sxx += sx * dx; sxy += sx * dy;
      syx += sy * dx; syy += sy * dy;
    }
    const theta = Math.atan2(sxy - syx, sxx + syy);
    const cosT = Math.cos(theta), sinT = Math.sin(theta);

    let num = 0, den = 0;
    for (const p of pairs) {
      const sx = p.src.x - sxm, sy = p.src.y - sym;
      const dx = p.dst.x - dxm, dy = p.dst.y - dym;
      const rx = cosT * sx - sinT * sy;
      const ry = sinT * sx + cosT * sy;
      num += rx * dx + ry * dy;
      den += sx * sx + sy * sy;
    }
    const scale = den > 1e-9 ? num / den : 1;
    const tx = dxm - scale * (cosT * sxm - sinT * sym);
    const ty = dym - scale * (sinT * sxm + cosT * sym);
    return { scale, theta, tx, ty };
  }

  function matchStars(refStars, targetStars, opts) {
    opts = opts || {};
    const maxStars = opts.maxStars || 20;
    const tol = opts.tolerance || 0.01;
    const refTris = buildTriangles(refStars, maxStars, opts.neighborK);
    const tgtTris = buildTriangles(targetStars, maxStars, opts.neighborK);

    // Indexamos los triangulos de referencia por su invariante (r1,r2) en una rejilla, para no
    // tener que comparar cada triangulo objetivo contra TODOS los de referencia (esto es lo que
    // hacia inviable usar muchas estrellas -mosaicos- con el enfoque de fuerza bruta original).
    const bucketSize = Math.max(tol, 0.005);
    const buckets = new Map();
    const bucketKey = (r1, r2) => Math.floor(r1 / bucketSize) + '_' + Math.floor(r2 / bucketSize);
    for (const rt of refTris) {
      const key = bucketKey(rt.r1, rt.r2);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(rt);
    }

    const votes = new Map();
    const refIndexOf = new Map(refStars.map((s, i) => [s, i]));
    const tgtIndexOf = new Map(targetStars.map((s, i) => [s, i]));

    for (const tt of tgtTris) {
      const b1 = Math.floor(tt.r1 / bucketSize), b2 = Math.floor(tt.r2 / bucketSize);
      for (let d1 = -1; d1 <= 1; d1++) {
        for (let d2 = -1; d2 <= 1; d2++) {
          const candidates = buckets.get((b1 + d1) + '_' + (b2 + d2));
          if (!candidates) continue;
          for (const rt of candidates) {
            if (Math.abs(tt.r1 - rt.r1) < tol && Math.abs(tt.r2 - rt.r2) < tol) {
              for (let v = 0; v < 3; v++) {
                const ri = refIndexOf.get(rt.verts[v]);
                const ti = tgtIndexOf.get(tt.verts[v]);
                const key = ri + '_' + ti;
                votes.set(key, (votes.get(key) || 0) + 1);
              }
            }
          }
        }
      }
    }

    const arr = [...votes.entries()].map(([k, v]) => {
      const [ri, ti] = k.split('_').map(Number);
      return { ri, ti, votes: v };
    });
    arr.sort((a, b) => b.votes - a.votes);

    const usedRef = new Set(), usedTgt = new Set();
    const pairs = [];
    for (const m of arr) {
      if (m.votes < (opts.minVotes || 2)) continue;
      if (usedRef.has(m.ri) || usedTgt.has(m.ti)) continue;
      usedRef.add(m.ri); usedTgt.add(m.ti);
      pairs.push({ src: targetStars[m.ti], dst: refStars[m.ri] });
    }
    return pairs;
  }

  function alignToReference(refStars, targetStars, opts) {
    opts = opts || {};
    const pairs = matchStars(refStars, targetStars, opts);
    const minInliers = opts.minInliers || 4;
    if (pairs.length < minInliers) return null;

    // RANSAC real: los pares candidatos por votos de triangulos pueden ser mayoritariamente
    // espurios (sobre todo con muchas estrellas / solape parcial tipo mosaico), asi que no basta
    // con "afinar" el ajuste de minimos cuadrados de TODOS los pares - hay que buscar por consenso.
    const inlierThreshold = opts.ransacThreshold || 2.5;
    const iterations = Math.min(400, pairs.length * pairs.length);
    let bestInliers = null;

    // Semilla determinista sencilla para reproducibilidad razonable sin depender de Math.random
    // en exceso (no critico, pero evita resultados distintos entre llamadas identicas).
    function pick2(n, rand) {
      const i = Math.floor(rand() * n);
      let j = Math.floor(rand() * (n - 1));
      if (j >= i) j++;
      return [i, j];
    }
    let seed = 1234567;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    for (let iter = 0; iter < iterations; iter++) {
      const [i, j] = pick2(pairs.length, rand);
      let hypothesis;
      try { hypothesis = computeSimilarityTransform([pairs[i], pairs[j]]); } catch (e) { continue; }
      if (!isFinite(hypothesis.scale) || hypothesis.scale <= 0) continue;

      const inliers = [];
      for (const p of pairs) {
        const proj = applyTransform(hypothesis, p.src);
        if (Math.hypot(proj.x - p.dst.x, proj.y - p.dst.y) <= inlierThreshold) inliers.push(p);
      }
      if (!bestInliers || inliers.length > bestInliers.length) bestInliers = inliers;
    }

    if (!bestInliers || bestInliers.length < minInliers) return null;

    // Refinamiento final: reajustar por minimos cuadrados con TODOS los inliers encontrados,
    // y una pasada extra de limpieza por si el consenso incluyo algun caso limite.
    let currentPairs = bestInliers;
    let transform = computeSimilarityTransform(currentPairs);
    for (let iter = 0; iter < 3 && currentPairs.length > minInliers; iter++) {
      const residuals = currentPairs.map((p) => {
        const proj = applyTransform(transform, p.src);
        return Math.hypot(proj.x - p.dst.x, proj.y - p.dst.y);
      });
      const maxRes = Math.max(...residuals);
      if (maxRes <= inlierThreshold * 1.5) break;
      const keep = currentPairs.filter((_, i) => residuals[i] <= inlierThreshold * 1.5);
      if (keep.length === currentPairs.length || keep.length < minInliers) break;
      currentPairs = keep;
      transform = computeSimilarityTransform(currentPairs);
    }
    if (currentPairs.length < minInliers) return null;

    // Sanidad: todos los frames de una misma sesion vienen de la misma optica/sensor, asi que
    // la escala entre dos frames debe rondar 1 (dither/rotacion no deberian cambiar la escala de
    // la imagen). Un valor lejos de 1 casi siempre delata un emparejamiento espurio.
    const minScale = opts.minScale || 0.8, maxScale = opts.maxScale || 1.25;
    if (transform.scale < minScale || transform.scale > maxScale) return null;

    const finalResiduals = currentPairs.map((p) => {
      const proj = applyTransform(transform, p.src);
      return Math.hypot(proj.x - p.dst.x, proj.y - p.dst.y);
    });
    if (Math.max(...finalResiduals) > (opts.maxResidual || 3) * 2) return null;

    return { transform, pairs: currentPairs };
  }

  // Compone dos transformaciones de similitud: aplicar "inner" y despues "outer".
  // Si inner mapea A->B y outer mapea B->C, el resultado mapea A->C directamente.
  // Util para mosaicos: T(panel->panel_ya_colocado) compuesto con T(panel_ya_colocado->referencia).
  function composeTransform(inner, outer) {
    const s = inner.scale * outer.scale;
    const theta = inner.theta + outer.theta;
    const cosO = Math.cos(outer.theta), sinO = Math.sin(outer.theta);
    const tx = outer.scale * (cosO * inner.tx - sinO * inner.ty) + outer.tx;
    const ty = outer.scale * (sinO * inner.tx + cosO * inner.ty) + outer.ty;
    return { scale: s, theta, tx, ty };
  }

  // Aplica una transformacion (src->dst) a un punto.
  function applyTransform(transform, p) {
    const { scale, theta, tx, ty } = transform;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    return {
      x: scale * (cosT * p.x - sinT * p.y) + tx,
      y: scale * (sinT * p.x + cosT * p.y) + ty,
    };
  }

  // Remuestrea "data" (tamano srcWidth x srcHeight) al espacio de destino usando el transform
  // (que mapea src->dst). El lienzo de salida puede ser mayor que el de entrada (mosaicos):
  // dstWidth/dstHeight por defecto son srcWidth/srcHeight (comportamiento clasico de un solo frame).
  // Los pixeles sin cobertura quedan en NaN (para que el stacking los ignore correctamente).
  function warpImage(srcWidth, srcHeight, data, transform, channels, dstWidth, dstHeight) {
    channels = channels || 1;
    dstWidth = dstWidth || srcWidth;
    dstHeight = dstHeight || srcHeight;
    const { scale, theta, tx, ty } = transform;
    const cosT = Math.cos(-theta), sinT = Math.sin(-theta);
    const invScale = 1 / scale;
    const out = new Float64Array(dstWidth * dstHeight * channels).fill(NaN);

    for (let y = 0; y < dstHeight; y++) {
      for (let x = 0; x < dstWidth; x++) {
        const dx = x - tx, dy = y - ty;
        const rx = cosT * dx - sinT * dy;
        const ry = sinT * dx + cosT * dy;
        const sx = rx * invScale;
        const sy = ry * invScale;
        if (sx < 0 || sy < 0 || sx >= srcWidth - 1 || sy >= srcHeight - 1) continue;
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const fx = sx - x0, fy = sy - y0;
        for (let c = 0; c < channels; c++) {
          const i00 = (y0 * srcWidth + x0) * channels + c;
          const i10 = (y0 * srcWidth + x0 + 1) * channels + c;
          const i01 = ((y0 + 1) * srcWidth + x0) * channels + c;
          const i11 = ((y0 + 1) * srcWidth + x0 + 1) * channels + c;
          const top = data[i00] * (1 - fx) + data[i10] * fx;
          const bot = data[i01] * (1 - fx) + data[i11] * fx;
          out[(y * dstWidth + x) * channels + c] = top * (1 - fy) + bot * fy;
        }
      }
    }
    return out;
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, {
    matchStars, alignToReference, computeSimilarityTransform, warpImage, buildTriangles,
    composeTransform, applyTransform,
  });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
