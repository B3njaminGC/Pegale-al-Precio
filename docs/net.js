/* Conexión con Firebase (Realtime Database por REST + inicio de sesión anónimo).
   Sirve para las salas online y el ranking. Si config.js no tiene los datos de Firebase, queda apagado. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PAP = root.PAP || {}; root.PAP.createNet = api.createNet; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var TIMEOUT_MS = 9000;

  function NetError(code, message) {
    var e = new Error(message); e.code = code; return e;
  }

  /**
   * cfg:  { apiKey, databaseURL, identityUrl?, tokenUrl? }   (las dos últimas son para pruebas)
   * deps: { fetch, storage, now, random }
   */
  function createNet(cfg, deps) {
    cfg = cfg || {};
    deps = deps || {};
    var doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    var now = deps.now || function () { return Date.now(); };
    var random = deps.random || Math.random;
    var store = deps.storage || {
      getItem: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      setItem: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    };

    var dbUrl = String(cfg.databaseURL || '').replace(/\/$/, '');
    var identityUrl = cfg.identityUrl || 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
    var tokenUrl = cfg.tokenUrl || 'https://securetoken.googleapis.com/v1/token';
    var enabled = !!(cfg.apiKey && dbUrl && doFetch);

    var session = readSession();        // { uid, refreshToken }
    var idToken = null, expiresAt = 0, pendingAuth = null;

    function readSession() {
      try { var s = JSON.parse(store.getItem('pap.fb') || 'null'); return s && s.uid && s.refreshToken ? s : null; }
      catch (e) { return null; }
    }
    function saveSession() { store.setItem('pap.fb', JSON.stringify(session)); }

    function timed(url, init) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
      var opts = Object.assign({}, init || {}); if (ctl) opts.signal = ctl.signal;
      return doFetch(url, opts).then(
        function (r) { if (timer) clearTimeout(timer); return r; },
        function (e) { if (timer) clearTimeout(timer); throw NetError('offline', 'Sin conexión con el servidor'); }
      );
    }

    function signUp() {
      return timed(identityUrl + '?key=' + encodeURIComponent(cfg.apiKey), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      }).then(function (r) {
        if (!r.ok) throw NetError('auth', 'No se pudo iniciar sesión (' + r.status + ')');
        return r.json();
      }).then(function (j) {
        session = { uid: j.localId, refreshToken: j.refreshToken }; saveSession();
        idToken = j.idToken; expiresAt = now() + (Number(j.expiresIn) || 3600) * 1000 - 60000;
      });
    }
    function refresh() {
      return timed(tokenUrl + '?key=' + encodeURIComponent(cfg.apiKey), {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken)
      }).then(function (r) {
        if (r.status === 400 || r.status === 401) { session = null; return signUp(); }   // la sesión guardada ya no vale
        if (!r.ok) throw NetError('auth', 'No se pudo renovar la sesión (' + r.status + ')');
        return r.json().then(function (j) {
          session = { uid: j.user_id, refreshToken: j.refresh_token || session.refreshToken }; saveSession();
          idToken = j.id_token; expiresAt = now() + (Number(j.expires_in) || 3600) * 1000 - 60000;
        });
      });
    }
    function ensureAuth(force) {
      if (!enabled) return Promise.reject(NetError('disabled', 'Online no está activado'));
      if (!force && idToken && now() < expiresAt) return Promise.resolve(session.uid);
      if (!pendingAuth) {
        pendingAuth = (session ? refresh() : signUp()).then(function () { pendingAuth = null; return session.uid; },
          function (e) { pendingAuth = null; throw e; });
      }
      return pendingAuth;
    }

    /* ----- base de datos ----- */
    function request(method, path, body, query, retried) {
      return ensureAuth(retried).then(function () {
        var url = dbUrl + '/' + path + '.json?auth=' + encodeURIComponent(idToken) + (query ? '&' + query : '');
        var init = { method: method, headers: {} };
        if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
        return timed(url, init);
      }).then(function (r) {
        if (r.status === 401 && !retried) return request(method, path, body, query, true);   // token vencido: se renueva una vez
        if (r.status === 401 || r.status === 403) throw NetError('denied', 'El servidor no permitió la operación');
        if (!r.ok) throw NetError('http', 'Error del servidor (' + r.status + ')');
        return r.json();
      });
    }
    var db = {
      get: function (p, q) { return request('GET', p, undefined, q); },
      put: function (p, v) { return request('PUT', p, v); },
      patch: function (p, v) { return request('PATCH', p, v); }
    };

    /* ----- salas ----- */
    function randomCode() {
      var s = ''; for (var i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
      return s;
    }
    function createRoom(items, name, rounds) {
      var attempt = 0;
      function tryOnce() {
        var code = randomCode();
        var meta = { n: items.length, t: now(), owner: session && session.uid, items: items.map(slimItem) };
        return ensureAuth().then(function (uid) {
          meta.owner = uid;
          return db.put('rooms/' + code + '/meta', meta);
        }).then(function () {
          return db.put('rooms/' + code + '/players/' + session.uid, { name: name, round: 0, done: false, t: now() });
        }).then(function () { return { code: code }; }, function (e) {
          if (e.code === 'denied' && ++attempt < 5) return tryOnce();   // el código ya existía
          throw e;
        });
      }
      return tryOnce();
    }
    function slimItem(it) {
      var o = { id: it.id, n: it.n, c: it.c || '', s: it.s, p: it.p };
      if (it.img) o.img = it.img;
      if (it.link) o.link = it.link;
      return o;
    }
    function getRoom(code) {
      return db.get('rooms/' + code).then(function (r) {
        if (!r || !r.meta) return null;
        var items = r.meta.items; if (!Array.isArray(items)) items = Object.keys(items || {}).sort(function (a, b) { return a - b; }).map(function (k) { return items[k]; });
        var players = Object.keys(r.players || {}).map(function (uid) {
          var p = r.players[uid];
          var picks = p.picks; if (picks && !Array.isArray(picks)) picks = Object.keys(picks).sort(function (a, b) { return a - b; }).map(function (k) { return picks[k]; });
          return Object.assign({ uid: uid }, p, { picks: picks || null });
        });
        return { code: code, meta: Object.assign({}, r.meta, { items: items }), items: items, players: players };
      });
    }
    function joinRoom(code, name) {
      return getRoom(code).then(function (room) {
        if (!room) throw NetError('notfound', 'No existe una sala con ese código');
        return ensureAuth().then(function (uid) {
          var me = room.players.filter(function (p) { return p.uid === uid; })[0];
          if (me) return room;                                 // ya estaba adentro: no se pisa su avance
          return db.put('rooms/' + code + '/players/' + uid, { name: name, round: 0, done: false, t: now() }).then(function () { return room; });
        });
      });
    }
    function pushProgress(code, data) {
      return ensureAuth().then(function (uid) {
        return db.patch('rooms/' + code + '/players/' + uid, Object.assign({ t: now() }, data));
      });
    }

    /* ----- ranking ----- */
    function submitDaily(dateKey, name, score) {
      return ensureAuth().then(function (uid) {
        return db.put('daily/' + dateKey + '/' + uid, { name: name, score: score, t: now() })
          .then(function () { return { status: 'ok' }; }, function (e) {
            if (e.code === 'denied') return { status: 'exists' };          // ya había una partida de ese día
            throw e;
          });
      });
    }
    function submitWeekly(weekKey, dateKey, name, score) {
      return ensureAuth().then(function (uid) {
        return db.get('weekly/' + weekKey + '/' + uid).then(function (cur) {
          var days = Object.assign({}, cur && cur.days);
          days[dateKey] = score;
          var total = Object.keys(days).reduce(function (a, k) { return a + days[k]; }, 0);
          return db.put('weekly/' + weekKey + '/' + uid, { name: name, score: total, days: days, t: now() }).then(function () { return total; });
        });
      });
    }
    function top(kind, key, n) {
      return ensureAuth().then(function (uid) {
        return db.get(kind + '/' + key, 'orderBy=' + encodeURIComponent('"score"') + '&limitToLast=' + (n || 50)).then(function (obj) {
          var rows = Object.keys(obj || {}).map(function (k) { return Object.assign({ uid: k }, obj[k]); });
          rows.sort(function (a, b) { return b.score - a.score || a.t - b.t; });
          return { rows: rows, me: uid };
        });
      });
    }

    return {
      enabled: function () { return enabled; },
      uid: function () { return session && session.uid; },
      ensureAuth: ensureAuth,
      db: db,
      createRoom: createRoom, getRoom: getRoom, joinRoom: joinRoom, pushProgress: pushProgress,
      submitDaily: submitDaily, submitWeekly: submitWeekly, top: top
    };
  }

  return { createNet: createNet };
});
