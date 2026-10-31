/* Lógica del juego sin pantalla: escala de precios, puntaje, fechas de Argentina, códigos de sala. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PAP = root.PAP || {}; root.PAP.core = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 10000, MAX = 5000000, START = 200000;
  var LN_MIN = Math.log(MIN), LN_SPAN = Math.log(MAX) - Math.log(MIN);
  var MAX_ROUND_POINTS = 1200 * 1.5;          // 1.000 base + 200 de bonus, con racha máxima
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* ----- escala logarítmica del control de precio ----- */
  function clamp(v) { return Math.min(MAX, Math.max(MIN, v)); }
  function toPos(price) { return (Math.log(clamp(price)) - LN_MIN) / LN_SPAN; }
  function stepFor(v) { return v < 50000 ? 500 : v < 500000 ? 5000 : v < 1000000 ? 10000 : 50000; }
  function fromPos(t) {
    var v = Math.exp(LN_MIN + Math.min(1, Math.max(0, t)) * LN_SPAN);
    var s = stepFor(v);
    return clamp(Math.round(v / s) * s);
  }

  /* ----- puntaje ----- */
  function roundScore(guess, real) {
    var e = Math.abs(Math.log(guess / real));
    var base = Math.round(1000 * Math.exp(-2.2 * e));
    var rel = guess / real - 1;
    return { base: base, bonus: Math.abs(rel) <= 0.03 + 1e-9 ? 200 : 0, rel: rel };   // la tolerancia evita que un 3% justo se pierda por decimales
  }
  function multOf(streak) { return 1 + 0.1 * Math.min(streak, 5); }
  function verdictOf(r) {
    if (r.bonus) return 'Exacto';
    if (r.base >= 800) return 'Muy cerca';
    if (r.base >= 600) return 'Cerca';
    if (r.base >= 350) return 'Lejos';
    return 'Muy lejos';
  }
  function rankOf(avgBase) {
    return avgBase >= 850 ? 'Tasador experto'
      : avgBase >= 700 ? 'Ojo clínico'
      : avgBase >= 500 ? 'Buen ojo'
      : avgBase >= 300 ? 'En formación'
      : 'A ciegas';
  }
  function tier(base) { return base >= 700 ? 'good' : base >= 350 ? 'mid' : 'bad'; }

  /* ----- partida ----- */
  function createGame(opts) {
    var s = { mode: opts.mode, items: opts.items, round: 0, total: 0, base: 0, streak: 0, log: [] };
    if (opts.saved) {
      s.round = opts.saved.round; s.total = opts.saved.total; s.base = opts.saved.base;
      s.streak = opts.saved.streak; s.log = opts.saved.log.slice();
    }
    return {
      state: s,
      current: function () { return s.items[s.round]; },
      done: function () { return s.round >= s.items.length; },
      guess: function (price) {
        var it = s.items[s.round];
        var r = roundScore(price, it.p);
        var mult = multOf(s.streak);
        var pts = Math.round((r.base + r.bonus) * mult);
        var entry = { id: it.id, guess: price, real: it.p, pts: pts, base: r.base, bonus: r.bonus, mult: mult, err: r.rel };
        s.total += pts; s.base += r.base;
        s.streak = r.base >= 700 ? s.streak + 1 : 0;
        s.log.push(entry); s.round++;
        return entry;
      },
      snapshot: function () { return { round: s.round, total: s.total, base: s.base, streak: s.streak, log: s.log.slice() }; }
    };
  }

  /* ----- azar repetible ----- */
  function hashStr(s) {
    var h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pickIndices(n, len, rng) {
    var a = []; for (var i = 0; i < len; i++) a.push(i);
    for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(rng() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return a.slice(0, Math.min(n, len));
  }
  function pickItems(products, n, rng) {
    return pickIndices(n, products.length, rng).map(function (i) { return products[i]; });
  }
  // El lote del día sale de la lista ordenada por id, así no depende del orden del archivo.
  function dailyItems(products, dateKey, n) {
    var sorted = products.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return pickItems(sorted, n || 5, mulberry32(hashStr('pap-' + dateKey)));
  }

  /* ----- fechas: el día cambia a las 00:00 de Argentina (UTC-3) en cualquier celular ----- */
  function arDateKey(now) {
    return new Date((now || new Date()).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function weekStartKey(dateKey) {            // lunes de esa semana
    var p = dateKey.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  function prettyDate(dateKey) {
    var m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var p = dateKey.split('-').map(Number);
    return p[2] + ' ' + m[p[1] - 1];
  }

  /* ----- formato y datos ----- */
  function money(n) { return '$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function parseMoney(s) { var n = parseInt(String(s).replace(/\D/g, ''), 10); return isFinite(n) ? n : 0; }
  function sanitizeName(s) {
    return String(s || '').replace(/[\u0000-\u001f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  }
  function newRoomCode(rng) {
    var s = ''; for (var i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    return s;
  }
  function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
  function avgError(guesses, items) {
    if (!guesses || !guesses.length) return null;
    var sum = 0;
    for (var i = 0; i < guesses.length; i++) sum += Math.abs(guesses[i] / items[i].p - 1);
    return sum / guesses.length;
  }
  function shareGrid(log) {
    return log.map(function (l) { return l.base >= 700 ? '🟩' : l.base >= 350 ? '🟨' : '🟥'; }).join('');
  }

  // Descarta productos mal formados para que una fila rota no rompa la partida.
  function validProducts(list) {
    return (Array.isArray(list) ? list : []).filter(function (p) {
      return p && typeof p.id === 'string' && typeof p.n === 'string' && Array.isArray(p.s) && p.s.length >= 1 &&
        typeof p.p === 'number' && p.p >= MIN && p.p <= MAX;
    });
  }

  return {
    MIN: MIN, MAX: MAX, START: START, MAX_ROUND_POINTS: MAX_ROUND_POINTS,
    clamp: clamp, toPos: toPos, fromPos: fromPos, stepFor: stepFor,
    roundScore: roundScore, multOf: multOf, verdictOf: verdictOf, rankOf: rankOf, tier: tier,
    createGame: createGame,
    hashStr: hashStr, mulberry32: mulberry32, pickIndices: pickIndices, pickItems: pickItems, dailyItems: dailyItems,
    arDateKey: arDateKey, weekStartKey: weekStartKey, prettyDate: prettyDate,
    money: money, parseMoney: parseMoney, sanitizeName: sanitizeName,
    newRoomCode: newRoomCode, normalizeCode: normalizeCode, avgError: avgError, shareGrid: shareGrid,
    validProducts: validProducts
  };
});
