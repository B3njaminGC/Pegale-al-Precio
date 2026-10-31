/* Pantallas y flujo del juego. La lógica de puntaje está en core.js y la conexión online en net.js. */
(function () {
  'use strict';

  var core = window.PAP.core;
  var cfg = window.PAP_CONFIG || {};
  var net = window.PAP.createNet(cfg.firebase || {}, {});
  var $ = function (id) { return document.getElementById(id); };
  var money = core.money;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function pct(x) { return Math.round(Math.abs(x) * 100) + '%'; }
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function copyText(text) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  // Los links y fotos de una sala los arma otro jugador: solo se aceptan los de Mercado Libre.
  function safeUrl(u, hostRe) {
    try { var x = new URL(u); return x.protocol === 'https:' && hostRe.test(x.hostname) ? x.href : ''; } catch (e) { return ''; }
  }
  var safeLink = function (u) { return safeUrl(u, /(^|\.)mercadolibre\.com(\.ar)?$/); };
  var safeImg = function (u) { return safeUrl(u, /(^|\.)mlstatic\.com$/); };
  function searchUrl(it) {
    var slug = String(it.n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'https://listado.mercadolibre.com.ar/' + slug;
  }
  function siteBase() { return cfg.siteUrl || (location.origin + location.pathname); }

  /* ---------- estado ---------- */
  var S = {
    products: [], meta: null, current: 'home',
    game: null, mode: null, practice: false, roomCode: null, roomData: null, roomRounds: 8,
    name: ls.get('pap.name', ''), quitArmed: false, quitTimer: null, poll: null, rankKind: 'daily', price: core.START
  };
  var SCREENS = ['home', 'play', 'end', 'rooms', 'room', 'rank'];

  function show(name) {
    S.current = name;
    SCREENS.forEach(function (n) { $('s-' + n).hidden = n !== name; });
    if (name !== 'room') stopPolling();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  /* ---------- productos ---------- */
  function fetchJSON(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetch(url, ctl ? { signal: ctl.signal, cache: 'no-cache' } : { cache: 'no-cache' }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function applyProducts(doc, persist) {
    var list = core.validProducts(doc && doc.items);
    if (list.length < 8) return false;
    list.forEach(function (p) { p.img = safeImg(p.img) || undefined; p.link = safeLink(p.link) || undefined; });
    S.products = list;
    S.meta = { updated: doc.updated || '', source: doc.source || '' };
    if (persist) ls.set('pap.products', doc);
    return true;
  }
  function loadProducts() {
    var local = new URL('products.json', location.href).href;
    return fetchJSON(local, 6000).then(function (doc) {
      if (!applyProducts(doc, true)) throw new Error('productos inválidos');
    }).catch(function () {
      if (!applyProducts(ls.get('pap.products', null), false)) throw new Error('sin productos');
    }).then(function () {
      if (cfg.productsUrl && cfg.productsUrl !== local) {
        fetchJSON(cfg.productsUrl, 7000).then(function (doc) {
          if (doc && String(doc.updated) > String(S.meta.updated)) {
            var wasIdle = !S.game;
            if (wasIdle && applyProducts(doc, true)) renderHome();
            else if (!wasIdle) ls.set('pap.products', doc);
          }
        }).catch(function () {});
      }
    });
  }

  /* ---------- foto ---------- */
  function plateInner(it) {
    var ph = '<div class="ph"><b>' + esc(it.c || 'Producto') + '</b><small>Foto no disponible</small></div>';
    var img = it.img ? '<img src="' + esc(it.img) + '" alt="" decoding="async" referrerpolicy="no-referrer">' : '';
    return img + ph;
  }
  function plateHTML(it, cls) {
    return '<div class="plate ' + (cls || '') + (it.img ? '' : ' noimg') + '">' + plateInner(it) + '</div>';
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG') { var p = t.closest('.plate'); if (p) p.classList.add('noimg'); }
  }, true);

  /* ---------- inicio ---------- */
  function fineText() {
    var m = S.meta || {};
    var d = m.updated ? core.prettyDate(core.arDateKey(new Date(m.updated))) : '';
    if (m.source === 'api.mercadolibre.com') {
      return 'Precios de publicaciones reales de Mercado Libre Argentina, actualizados el ' + d + '. Juego independiente, sin relación con Mercado Libre.';
    }
    return 'Precios de referencia estimados' + (d ? ' al ' + d : '') + '. Juego independiente, sin relación con Mercado Libre.';
  }
  function renderHome() {
    var key = core.arDateKey();
    $('h-date').textContent = '· ' + core.prettyDate(key);
    $('h-sheet').innerHTML = core.dailyItems(S.products, key, 5).slice(0, 3).map(function (it) { return plateHTML(it, 'sm'); }).join('');
    var rec = ls.get('pap.daily.' + key, null);
    $('h-daily-meta').textContent = rec
      ? 'Hoy hiciste ' + num(rec.score) + ' puntos. Podés volver a jugar de práctica.'
      : 'En el ranking cuenta tu primera partida del día.';
    $('h-fine').textContent = fineText();
  }
  function goHome() {
    S.game = null; S.mode = null;
    renderHome(); show('home');
  }

  /* ---------- partida ---------- */
  function startGame(mode, items, opts) {
    opts = opts || {};
    S.mode = mode; S.practice = !!opts.practice; S.roomCode = opts.roomCode || null;
    S.game = core.createGame({ mode: mode, items: items, saved: opts.saved });
    disarmQuit();
    show('play');
    renderRound();
  }
  function startDaily() {
    var key = core.arDateKey();
    startGame('daily', core.dailyItems(S.products, key, 5), { practice: !!ls.get('pap.daily.' + key, null) });
  }
  function startQuick() {
    startGame('quick', core.pickItems(S.products, Math.min(8, S.products.length), Math.random));
  }

  function paintFill() { $('slider').style.setProperty('--fill', ($('slider').value / 10) + '%'); }
  function setPrice(v, typing) {
    S.price = core.clamp(Math.round(v));
    $('slider').value = Math.round(core.toPos(S.price) * 1000);
    paintFill();
    if (!typing) $('amt').value = num(S.price);
  }

  function renderRound() {
    var g = S.game, st = g.state, it = g.current();
    var seg = '';
    for (var i = 0; i < st.items.length; i++) seg += '<i class="' + (i < st.round ? 'done' : i === st.round ? 'now' : '') + '"></i>';
    $('p-seg').innerHTML = seg;
    $('p-score').textContent = num(st.total);
    $('p-lot').textContent = 'Producto ' + (st.round + 1) + ' de ' + st.items.length;
    var sk = $('p-streak');
    if (st.streak > 0) { sk.hidden = false; sk.textContent = 'Racha ' + st.streak + ' · ×' + core.multOf(st.streak).toFixed(1).replace('.', ','); }
    else sk.hidden = true;
    var plate = $('p-plate');
    plate.className = 'plate' + (it.img ? '' : ' noimg');
    plate.innerHTML = plateInner(it);
    $('p-cat').textContent = it.c || '';
    $('p-name').textContent = it.n;
    $('p-specs').innerHTML = it.s.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('p-guess').hidden = false;
    $('p-reveal').hidden = true;
    setPrice(core.START);
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  function lockPrice() {
    var g = S.game; if (!g || g.done()) return;
    setPrice(S.price);
    var it = g.current();
    var entry = g.guess(S.price);
    if (S.mode === 'room' && S.roomCode) {
      ls.set('pap.room.' + S.roomCode, g.snapshot());
      net.pushProgress(S.roomCode, { round: g.state.round }).catch(function () {});
    }
    renderReveal(entry, it);
  }

  function countUp(el, to, ms) {
    if (reduceMotion) { el.textContent = money(to); return; }
    var t0 = performance.now();
    (function frame(t) {
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(to * e);
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
  }
  function labelShift(pos) { return pos < 14 ? '-12%' : pos > 86 ? '-88%' : '-50%'; }
  function trackHTML(real, guess) {
    var rp = core.toPos(real) * 100, gp = core.toPos(guess) * 100;
    var h = '<div class="rail"><div class="base"></div>' +
      '<div class="gap" style="left:' + Math.min(rp, gp) + '%;width:' + Math.abs(rp - gp) + '%"></div>' +
      '<div class="mk real" style="left:' + rp + '%"><span class="lbl" style="transform:translateX(' + labelShift(rp) + ')">' + esc(money(real)) + '</span><i class="stem"></i></div>' +
      '<div class="mk you" style="left:' + gp + '%"><i class="dot"></i><span class="lbl" style="transform:translateX(' + labelShift(gp) + ')">Tu precio</span></div></div>' +
      '<div class="ticks">';
    [[10000, '10 mil'], [100000, '100 mil'], [1000000, '1 millón'], [5000000, '5 mill.']].forEach(function (t) {
      h += '<span style="left:' + core.toPos(t[0]) * 100 + '%;transform:translateX(' + labelShift(core.toPos(t[0]) * 100) + ')">' + t[1] + '</span>';
    });
    return h + '</div>';
  }
  function linkFor(it) { return safeLink(it.link) || searchUrl(it); }

  function renderReveal(entry, it) {
    var g = S.game, st = g.state;
    var tier = core.tier(entry.base);
    $('p-guess').hidden = true;
    var rv = $('p-reveal'); rv.hidden = false;
    rv.querySelector('.rv-head').className = 'rv-head ' + tier;
    $('r-verdict').textContent = core.verdictOf({ base: entry.base, bonus: entry.bonus });
    $('r-pts').textContent = '+' + num(entry.pts);
    var br = ['Base ' + num(entry.base)];
    if (entry.bonus) br.push('Exacto +' + entry.bonus);
    if (entry.mult > 1) br.push('Racha ×' + entry.mult.toFixed(1).replace('.', ','));
    $('r-break').textContent = br.join(' · ');
    var live = it.src === 'ml';
    $('r-src').textContent = live ? 'Precio en Mercado Libre' : 'Precio de referencia';
    countUp($('r-real'), it.p, 650);
    $('r-track').innerHTML = trackHTML(it.p, entry.guess);
    $('r-yours').textContent = money(entry.guess);
    var d = Math.abs(entry.err) < 0.005 ? 'Clavaste el precio' : pct(entry.err) + (entry.err > 0 ? ' más caro' : ' más barato');
    $('r-delta').textContent = d;
    var a = $('r-link'); a.href = linkFor(it);
    a.textContent = safeLink(it.link) ? 'Ver publicación en Mercado Libre' : 'Buscar en Mercado Libre';
    $('r-next').textContent = g.done() ? 'Ver resultado' : 'Siguiente producto';
    $('p-score').textContent = num(st.total);
    var sk = $('p-streak');
    if (st.streak > 0) { sk.hidden = false; sk.textContent = 'Racha ' + st.streak + ' · ×' + core.multOf(st.streak).toFixed(1).replace('.', ','); } else sk.hidden = true;
    var seg = $('p-seg').children; if (seg[st.round - 1]) seg[st.round - 1].className = 'done';
    rv.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    $('r-next').focus({ preventScroll: true });
  }

  function nextStep() {
    var g = S.game; if (!g) return;
    if (!g.done()) { renderRound(); return; }
    if (S.mode === 'room') finishRoom();
    else { renderEnd(); show('end'); }
  }

  /* quitar con doble toque para no perder una partida por error */
  function disarmQuit() { S.quitArmed = false; clearTimeout(S.quitTimer); $('p-quit').textContent = 'Salir'; }
  function armQuit() {
    if (S.quitArmed) {
      disarmQuit();
      if (S.mode === 'room' && S.roomCode) { var c = S.roomCode; S.game = null; openRoom(c); } else goHome();
      return;
    }
    S.quitArmed = true; $('p-quit').textContent = 'Tocá de nuevo';
    S.quitTimer = setTimeout(disarmQuit, 2500);
  }

  /* ---------- resultado (desafío y partida rápida) ---------- */
  function shareText() {
    var st = S.game.state, label = S.mode === 'daily' ? 'Desafío del ' + core.prettyDate(core.arDateKey()) : 'Partida rápida';
    return 'Pegale al Precio · ' + label + '\n' + num(st.total) + ' puntos · ' + core.rankOf(st.base / st.items.length) + '\n' + core.shareGrid(st.log) + '\n' + siteBase();
  }
  function renderEnd() {
    var st = S.game.state, daily = S.mode === 'daily';
    $('e-kicker').textContent = daily ? 'Desafío del ' + core.prettyDate(core.arDateKey()) : 'Partida rápida';
    $('e-rank').textContent = core.rankOf(st.base / st.items.length);
    $('e-score').textContent = num(st.total);
    var note = '';
    if (!daily) {
      var best = ls.get('pap.best', 0);
      if (st.total > best) { ls.set('pap.best', st.total); note = best ? 'Nuevo récord personal' : 'Primer récord guardado'; }
      else note = 'Tu récord: ' + num(best) + ' puntos';
    } else if (S.practice) {
      note = 'Partida de práctica. En el ranking cuenta tu primera partida del día.';
    } else {
      ls.set('pap.daily.' + core.arDateKey(), { score: st.total, base: st.base, grid: core.shareGrid(st.log) });
    }
    $('e-note').textContent = note;
    $('e-recap').innerHTML = st.log.map(function (l, i) {
      var it = st.items[i];
      return '<li>' + plateHTML(it, 'sm') + '<div class="rn"><b>' + esc(it.n) + '</b><small>Vos ' + esc(money(l.guess)) + ' · real ' + esc(money(l.real)) + '</small>' +
        '<small><a href="' + esc(linkFor(it)) + '" target="_blank" rel="noopener noreferrer">Ver en Mercado Libre</a></small></div>' +
        '<span class="rp ' + core.tier(l.base) + '">+' + num(l.pts) + '</span></li>';
    }).join('');
    $('e-again').textContent = daily ? 'Jugar una partida rápida' : 'Jugar de nuevo';
    $('e-share').textContent = 'Copiar resultado';
    renderBoard();
  }

  function setBoard(html) { var b = $('e-board'); b.hidden = !html; b.innerHTML = html || ''; }
  function renderBoard() {
    if (S.mode !== 'daily' || S.practice || !net.enabled()) { setBoard(''); return; }
    var key = core.arDateKey(), rec = ls.get('pap.daily.' + key, null);
    if (!rec) { setBoard(''); return; }
    if (rec.submitted) {
      var where = rec.status === 'exists' ? 'Ya tenías un resultado de hoy en el ranking.'
        : rec.rank ? 'Quedaste <strong>puesto ' + rec.rank + '</strong> de ' + rec.of + (rec.of >= 50 ? '+' : '') + ' jugadores de hoy.'
        : 'Entraste al ranking de hoy, fuera del top 50.';
      setBoard('<p class="k">Ranking Argentina</p><p>' + where + '</p><button class="btn secondary sm" type="button" data-act="rank">Ver el ranking</button>');
      return;
    }
    if (!S.name) {
      setBoard('<p class="k">Ranking Argentina</p><p>Poné un apodo para que tu resultado entre al ranking de hoy.</p>' +
        '<input class="text" id="b-name" type="text" maxlength="14" placeholder="Tu apodo" autocomplete="nickname" aria-label="Tu apodo">' +
        '<button class="btn primary" type="button" data-act="submit">Entrar al ranking</button>');
      return;
    }
    submitDaily();
  }
  function submitDaily() {
    var key = core.arDateKey(), rec = ls.get('pap.daily.' + key, null);
    if (!rec || !S.name) return;
    setBoard('<p class="k">Ranking Argentina</p><p>Enviando tu resultado…</p>');
    net.submitDaily(key, S.name, rec.score).then(function (r) {
      if (r.status !== 'ok') return r;
      return net.submitWeekly(core.weekStartKey(key), key, S.name, rec.score).catch(function () {}).then(function () { return r; });
    }).then(function (r) {
      return net.top('daily', key, 50).then(function (t) {
        var idx = -1; t.rows.forEach(function (row, i) { if (row.uid === t.me) idx = i; });
        rec.submitted = true; rec.status = r.status; rec.rank = idx >= 0 ? idx + 1 : null; rec.of = t.rows.length;
        ls.set('pap.daily.' + key, rec);
        if (S.current === 'end') renderBoard();
      });
    }).catch(function () {
      if (S.current === 'end') setBoard('<p class="k">Ranking Argentina</p><p>No se pudo enviar tu resultado. Revisá tu conexión.</p><button class="btn secondary sm" type="button" data-act="submit">Reintentar</button>');
    });
  }
  $('e-board').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'rank') openRank();
    if (b.dataset.act === 'submit') {
      var inp = $('b-name');
      if (inp) {
        var n = core.sanitizeName(inp.value);
        if (!n) { inp.focus(); toast('Escribí un apodo'); return; }
        S.name = n; ls.set('pap.name', n);
      }
      submitDaily();
    }
  });

  /* ---------- salas ---------- */
  function openRooms(prefillCode) {
    show('rooms');
    var on = net.enabled();
    $('rs-off').hidden = on;
    ['rs-create', 'rs-join', 'rs-name', 'rs-code'].forEach(function (id) { $(id).disabled = !on; });
    $('rs-name').value = S.name || '';
    if (prefillCode) $('rs-code').value = prefillCode;
    $('rs-err').hidden = true;
  }
  function roomError(msg) { var e = $('rs-err'); e.textContent = msg; e.hidden = !msg; }
  function needName() {
    var n = core.sanitizeName($('rs-name').value);
    if (!n) { roomError('Escribí tu apodo para que los demás te reconozcan.'); $('rs-name').focus(); return null; }
    S.name = n; ls.set('pap.name', n); return n;
  }
  function errText(e) {
    if (e && e.code === 'offline') return 'No hay conexión con el servidor. Probá de nuevo en un momento.';
    if (e && e.code === 'notfound') return 'No existe una sala con ese código. Revisalo con quien te invitó.';
    if (e && e.code === 'denied') return 'El servidor no aceptó la operación.';
    return 'Algo salió mal. Probá de nuevo.';
  }
  function createRoom() {
    roomError(''); var name = needName(); if (!name) return;
    var btn = $('rs-create'); btn.disabled = true; btn.textContent = 'Creando…';
    var items = core.pickItems(S.products, Math.min(S.roomRounds, S.products.length), Math.random);
    net.createRoom(items, name).then(function (r) { openRoom(r.code); }, function (e) { roomError(errText(e)); })
      .then(function () { btn.disabled = !net.enabled(); btn.textContent = 'Crear sala'; });
  }
  function joinRoom() {
    roomError(''); var name = needName(); if (!name) return;
    var code = core.normalizeCode($('rs-code').value);
    if (code.length !== 6) { roomError('El código tiene 6 letras y números.'); $('rs-code').focus(); return; }
    var btn = $('rs-join'); btn.disabled = true; btn.textContent = 'Entrando…';
    net.joinRoom(code, name).then(function () { openRoom(code); }, function (e) { roomError(errText(e)); })
      .then(function () { btn.disabled = !net.enabled(); btn.textContent = 'Entrar a la sala'; });
  }

  function openRoom(code) {
    S.roomCode = code; S.roomData = null;
    $('rm-code').textContent = code;
    $('rm-cta').innerHTML = ''; $('rm-table').innerHTML = '<li class="empty">Cargando la sala…</li>';
    $('rm-count').textContent = ''; $('rm-note').textContent = ''; $('rm-err').hidden = true;
    show('room');
    refreshRoom();
    stopPolling();
    S.poll = setInterval(function () { if (!document.hidden) refreshRoom(); }, 5000);
  }
  function stopPolling() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }
  function refreshRoom() {
    var code = S.roomCode; if (!code) return;
    net.getRoom(code).then(function (room) {
      if (S.current !== 'room' || S.roomCode !== code) return;
      if (!room) { $('rm-err').textContent = 'Esta sala ya no existe.'; $('rm-err').hidden = false; return; }
      room.items = core.validProducts(room.items).map(function (p) { p.img = safeImg(p.img) || undefined; p.link = safeLink(p.link) || undefined; return p; });
      S.roomData = room; $('rm-err').hidden = true;
      renderRoom();
    }).catch(function (e) {
      if (S.current === 'room') { $('rm-err').textContent = errText(e); $('rm-err').hidden = false; }
    });
  }
  function renderRoom() {
    var room = S.roomData, n = room.items.length, uid = net.uid();
    var me = room.players.filter(function (p) { return p.uid === uid; })[0];
    var local = ls.get('pap.room.' + room.code, null);
    var cta = '';
    if (n === 0) cta = '';
    else if (local && local.round >= n) {
      cta = me && me.done ? '' : '<button class="btn primary" type="button" data-act="send">Enviar mi resultado</button>';
    } else if (local && local.round > 0) {
      cta = '<button class="btn primary" type="button" data-act="play">Seguir jugando · producto ' + (local.round + 1) + ' de ' + n + '</button>';
    } else {
      cta = '<button class="btn primary" type="button" data-act="play">Jugar mis ' + n + ' productos</button>';
    }
    $('rm-cta').innerHTML = cta;

    var done = room.players.filter(function (p) { return p.done; }).sort(function (a, b) { return b.score - a.score || a.t - b.t; });
    var rest = room.players.filter(function (p) { return !p.done; }).sort(function (a, b) { return (b.round || 0) - (a.round || 0) || a.t - b.t; });
    var html = '';
    done.forEach(function (p, i) {
      var err = core.avgError(p.picks, room.items);
      var det = (p.picks || []).map(function (g, k) {
        var it = room.items[k]; if (!it) return '';
        return '<div><span>' + esc(it.n) + '</span><b>' + esc(money(g)) + ' / ' + esc(money(it.p)) + '</b></div>';
      }).join('');
      html += '<li class="' + (p.uid === uid ? 'me ' : '') + (i === 0 ? 'first' : '') + '"><details><summary>' +
        '<span class="pos">' + (i + 1) + '</span><span class="who"><b>' + esc(p.name) + (p.uid === uid ? ' (vos)' : '') + '</b><small>' +
        (err == null ? 'Terminó' : 'Error medio ' + pct(err)) + '</small></span><span class="pts">' + num(p.score || 0) + '</span></summary>' +
        (det ? '<div class="det"><div><span class="k">Producto</span><b class="k">Tu precio / real</b></div>' + det + '</div>' : '') + '</details></li>';
    });
    rest.forEach(function (p) {
      var st = (p.round || 0) > 0 ? 'Jugando · va por el producto ' + Math.min(n, (p.round || 0) + 1) + ' de ' + n : 'Todavía no empezó';
      html += '<li class="' + (p.uid === uid ? 'me' : '') + '"><div class="row"><span class="pos">·</span><span class="who"><b>' + esc(p.name) + (p.uid === uid ? ' (vos)' : '') +
        '</b><small>' + st + '</small></span><span class="pts wait">en juego</span></div></li>';
    });
    $('rm-table').innerHTML = html || '<li class="empty">Todavía no hay jugadores.</li>';
    $('rm-count').textContent = done.length + ' de ' + room.players.length + ' terminaron';
    $('rm-note').textContent = room.players.length < 2
      ? 'Mandá el link o el código para que se sumen. Cada uno juega a su hora y la tabla se actualiza sola.'
      : 'La tabla se actualiza sola. Tocá un resultado para ver cada precio.';
  }
  function playRoom() {
    var room = S.roomData; if (!room || !room.items.length) return;
    var saved = ls.get('pap.room.' + room.code, null);
    if (saved && (saved.log.length !== saved.round || saved.round > room.items.length)) saved = null;
    startGame('room', room.items, { roomCode: room.code, saved: saved });
  }
  function finishRoom() {
    var code = S.roomCode, st = S.game.state;
    var picks = st.log.map(function (l) { return l.guess; });
    S.game = null;
    openRoom(code);
    net.pushProgress(code, { round: st.items.length, done: true, score: st.total, picks: picks }).then(refreshRoom, function () {
      $('rm-err').textContent = 'Tu resultado no se pudo enviar todavía. Tocá "Enviar mi resultado" cuando tengas conexión.'; $('rm-err').hidden = false;
      refreshRoom();
    });
  }
  $('rm-cta').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'play') playRoom();
    if (b.dataset.act === 'send') {
      var local = ls.get('pap.room.' + S.roomCode, null); if (!local) return;
      b.disabled = true;
      net.pushProgress(S.roomCode, { round: local.round, done: true, score: local.total, picks: local.log.map(function (l) { return l.guess; }) })
        .then(function () { $('rm-err').hidden = true; refreshRoom(); }, function (er) { b.disabled = false; $('rm-err').textContent = errText(er); $('rm-err').hidden = false; });
    }
  });
  function roomLink() { return siteBase().replace(/#.*$/, '') + '#sala=' + S.roomCode; }
  function shareRoom() {
    var text = 'Jugá conmigo a Pegale al Precio. Código de la sala: ' + S.roomCode;
    if (navigator.share) {
      navigator.share({ title: 'Pegale al Precio', text: text, url: roomLink() }).catch(function (e) { if (e && e.name !== 'AbortError') copyText(text + '\n' + roomLink()).then(function () { toast('Link copiado'); }); });
    } else copyText(text + '\n' + roomLink()).then(function (ok) { toast(ok ? 'Link copiado' : 'No se pudo copiar'); });
  }

  /* ---------- ranking ---------- */
  function openRank() { show('rank'); setTab(S.rankKind); loadRank(); }
  function setTab(kind) {
    S.rankKind = kind;
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t.dataset.kind === kind; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function loadRank() {
    var kind = S.rankKind, key = core.arDateKey(), wk = core.weekStartKey(key), t = $('rk-table');
    $('rk-lead').textContent = kind === 'daily'
      ? 'Desafío del ' + core.prettyDate(key) + '. Cuenta la primera partida de cada jugador.'
      : 'Suma de los desafíos de la semana que empezó el lunes ' + core.prettyDate(wk) + '.';
    $('rk-err').hidden = true; $('rk-note').textContent = '';
    if (!net.enabled()) { t.innerHTML = '<li class="empty">El ranking todavía no está activado en esta versión.</li>'; return; }
    t.innerHTML = '<li class="empty">Cargando…</li>';
    net.top(kind, kind === 'daily' ? key : wk, 50).then(function (r) {
      if (S.current !== 'rank' || S.rankKind !== kind) return;
      if (!r.rows.length) { t.innerHTML = '<li class="empty">Todavía no jugó nadie. Sé el primero en el ranking.</li>'; return; }
      t.innerHTML = r.rows.map(function (row, i) {
        return '<li class="' + (row.uid === r.me ? 'me ' : '') + (i === 0 ? 'first' : '') + '"><div class="row"><span class="pos">' + (i + 1) + '</span><span class="who"><b>' +
          esc(row.name) + (row.uid === r.me ? ' (vos)' : '') + '</b>' + (kind === 'weekly' && row.days ? '<small>' + Object.keys(row.days).length + ' desafíos</small>' : '') +
          '</span><span class="pts">' + num(row.score) + '</span></div></li>';
      }).join('');
      $('rk-note').textContent = r.rows.length >= 50 ? 'Se muestran los 50 mejores.' : '';
    }).catch(function (e) {
      if (S.current === 'rank') { t.innerHTML = ''; $('rk-err').textContent = errText(e); $('rk-err').hidden = false; }
    });
  }

  /* ---------- navegación y eventos ---------- */
  function goBack() {
    switch (S.current) {
      case 'home': return false;
      case 'play': armQuit(); return true;
      case 'room': openRooms(); return true;
      default: goHome(); return true;
    }
  }
  window.PAP.back = goBack;
  var capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (capApp && capApp.addListener) capApp.addListener('backButton', function () { if (!goBack()) capApp.exitApp(); });

  $('h-daily').addEventListener('click', startDaily);
  $('h-quick').addEventListener('click', startQuick);
  $('h-rooms').addEventListener('click', function () { openRooms(); });
  $('h-rank').addEventListener('click', openRank);
  $('p-quit').addEventListener('click', armQuit);
  $('lock').addEventListener('click', lockPrice);
  $('r-next').addEventListener('click', nextStep);
  $('e-home').addEventListener('click', goHome);
  $('e-again').addEventListener('click', startQuick);
  $('e-share').addEventListener('click', function () {
    copyText(shareText()).then(function (ok) { toast(ok ? 'Resultado copiado' : 'No se pudo copiar'); });
  });
  $('rs-back').addEventListener('click', goHome);
  $('rs-create').addEventListener('click', createRoom);
  $('rs-join').addEventListener('click', joinRoom);
  $('rs-code').addEventListener('input', function (e) { e.target.value = core.normalizeCode(e.target.value); });
  $('rs-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(); });
  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      S.roomRounds = Number(c.dataset.n);
      document.querySelectorAll('.chip').forEach(function (o) { o.classList.toggle('on', o === c); o.setAttribute('aria-checked', o === c ? 'true' : 'false'); });
    });
  });
  $('rm-back').addEventListener('click', function () { openRooms(); });
  $('rm-share').addEventListener('click', shareRoom);
  $('rm-copy').addEventListener('click', function () { copyText(S.roomCode).then(function (ok) { toast(ok ? 'Código copiado' : 'No se pudo copiar'); }); });
  $('rk-back').addEventListener('click', goHome);
  document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { setTab(t.dataset.kind); loadRank(); }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.current === 'room') refreshRoom(); });

  $('slider').addEventListener('input', function () {
    S.price = core.fromPos($('slider').value / 1000); $('amt').value = num(S.price); paintFill();
  });
  $('amt').addEventListener('input', function () {
    var n = core.parseMoney($('amt').value);
    $('amt').value = n ? num(n) : '';
    if (n) setPrice(n, true);
  });
  $('amt').addEventListener('blur', function () { $('amt').value = num(S.price); });
  $('amt').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('amt').blur(); lockPrice(); } });
  document.querySelectorAll('.nudge button').forEach(function (b) {
    b.addEventListener('click', function () { setPrice(S.price * parseFloat(b.dataset.f)); });
  });

  /* ---------- arranque ---------- */
  function handleHash() {
    var m = /^#sala=([A-Za-z0-9]{6})$/.exec(location.hash || '');
    if (!m || !S.products.length) return;
    var code = m[1].toUpperCase();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (!net.enabled()) { openRooms(); return; }
    openRooms(code);
    roomError('Te invitaron a la sala ' + code + '. Poné tu apodo y entrá.');
    $('rs-err').classList.remove('err');
  }
  window.addEventListener('hashchange', handleHash);

  loadProducts().then(function () {
    renderHome();
    show('home');
    handleHash();
  }, function () {
    $('h-error').textContent = 'No se pudieron cargar los productos. Revisá tu conexión y volvé a abrir el juego.';
    $('h-error').hidden = false;
    ['h-daily', 'h-quick', 'h-rooms', 'h-rank'].forEach(function (id) { $(id).disabled = true; });
  });

  setPrice(core.START);
})();
