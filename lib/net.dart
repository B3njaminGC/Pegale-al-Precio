// Conexión con Firebase (Realtime Database por REST + inicio de sesión anónimo).
// Sirve para las salas online y el ranking. Si config.dart no tiene los datos de Firebase, queda apagado.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'core.dart';

class NetError implements Exception {
  NetError(this.code, this.message);
  final String code; // offline, auth, denied, http, notfound, disabled
  final String message;
  @override
  String toString() => message;
}

int _int(dynamic v) => v is num ? v.toInt() : 0;

class RoomPlayer {
  RoomPlayer({
    required this.uid,
    required this.name,
    required this.round,
    required this.done,
    required this.score,
    required this.t,
    this.picks,
  });

  final String uid;
  final String name;
  final int round;
  final bool done;
  final int score;
  final int t;
  final List<int>? picks;
}

class Room {
  Room({required this.code, required this.items, required this.players});
  final String code;
  final List<Product> items;
  final List<RoomPlayer> players;
}

class RankRow {
  RankRow({required this.uid, required this.name, required this.score, required this.t, required this.days});
  final String uid;
  final String name;
  final int score;
  final int t;
  final int days;
}

class RankResult {
  RankResult(this.rows, this.me);
  final List<RankRow> rows;
  final String me;
}

class Net {
  Net({required this.apiKey, required String databaseUrl, required this.prefs})
      : dbUrl = databaseUrl.replaceAll(RegExp(r'/+$'), '') {
    _loadSession();
  }

  final String apiKey;
  final String dbUrl;
  final SharedPreferences prefs;
  final http.Client _client = http.Client();
  final math.Random _random = math.Random();

  String? _uid;
  String? _refreshToken;
  String? _idToken;
  int _expiresAt = 0;
  Future<void>? _pending;

  bool get enabled => apiKey.isNotEmpty && dbUrl.isNotEmpty;
  String? get uid => _uid;

  int _now() => DateTime.now().millisecondsSinceEpoch;

  void _loadSession() {
    try {
      final raw = prefs.getString('pap.fb');
      if (raw == null) return;
      final j = jsonDecode(raw);
      if (j is Map && j['uid'] is String && j['refreshToken'] is String) {
        _uid = j['uid'] as String;
        _refreshToken = j['refreshToken'] as String;
      }
    } catch (_) {}
  }

  Future<void> _saveSession() async {
    await prefs.setString('pap.fb', jsonEncode({'uid': _uid, 'refreshToken': _refreshToken}));
  }

  Future<http.Response> _send(Future<http.Response> Function() f) async {
    try {
      return await f().timeout(const Duration(seconds: 9));
    } catch (_) {
      throw NetError('offline', 'Sin conexión con el servidor');
    }
  }

  Future<void> _signUp() async {
    final url = Uri.parse(
        'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${Uri.encodeQueryComponent(apiKey)}');
    final r = await _send(() => _client.post(url,
        headers: {'content-type': 'application/json'}, body: jsonEncode({'returnSecureToken': true})));
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw NetError('auth', 'No se pudo iniciar sesión (${r.statusCode})');
    }
    final j = jsonDecode(r.body) as Map;
    _uid = j['localId'] as String;
    _refreshToken = j['refreshToken'] as String;
    await _saveSession();
    _idToken = j['idToken'] as String;
    _expiresAt = _now() + (int.tryParse('${j['expiresIn']}') ?? 3600) * 1000 - 60000;
  }

  Future<void> _refresh() async {
    final url = Uri.parse('https://securetoken.googleapis.com/v1/token?key=${Uri.encodeQueryComponent(apiKey)}');
    final r = await _send(
        () => _client.post(url, body: {'grant_type': 'refresh_token', 'refresh_token': _refreshToken ?? ''}));
    if (r.statusCode == 400 || r.statusCode == 401) {
      // la sesión guardada ya no vale
      _uid = null;
      _refreshToken = null;
      await _signUp();
      return;
    }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw NetError('auth', 'No se pudo renovar la sesión (${r.statusCode})');
    }
    final j = jsonDecode(r.body) as Map;
    _uid = j['user_id'] as String;
    _refreshToken = (j['refresh_token'] as String?) ?? _refreshToken;
    await _saveSession();
    _idToken = j['id_token'] as String;
    _expiresAt = _now() + (int.tryParse('${j['expires_in']}') ?? 3600) * 1000 - 60000;
  }

  Future<String> ensureAuth({bool force = false}) async {
    if (!enabled) throw NetError('disabled', 'Online no está activado');
    if (!force && _idToken != null && _uid != null && _now() < _expiresAt) return _uid!;
    var p = _pending;
    if (p == null) {
      p = (_refreshToken != null ? _refresh() : _signUp());
      _pending = p;
      p.then((_) => _pending = null, onError: (Object _) => _pending = null);
    }
    await p;
    return _uid!;
  }

  /* ----- base de datos ----- */

  Future<dynamic> _req(String method, String path, {Object? body, String? query, bool retried = false}) async {
    await ensureAuth(force: retried);
    final url = Uri.parse(
        '$dbUrl/$path.json?auth=${Uri.encodeQueryComponent(_idToken ?? '')}${query != null ? '&$query' : ''}');
    final headers = {'content-type': 'application/json'};
    final enc = body == null ? null : jsonEncode(body);
    final r = await _send(() {
      if (method == 'PUT') return _client.put(url, headers: headers, body: enc);
      if (method == 'PATCH') return _client.patch(url, headers: headers, body: enc);
      return _client.get(url);
    });
    if (r.statusCode == 401 && !retried) {
      return _req(method, path, body: body, query: query, retried: true); // token vencido: se renueva una vez
    }
    if (r.statusCode == 401 || r.statusCode == 403) {
      throw NetError('denied', 'El servidor no permitió la operación');
    }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw NetError('http', 'Error del servidor (${r.statusCode})');
    }
    return r.body.isEmpty ? null : jsonDecode(r.body);
  }

  /* ----- salas ----- */

  Future<String> createRoom(List<Product> items, String name) async {
    for (var attempt = 0; attempt < 5; attempt++) {
      final code = newRoomCode(_random.nextDouble);
      final uid = await ensureAuth();
      final meta = {
        'n': items.length,
        't': _now(),
        'owner': uid,
        'items': items.map((e) => e.toRoomJson()).toList(),
      };
      try {
        await _req('PUT', 'rooms/$code/meta', body: meta);
      } on NetError catch (e) {
        if (e.code == 'denied') continue; // el código ya existía
        rethrow;
      }
      await _req('PUT', 'rooms/$code/players/$uid',
          body: {'name': name, 'round': 0, 'done': false, 't': _now()});
      return code;
    }
    throw NetError('http', 'No se pudo crear la sala');
  }

  List<dynamic> _asList(dynamic v) {
    if (v is List) return v;
    if (v is Map) {
      final keys = v.keys.map((k) => k.toString()).toList()..sort((a, b) => int.parse(a).compareTo(int.parse(b)));
      return keys.map((k) => v[k]).toList();
    }
    return <dynamic>[];
  }

  Future<Room?> getRoom(String code) async {
    final r = await _req('GET', 'rooms/$code');
    if (r is! Map || r['meta'] is! Map) return null;
    final items = parseProducts(_asList((r['meta'] as Map)['items']));
    final players = <RoomPlayer>[];
    final raw = r['players'];
    if (raw is Map) {
      raw.forEach((uid, p) {
        if (p is! Map) return;
        List<int>? picks;
        if (p['picks'] != null) picks = _asList(p['picks']).map(_int).toList();
        players.add(RoomPlayer(
          uid: uid.toString(),
          name: sanitizeName('${p['name'] ?? ''}'),
          round: _int(p['round']),
          done: p['done'] == true,
          score: _int(p['score']),
          t: _int(p['t']),
          picks: picks,
        ));
      });
    }
    return Room(code: code, items: items, players: players);
  }

  Future<Room> joinRoom(String code, String name) async {
    final room = await getRoom(code);
    if (room == null) throw NetError('notfound', 'No existe una sala con ese código');
    final uid = await ensureAuth();
    if (room.players.any((p) => p.uid == uid)) return room; // ya estaba adentro: no se pisa su avance
    await _req('PUT', 'rooms/$code/players/$uid', body: {'name': name, 'round': 0, 'done': false, 't': _now()});
    return room;
  }

  Future<void> pushProgress(String code, Map<String, dynamic> data) async {
    final uid = await ensureAuth();
    await _req('PATCH', 'rooms/$code/players/$uid', body: {'t': _now(), ...data});
  }

  /* ----- ranking ----- */

  /// 'ok' si quedó guardado, 'exists' si ya había una partida de ese día.
  Future<String> submitDaily(String dateKey, String name, int score) async {
    final uid = await ensureAuth();
    try {
      await _req('PUT', 'daily/$dateKey/$uid', body: {'name': name, 'score': score, 't': _now()});
      return 'ok';
    } on NetError catch (e) {
      if (e.code == 'denied') return 'exists';
      rethrow;
    }
  }

  Future<int> submitWeekly(String weekKey, String dateKey, String name, int score) async {
    final uid = await ensureAuth();
    final cur = await _req('GET', 'weekly/$weekKey/$uid');
    final days = <String, int>{};
    if (cur is Map && cur['days'] is Map) {
      (cur['days'] as Map).forEach((k, v) => days[k.toString()] = _int(v));
    }
    days[dateKey] = score;
    final total = days.values.fold<int>(0, (a, b) => a + b);
    await _req('PUT', 'weekly/$weekKey/$uid', body: {'name': name, 'score': total, 'days': days, 't': _now()});
    return total;
  }

  Future<RankResult> top(String kind, String key, [int n = 50]) async {
    final uid = await ensureAuth();
    final obj = await _req('GET', '$kind/$key', query: 'orderBy=${Uri.encodeQueryComponent('"score"')}&limitToLast=$n');
    final rows = <RankRow>[];
    if (obj is Map) {
      obj.forEach((k, v) {
        if (v is! Map) return;
        rows.add(RankRow(
          uid: k.toString(),
          name: sanitizeName('${v['name'] ?? ''}'),
          score: _int(v['score']),
          t: _int(v['t']),
          days: v['days'] is Map ? (v['days'] as Map).length : 0,
        ));
      });
    }
    rows.sort((a, b) {
      final c = b.score.compareTo(a.score);
      return c != 0 ? c : a.t.compareTo(b.t);
    });
    return RankResult(rows, uid);
  }
}
