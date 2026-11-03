// Estado compartido de la app: productos, apodo, guardado local y conexión online.
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'core.dart';
import 'net.dart';

class Env {
  late SharedPreferences prefs;
  late Net net;
  List<Product> products = <Product>[];
  String updated = '';
  String source = '';
  String name = '';

  /// Plan de desafíos diarios armado por el servidor: fecha -> ids. Así todos juegan lo mismo y no se repite.
  Map<String, List<String>> plan = <String, List<String>>{};

  /// Productos que ya viste (en cualquier modo). Las partidas nuevas eligen entre los que no viste.
  Set<String> seen = <String>{};
  File? _cache;

  /// Etiqueta de la versión nueva (por ejemplo v2.5.0) si hay una más reciente que esta app y todavía no la descartó.
  String? newerVersion;

  /* ----- guardado local ----- */

  dynamic getJson(String key) {
    final s = prefs.getString(key);
    if (s == null) return null;
    try {
      return jsonDecode(s);
    } catch (_) {
      return null;
    }
  }

  Future<void> setJson(String key, Object value) async {
    await prefs.setString(key, jsonEncode(value));
  }

  Future<void> setName(String n) async {
    name = n;
    await prefs.setString('pap.name', n);
  }

  /* ----- arranque ----- */

  Future<void> init() async {
    prefs = await SharedPreferences.getInstance();
    net = Net(apiKey: kFirebaseApiKey, databaseUrl: kFirebaseDatabaseUrl, prefs: prefs);
    name = prefs.getString('pap.name') ?? '';
    seen = (prefs.getStringList('pap.seen') ?? const <String>[]).toSet();
    try {
      final dir = await getApplicationSupportDirectory();
      _cache = File('${dir.path}/products.json');
    } catch (_) {}
    // Primero lo guardado, o lo que viene dentro de la app: así abre al instante y sin internet.
    if (!_apply(_readCache())) {
      try {
        _apply(jsonDecode(await rootBundle.loadString('data/products.json')));
      } catch (_) {}
    }
    // la versión vieja guardaba los productos en las preferencias: se libera ese espacio
    if (prefs.containsKey('pap.products')) await prefs.remove('pap.products');
  }

  dynamic _readCache() {
    try {
      final f = _cache;
      if (f == null || !f.existsSync()) return null;
      return jsonDecode(f.readAsStringSync());
    } catch (_) {
      return null;
    }
  }

  /* ----- productos que no se repiten ----- */

  Future<void> markSeen(Iterable<String> ids) async {
    seen.addAll(ids);
    // si ya viste casi todo, se empieza de nuevo
    if (seen.length > products.length) seen = ids.toSet();
    await prefs.setStringList('pap.seen', seen.toList());
  }

  /// Productos para una partida rápida o una sala: ninguno de los que ya viste.
  List<Product> pickFreshItems(int n, [double Function()? rng]) {
    final r = rng ?? math.Random().nextDouble;
    final unseen = products.where((p) => !seen.contains(p.id)).length;
    if (unseen < n) seen = <String>{};
    return pickFresh(products, math.min(n, products.length), seen, r);
  }

  /// Los 5 del día: los del plan del servidor, y si todavía no llegó, los que salen de la fecha.
  List<Product> dailyFor(String key) {
    final ids = plan[key];
    if (ids != null && ids.length >= 5) {
      final byId = <String, Product>{for (final p in products) p.id: p};
      final list = ids.map((id) => byId[id]).whereType<Product>().toList();
      if (list.length == ids.length) return list;
    }
    return dailyItems(products, key, 5);
  }

  bool _apply(dynamic doc) {
    if (doc is! Map) return false;
    final list = parseProducts(doc['items']);
    if (list.length < 8) return false;
    // Si hay suficientes productos con precio y foto reales, se juega solo con esos.
    final live = list.where((p) => p.live).toList();
    products = live.length >= 20 ? live : list;
    updated = '${doc['updated'] ?? ''}';
    final d = doc['daily'];
    final next = <String, List<String>>{};
    if (d is Map) {
      d.forEach((k, v) {
        if (k is String && v is List) next[k] = v.map((e) => '$e').toList();
      });
    }
    plan = next;
    source = '${doc['source'] ?? ''}';
    return true;
  }

  /// Baja los productos del día. Devuelve true si hay algo más nuevo para mostrar.
  Future<bool> refreshProducts() async {
    try {
      final r = await http.get(Uri.parse(kProductsUrl)).timeout(const Duration(seconds: 8));
      if (r.statusCode != 200) return false;
      final doc = jsonDecode(r.body);
      if (doc is! Map) return false;
      final newer = '${doc['updated'] ?? ''}'.compareTo(updated) > 0;
      if (!newer) return false;
      final ok = parseProducts(doc['items']).length >= 8;
      if (!ok) return false;
      final f = _cache;
      if (f == null) return false;
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(r.body);
      await tmp.rename(f.path);
      return true;
    } catch (_) {
      return false;
    }
  }

  static List<int>? _parseVersion(String v) {
    final m = RegExp(r'^v(\d+)\.(\d+)\.(\d+)$').firstMatch(v.trim());
    return m == null ? null : [for (var i = 1; i <= 3; i++) int.parse(m.group(i)!)];
  }

  /// Mira cuál es la última versión publicada. Las compilaciones de prueba (sin número de versión) no avisan.
  Future<void> checkUpdate() async {
    try {
      final mine = _parseVersion(kVersion);
      if (mine == null) return;
      final r = await http
          .get(Uri.parse(kLatestUrl), headers: {'accept': 'application/vnd.github+json'})
          .timeout(const Duration(seconds: 8));
      if (r.statusCode != 200) return;
      final doc = jsonDecode(r.body);
      final tag = doc is Map ? '${doc['tag_name'] ?? ''}' : '';
      final theirs = _parseVersion(tag);
      if (theirs == null) return;
      var newer = false;
      for (var i = 0; i < 3; i++) {
        if (theirs[i] != mine[i]) {
          newer = theirs[i] > mine[i];
          break;
        }
      }
      newerVersion = newer && prefs.getString('pap.upd.dismissed') != tag ? tag : null;
    } catch (_) {}
  }

  Future<void> dismissUpdate() async {
    final t = newerVersion;
    newerVersion = null;
    if (t != null) await prefs.setString('pap.upd.dismissed', t);
  }

  /// Aplica lo que bajó refreshProducts (se hace entre partidas para no cambiar los productos en medio de una).
  void applyDownloaded() => _apply(_readCache());
}

final Env env = Env();
