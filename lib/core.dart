// Lógica del juego sin pantallas: escala de precios, puntaje, azar repetible, fechas de Argentina y códigos de sala.
import 'dart:math' as math;

const int kMin = 10000;
const int kMax = 5000000;
const int kStart = 200000;
const String _codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
final double _lnMin = math.log(kMin.toDouble());
final double _lnSpan = math.log(kMax.toDouble()) - math.log(kMin.toDouble());

/* ----- productos ----- */

String _safeUrl(dynamic u, RegExp hostRe) {
  if (u is! String) return '';
  final uri = Uri.tryParse(u);
  if (uri == null || uri.scheme != 'https' || !hostRe.hasMatch(uri.host)) return '';
  return uri.toString();
}

final RegExp _linkHost = RegExp(r'(^|\.)mercadolibre\.com(\.ar)?$');
final RegExp _imgHost = RegExp(r'(^|\.)mlstatic\.com$');

/// Los links y fotos de una sala los arma otro jugador: solo se aceptan los de Mercado Libre.
String safeLink(dynamic u) => _safeUrl(u, _linkHost);
String safeImg(dynamic u) => _safeUrl(u, _imgHost);

class Product {
  Product({
    required this.id,
    required this.n,
    required this.c,
    required this.s,
    required this.p,
    this.img,
    this.link,
    this.src = 'estimado',
  });

  final String id;
  final String n;
  final String c;
  final List<String> s;
  final int p;
  final String? img;
  final String? link;
  final String src;

  bool get live => src == 'ml';

  /// Devuelve null si la fila está mal formada, para que una fila rota no rompa la partida.
  static Product? tryParse(dynamic j) {
    if (j is! Map) return null;
    final id = j['id'];
    final n = j['n'];
    final s = j['s'];
    final p = j['p'];
    if (id is! String || n is! String || s is! List || s.isEmpty || p is! num) return null;
    final price = p.round();
    if (price < kMin || price > kMax) return null;
    final img = safeImg(j['img']);
    final link = safeLink(j['link']);
    return Product(
      id: id,
      n: n,
      c: j['c'] is String ? j['c'] as String : '',
      s: s.map((e) => e.toString()).toList(),
      p: price,
      img: img.isEmpty ? null : img,
      link: link.isEmpty ? null : link,
      src: j['src'] is String ? j['src'] as String : 'estimado',
    );
  }

  /// Versión liviana que se guarda en la sala para que todos jueguen lo mismo.
  Map<String, dynamic> toRoomJson() {
    final o = <String, dynamic>{'id': id, 'n': n, 'c': c, 's': s, 'p': p};
    if (img != null) o['img'] = img;
    if (link != null) o['link'] = link;
    return o;
  }

  String get searchUrl {
    var slug = n.toLowerCase();
    const from = 'áàäâéèëêíìïîóòöôúùüûñ';
    const to = 'aaaaeeeeiiiioooouuuun';
    final b = StringBuffer();
    for (final ch in slug.split('')) {
      final i = from.indexOf(ch);
      b.write(i >= 0 ? to[i] : ch);
    }
    slug = b.toString().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-+|-+$'), '');
    return 'https://listado.mercadolibre.com.ar/$slug';
  }

  String get buyUrl => link ?? searchUrl;
}

List<Product> parseProducts(dynamic items) {
  if (items is! List) return <Product>[];
  final out = <Product>[];
  for (final j in items) {
    final p = Product.tryParse(j);
    if (p != null) out.add(p);
  }
  return out;
}

/* ----- escala logarítmica del control de precio ----- */

int clampPrice(num v) => v.clamp(kMin, kMax).round();
double toPos(num price) => (math.log(clampPrice(price).toDouble()) - _lnMin) / _lnSpan;
int stepFor(num v) => v < 50000 ? 500 : (v < 500000 ? 5000 : (v < 1000000 ? 10000 : 50000));

int fromPos(double t) {
  final tt = t < 0 ? 0.0 : (t > 1 ? 1.0 : t);
  final v = math.exp(_lnMin + tt * _lnSpan);
  final s = stepFor(v);
  return clampPrice((v / s).round() * s);
}

/* ----- puntaje ----- */

class RoundScore {
  const RoundScore(this.base, this.bonus, this.rel);
  final int base;
  final int bonus;
  final double rel;
}

RoundScore roundScore(num guess, num real) {
  final e = math.log(guess / real).abs();
  final base = (1000 * math.exp(-2.2 * e)).round();
  final rel = guess / real - 1;
  // la tolerancia evita que un 3% justo se pierda por decimales
  return RoundScore(base, rel.abs() <= 0.03 + 1e-9 ? 200 : 0, rel.toDouble());
}

double multOf(int streak) => 1 + 0.1 * math.min(streak, 5);

String verdictOf(int base, int bonus) {
  if (bonus > 0) return 'Exacto';
  if (base >= 800) return 'Muy cerca';
  if (base >= 600) return 'Cerca';
  if (base >= 350) return 'Lejos';
  return 'Muy lejos';
}

String rankOf(double avgBase) {
  if (avgBase >= 850) return 'Tasador experto';
  if (avgBase >= 700) return 'Ojo clínico';
  if (avgBase >= 500) return 'Buen ojo';
  if (avgBase >= 300) return 'En formación';
  return 'A ciegas';
}

/// 'good', 'mid' o 'bad' según qué tan cerca estuvo.
String tierOf(int base) => base >= 700 ? 'good' : (base >= 350 ? 'mid' : 'bad');

/* ----- partida ----- */

class LogEntry {
  LogEntry({
    required this.id,
    required this.guess,
    required this.real,
    required this.pts,
    required this.base,
    required this.bonus,
    required this.mult,
    required this.err,
    this.hint = 0,
  });

  final String id;
  final int guess;
  final int real;
  final int pts;
  final int base;
  final int bonus;
  final double mult;
  final double err;

  /// Puntos que costaron las pistas usadas en este producto.
  final int hint;

  Map<String, dynamic> toJson() => {
        'id': id,
        'guess': guess,
        'real': real,
        'pts': pts,
        'base': base,
        'bonus': bonus,
        'mult': mult,
        'err': err,
        'hint': hint,
      };

  static LogEntry fromJson(Map j) => LogEntry(
        id: j['id'] as String,
        guess: (j['guess'] as num).toInt(),
        real: (j['real'] as num).toInt(),
        pts: (j['pts'] as num).toInt(),
        base: (j['base'] as num).toInt(),
        bonus: (j['bonus'] as num).toInt(),
        mult: (j['mult'] as num).toDouble(),
        err: (j['err'] as num).toDouble(),
        hint: (j['hint'] as num?)?.toInt() ?? 0,
      );
}

class Game {
  Game({required this.mode, required this.items});

  final String mode; // 'daily', 'quick' o 'room'
  final List<Product> items;
  int round = 0;
  int total = 0;
  int base = 0;
  int streak = 0;
  final List<LogEntry> log = <LogEntry>[];

  Product get current => items[round];
  bool get done => round >= items.length;

  /// [hint] son los puntos que costaron las pistas usadas: se restan de lo que sumó este producto.
  LogEntry guess(int price, {int hint = 0}) {
    final it = items[round];
    final r = roundScore(price, it.p);
    final mult = multOf(streak);
    final pts = math.max(0, ((r.base + r.bonus) * mult).round() - hint);
    final entry = LogEntry(
      id: it.id,
      guess: price,
      real: it.p,
      pts: pts,
      base: r.base,
      bonus: r.bonus,
      mult: mult,
      err: r.rel,
      hint: hint,
    );
    total += pts;
    base += r.base;
    streak = r.base >= 700 ? streak + 1 : 0;
    log.add(entry);
    round++;
    return entry;
  }

  Map<String, dynamic> toJson() => {
        'round': round,
        'total': total,
        'base': base,
        'streak': streak,
        'log': log.map((l) => l.toJson()).toList(),
      };

  /// Retoma una partida guardada. Devuelve null si el guardado no coincide con los productos.
  static Game? restore(String mode, List<Product> items, dynamic saved) {
    try {
      if (saved is! Map) return null;
      final log = (saved['log'] as List).map((e) => LogEntry.fromJson(e as Map)).toList();
      final round = (saved['round'] as num).toInt();
      if (log.length != round || round > items.length) return null;
      final g = Game(mode: mode, items: items);
      g.round = round;
      g.total = (saved['total'] as num).toInt();
      g.base = (saved['base'] as num).toInt();
      g.streak = (saved['streak'] as num).toInt();
      g.log.addAll(log);
      return g;
    } catch (_) {
      return null;
    }
  }
}

String shareGrid(List<LogEntry> log) =>
    log.map((l) => l.base >= 700 ? '🟩' : (l.base >= 350 ? '🟨' : '🟥')).join();

double? avgError(List<int>? guesses, List<Product> items) {
  if (guesses == null || guesses.isEmpty) return null;
  var sum = 0.0;
  var n = 0;
  for (var i = 0; i < guesses.length && i < items.length; i++) {
    sum += (guesses[i] / items[i].p - 1).abs();
    n++;
  }
  return n == 0 ? null : sum / n;
}

/* ----- pistas ----- */

/// Costo acumulado de cada nivel de pista: 1 = rango amplio, 2 = rango ajustado.
const List<int> kHintCosts = [100, 250];

int _nice(double v, {required bool up}) {
  if (v < 100) return up ? v.ceil() : v.floor();
  final mag = math.pow(10, (math.log(v) / math.ln10).floor() - 1).toDouble();
  final q = v / mag;
  return ((up ? q.ceil() : q.floor()) * mag).round();
}

/// Rango donde está el precio real, sin que quede centrado (el corrimiento sale del id del producto).
/// Devuelve [desde, hasta]. Nivel 1 es amplio y nivel 2 es más ajustado.
List<int> hintRange(Product it, int level) {
  final h = hashStr('hint-${it.id}');
  final h1 = (h & 0xFFFF) / 65535;
  final h2 = ((h >> 16) & 0xFFFF) / 65535;
  final base = level >= 2 ? 1.12 : 1.5;
  final spread = level >= 2 ? 0.18 : 0.6;
  final lo = _nice(it.p / (base + h1 * spread), up: false);
  final hi = _nice(it.p * (base + h2 * spread), up: true);
  return [math.max(lo, kMin), math.min(hi, kMax)];
}

/* ----- rachas de días ----- */

/// La fecha `days` días después (o antes, si es negativo) de esa fecha.
String shiftDateKey(String key, int days) {
  final p = key.split('-').map(int.parse).toList();
  return _dateKeyOf(DateTime.utc(p[0], p[1], p[2]).add(Duration(days: days)));
}

/// Días seguidos jugando el desafío. Si hoy todavía no jugaste, la racha sigue viva hasta que termine el día.
int dailyStreak(bool Function(String key) played, String today) {
  var k = played(today) ? today : shiftDateKey(today, -1);
  var n = 0;
  while (n < 3650 && played(k)) {
    n++;
    k = shiftDateKey(k, -1);
  }
  return n;
}

/// Insignia que corresponde a esa cantidad de días seguidos (vacío si todavía no llega a ninguna).
String streakBadge(int days) {
  if (days >= 30) return 'Leyenda';
  if (days >= 14) return 'Imparable';
  if (days >= 7) return 'Una semana';
  if (days >= 3) return 'Entrando en calor';
  return '';
}

/* ----- azar repetible (mismo resultado en cualquier celular) ----- */

const int _m32 = 0xFFFFFFFF;
int _imul(int a, int b) => ((a & _m32) * (b & _m32)) & _m32;

int hashStr(String s) {
  var h = (1779033703 ^ s.length) & _m32;
  for (final c in s.codeUnits) {
    h = _imul(h ^ c, 3432918353);
    h = ((h << 13) & _m32) | (h >> 19);
  }
  h = _imul(h ^ (h >> 16), 2246822507);
  h = _imul(h ^ (h >> 13), 3266489909);
  return (h ^ (h >> 16)) & _m32;
}

double Function() mulberry32(int seed) {
  var a = seed & _m32;
  return () {
    a = (a + 0x6D2B79F5) & _m32;
    var t = _imul(a ^ (a >> 15), 1 | a);
    t = (((t + _imul(t ^ (t >> 7), 61 | t)) & _m32) ^ t) & _m32;
    return ((t ^ (t >> 14)) & _m32) / 4294967296;
  };
}

List<int> pickIndices(int n, int len, double Function() rng) {
  final a = List<int>.generate(len, (i) => i);
  for (var j = a.length - 1; j > 0; j--) {
    final k = (rng() * (j + 1)).floor();
    final t = a[j];
    a[j] = a[k];
    a[k] = t;
  }
  return a.sublist(0, math.min(n, len));
}

List<Product> pickItems(List<Product> products, int n, double Function() rng) =>
    pickIndices(n, products.length, rng).map((i) => products[i]).toList();

/// Elige n productos que no se vieron todavía, con pocas repeticiones de categoría.
/// Si quedan menos de n sin ver, elige entre todos.
List<Product> pickFresh(List<Product> products, int n, Set<String> seen, double Function() rng, {int perCat = 2}) {
  var pool = products.where((p) => !seen.contains(p.id)).toList();
  if (pool.length < n) pool = List<Product>.from(products);
  final idx = pickIndices(pool.length, pool.length, rng);
  final out = <Product>[];
  final count = <String, int>{};
  for (final i in idx) {
    if (out.length >= n) break;
    final p = pool[i];
    final c = count[p.c] ?? 0;
    if (c >= perCat) continue;
    count[p.c] = c + 1;
    out.add(p);
  }
  for (final i in idx) {
    if (out.length >= n) break;
    final p = pool[i];
    if (!out.contains(p)) out.add(p);
  }
  return out;
}

/// El lote del día sale de la lista ordenada por id, así no depende del orden del archivo.
List<Product> dailyItems(List<Product> products, String dateKey, [int n = 5]) {
  final sorted = List<Product>.from(products)..sort((a, b) => a.id.compareTo(b.id));
  return pickItems(sorted, n, mulberry32(hashStr('pap-$dateKey')));
}

/* ----- fechas: el día cambia a las 00:00 de Argentina (UTC-3) en cualquier celular ----- */

String _p2(int v) => v.toString().padLeft(2, '0');
String _dateKeyOf(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${_p2(d.month)}-${_p2(d.day)}';

String arDateKey([DateTime? now]) =>
    _dateKeyOf((now ?? DateTime.now()).toUtc().subtract(const Duration(hours: 3)));

/// Lunes de la semana a la que pertenece esa fecha.
String weekStartKey(String dateKey) {
  final p = dateKey.split('-').map(int.parse).toList();
  final d = DateTime.utc(p[0], p[1], p[2]);
  return _dateKeyOf(d.subtract(Duration(days: d.weekday - 1)));
}

String prettyDate(String dateKey) {
  const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  final p = dateKey.split('-').map(int.parse).toList();
  return '${p[2]} ${m[p[1] - 1]}';
}

/* ----- formato y datos ----- */

String num0(num n) =>
    n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => '.');
String money(num n) => '\$ ${num0(n)}';
String pct(num x) => '${(x.abs() * 100).round()}%';

int parseMoney(String s) => int.tryParse(s.replaceAll(RegExp(r'\D'), '')) ?? 0;

String sanitizeName(String s) {
  var t = s.replaceAll(RegExp(r'[\x00-\x1f<>"' "'" r'`\\]'), '');
  t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
  return t.length > 14 ? t.substring(0, 14).trim() : t;
}

String newRoomCode(double Function() rng) {
  final b = StringBuffer();
  for (var i = 0; i < 6; i++) {
    b.write(_codeAlphabet[(rng() * _codeAlphabet.length).floor()]);
  }
  return b.toString();
}

String normalizeCode(String s) {
  final t = s.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
  return t.length > 6 ? t.substring(0, 6) : t;
}
