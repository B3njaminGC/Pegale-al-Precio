// Estado compartido de la app: productos, apodo, guardado local y conexión online.
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
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
    // Primero lo guardado, o lo que viene dentro de la app: así abre al instante y sin internet.
    if (!_apply(getJson('pap.products'))) {
      try {
        _apply(jsonDecode(await rootBundle.loadString('data/products.json')));
      } catch (_) {}
    }
  }

  bool _apply(dynamic doc) {
    if (doc is! Map) return false;
    final list = parseProducts(doc['items']);
    if (list.length < 8) return false;
    // Si hay suficientes productos con precio y foto reales, se juega solo con esos.
    final live = list.where((p) => p.live).toList();
    products = live.length >= 20 ? live : list;
    updated = '${doc['updated'] ?? ''}';
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
      await setJson('pap.products', doc);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Aplica lo que bajó refreshProducts (se hace entre partidas para no cambiar los productos en medio de una).
  void applyDownloaded() => _apply(getJson('pap.products'));
}

final Env env = Env();
