(function (global) {
  'use strict';

  // Catalogo Messier (110 objetos), coordenadas J2000 en grados decimales.
  // Fuente de los datos numericos (RA/Dec): catalogo Messier de SEDS (dominio publico / hechos astronomicos).
  var MESSIER_CATALOG = [{"id":"M110","ra":10.1,"dec":41.6833,"name":"Satélite de Andrómeda (M110)"},{"id":"M31","ra":10.675,"dec":41.2667,"name":"Galaxia de Andrómeda"},{"id":"M32","ra":10.675,"dec":40.8667,"name":"Satélite de Andrómeda (M32)"},{"id":"M103","ra":23.3,"dec":60.7,"name":null},{"id":"M33","ra":23.475,"dec":30.65,"name":"Galaxia del Triángulo"},{"id":"M74","ra":24.175,"dec":15.7833,"name":null},{"id":"M76","ra":25.6,"dec":51.5667,"name":null},{"id":"M34","ra":40.5,"dec":42.7833,"name":null},{"id":"M77","ra":40.675,"dec":-0.0167,"name":null},{"id":"M45","ra":56.75,"dec":24.1167,"name":"Las Pléyades"},{"id":"M79","ra":81.125,"dec":-24.55,"name":null},{"id":"M38","ra":82.1,"dec":35.8333,"name":null},{"id":"M1","ra":83.625,"dec":22.0167,"name":"Nebulosa del Cangrejo"},{"id":"M42","ra":83.85,"dec":-5.45,"name":"Nebulosa de Orión"},{"id":"M43","ra":83.9,"dec":-5.2667,"name":"Nebulosa de De Mairan"},{"id":"M36","ra":84.025,"dec":34.1333,"name":null},{"id":"M78","ra":86.675,"dec":0.05,"name":null},{"id":"M37","ra":88.1,"dec":32.55,"name":null},{"id":"M35","ra":92.225,"dec":24.3333,"name":null},{"id":"M41","ra":101.5,"dec":-20.7333,"name":null},{"id":"M50","ra":105.8,"dec":-8.3333,"name":null},{"id":"M47","ra":114.15,"dec":-14.5,"name":null},{"id":"M46","ra":115.45,"dec":-14.8167,"name":null},{"id":"M93","ra":116.15,"dec":-23.8667,"name":null},{"id":"M48","ra":123.45,"dec":-5.8,"name":null},{"id":"M44","ra":130.025,"dec":19.9833,"name":"Cúmulo del Pesebre"},{"id":"M67","ra":132.6,"dec":11.8167,"name":null},{"id":"M81","ra":148.9,"dec":69.0667,"name":"Galaxia de Bode"},{"id":"M82","ra":148.95,"dec":69.6833,"name":"Galaxia del Cigarro"},{"id":"M95","ra":161,"dec":11.7,"name":null},{"id":"M96","ra":161.7,"dec":11.8167,"name":null},{"id":"M105","ra":161.95,"dec":12.5833,"name":null},{"id":"M108","ra":167.875,"dec":55.6667,"name":null},{"id":"M97","ra":168.7,"dec":55.0167,"name":"Nebulosa del Búho"},{"id":"M65","ra":169.725,"dec":13.0833,"name":"Tríplete de Leo (M65)"},{"id":"M66","ra":170.05,"dec":12.9833,"name":"Tríplete de Leo (M66)"},{"id":"M109","ra":179.4,"dec":53.3833,"name":null},{"id":"M98","ra":183.45,"dec":14.9,"name":null},{"id":"M99","ra":184.7,"dec":14.4167,"name":null},{"id":"M106","ra":184.75,"dec":47.3,"name":null},{"id":"M61","ra":185.475,"dec":4.4667,"name":null},{"id":"M40","ra":185.6,"dec":58.0833,"name":null},{"id":"M100","ra":185.725,"dec":15.8167,"name":null},{"id":"M84","ra":186.275,"dec":12.8833,"name":null},{"id":"M85","ra":186.35,"dec":18.1833,"name":null},{"id":"M86","ra":186.55,"dec":12.95,"name":null},{"id":"M49","ra":187.45,"dec":8,"name":null},{"id":"M87","ra":187.7,"dec":12.4,"name":null},{"id":"M88","ra":188,"dec":14.4167,"name":null},{"id":"M91","ra":188.85,"dec":14.5,"name":null},{"id":"M89","ra":188.925,"dec":12.55,"name":null},{"id":"M90","ra":189.2,"dec":13.1667,"name":null},{"id":"M58","ra":189.425,"dec":11.8167,"name":null},{"id":"M68","ra":189.875,"dec":-26.75,"name":null},{"id":"M104","ra":190,"dec":-11.6167,"name":"Galaxia del Sombrero"},{"id":"M59","ra":190.5,"dec":11.65,"name":null},{"id":"M60","ra":190.925,"dec":11.55,"name":null},{"id":"M94","ra":192.725,"dec":41.1167,"name":null},{"id":"M64","ra":194.175,"dec":21.6833,"name":"Galaxia del Ojo Negro"},{"id":"M53","ra":198.225,"dec":18.1667,"name":null},{"id":"M63","ra":198.95,"dec":42.0333,"name":"Galaxia del Girasol"},{"id":"M51","ra":202.475,"dec":47.2,"name":"Galaxia del Remolino"},{"id":"M83","ra":204.25,"dec":-29.8667,"name":"Molinete Austral"},{"id":"M3","ra":205.55,"dec":28.3833,"name":null},{"id":"M101","ra":210.8,"dec":54.35,"name":"Galaxia del Molinete"},{"id":"M102","ra":226.625,"dec":55.7667,"name":null},{"id":"M5","ra":229.65,"dec":2.0833,"name":null},{"id":"M80","ra":244.25,"dec":-22.9833,"name":null},{"id":"M4","ra":245.9,"dec":-26.5333,"name":null},{"id":"M107","ra":248.125,"dec":-13.05,"name":null},{"id":"M13","ra":250.425,"dec":36.4667,"name":"Cúmulo de Hércules"},{"id":"M12","ra":251.8,"dec":-1.95,"name":null},{"id":"M10","ra":254.275,"dec":-4.1,"name":null},{"id":"M62","ra":255.3,"dec":-30.1167,"name":null},{"id":"M19","ra":255.65,"dec":-26.2667,"name":null},{"id":"M92","ra":259.275,"dec":43.1333,"name":null},{"id":"M9","ra":259.8,"dec":-18.5167,"name":null},{"id":"M14","ra":264.4,"dec":-3.25,"name":null},{"id":"M6","ra":265.025,"dec":-32.2167,"name":null},{"id":"M7","ra":268.475,"dec":-34.8167,"name":null},{"id":"M23","ra":269.2,"dec":-19.0167,"name":null},{"id":"M20","ra":270.65,"dec":-23.0333,"name":"Nebulosa Trífida"},{"id":"M8","ra":270.95,"dec":-24.3833,"name":"Nebulosa de la Laguna"},{"id":"M21","ra":271.15,"dec":-22.5,"name":null},{"id":"M24","ra":274.225,"dec":-18.4833,"name":null},{"id":"M16","ra":274.7,"dec":-13.7833,"name":"Nebulosa del Águila"},{"id":"M18","ra":274.975,"dec":-17.1333,"name":null},{"id":"M17","ra":275.2,"dec":-16.1833,"name":"Nebulosa Omega"},{"id":"M28","ra":276.125,"dec":-24.8667,"name":null},{"id":"M69","ra":277.85,"dec":-32.35,"name":null},{"id":"M25","ra":277.9,"dec":-19.25,"name":null},{"id":"M22","ra":279.1,"dec":-23.9,"name":null},{"id":"M70","ra":280.8,"dec":-32.3,"name":null},{"id":"M26","ra":281.3,"dec":-9.4,"name":null},{"id":"M11","ra":282.775,"dec":-6.2667,"name":null},{"id":"M57","ra":283.4,"dec":33.0333,"name":"Nebulosa del Anillo"},{"id":"M54","ra":283.775,"dec":-30.4833,"name":null},{"id":"M56","ra":289.15,"dec":30.1833,"name":null},{"id":"M55","ra":295,"dec":-30.9667,"name":null},{"id":"M71","ra":298.45,"dec":18.7833,"name":null},{"id":"M27","ra":299.9,"dec":22.7167,"name":"Nebulosa Dumbbell"},{"id":"M75","ra":301.525,"dec":-21.9167,"name":null},{"id":"M29","ra":305.975,"dec":38.5333,"name":null},{"id":"M72","ra":313.375,"dec":-12.5333,"name":null},{"id":"M73","ra":314.725,"dec":-12.6333,"name":null},{"id":"M15","ra":322.5,"dec":12.1667,"name":null},{"id":"M39","ra":323.05,"dec":48.4333,"name":null},{"id":"M2","ra":323.375,"dec":-0.8167,"name":null},{"id":"M30","ra":325.1,"dec":-23.1833,"name":null},{"id":"M52","ra":351.05,"dec":61.5833,"name":null}];

  function angularDistanceDeg(ra1, dec1, ra2, dec2) {
    var r1 = ra1 * Math.PI / 180, d1 = dec1 * Math.PI / 180;
    var r2 = ra2 * Math.PI / 180, d2 = dec2 * Math.PI / 180;
    var cosC = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(r1 - r2);
    cosC = Math.min(1, Math.max(-1, cosC));
    return Math.acos(cosC) * 180 / Math.PI;
  }

  // Devuelve los objetos del catalogo dentro de maxRadiusDeg de (raDeg, decDeg), ordenados por cercania.
  function findNearbyObjects(raDeg, decDeg, maxRadiusDeg) {
    maxRadiusDeg = maxRadiusDeg === undefined ? 3 : maxRadiusDeg;
    var results = [];
    for (var i = 0; i < MESSIER_CATALOG.length; i++) {
      var obj = MESSIER_CATALOG[i];
      var d = angularDistanceDeg(raDeg, decDeg, obj.ra, obj.dec);
      if (d <= maxRadiusDeg) results.push({ id: obj.id, name: obj.name, distanceDeg: d });
    }
    results.sort(function (a, b) { return a.distanceDeg - b.distanceDeg; });
    return results;
  }

  // Intenta leer RA/Dec (grados decimales) de las variantes de cabecera FITS mas comunes.
  function extractRaDecFromHeader(header) {
    function parseSexagesimal(str, isRa) {
      if (typeof str !== 'string') return null;
      var parts = str.trim().split(/[s:]+/).map(Number);
      if (parts.length < 2 || parts.some(isNaN)) return null;
      var sign = (str.trim()[0] === '-') ? -1 : 1;
      var h = Math.abs(parts[0]), m = parts[1] || 0, s = parts[2] || 0;
      var val = h + m / 60 + s / 3600;
      if (isRa) val *= 15; // horas -> grados
      return sign * val;
    }
    var ra = null, dec = null;
    if (typeof header.RA === 'number') ra = header.RA;
    else if (typeof header.RA === 'string') ra = parseSexagesimal(header.RA, true);
    else if (typeof header.OBJCTRA === 'string') ra = parseSexagesimal(header.OBJCTRA, true);
    else if (typeof header.CRVAL1 === 'number') ra = header.CRVAL1;

    if (typeof header.DEC === 'number') dec = header.DEC;
    else if (typeof header.DEC === 'string') dec = parseSexagesimal(header.DEC, false);
    else if (typeof header.OBJCTDEC === 'string') dec = parseSexagesimal(header.OBJCTDEC, false);
    else if (typeof header.CRVAL2 === 'number') dec = header.CRVAL2;

    if (ra === null || dec === null) return null;
    return { ra: ra, dec: dec };
  }

  global.AstroLib = global.AstroLib || {};
  Object.assign(global.AstroLib, { MESSIER_CATALOG: MESSIER_CATALOG, findNearbyObjects: findNearbyObjects, extractRaDecFromHeader: extractRaDecFromHeader });
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
