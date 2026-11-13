import 'package:flutter_test/flutter_test.dart';
import 'package:pegale_al_precio/core.dart';

// Los valores esperados salen de la versión anterior del juego (JavaScript), ya probada:
// así se comprueba que el desafío del día y el puntaje son idénticos en cualquier celular.
const ids = ["iphone-17", "galaxy-s25", "moto-g", "redmi-note", "ps5-slim", "switch-2", "airpods-pro-2", "sony-xm5", "jbl-flip-6", "macbook-air-m4", "notebook-i5", "ipad-a16", "kindle-paperwhite", "apple-watch-s11", "casio-f91w", "gopro-hero13", "dji-mini-4-pro", "monitor-gamer-27", "teclado-mecanico-75", "mx-master-3s", "ssd-portatil-1tb", "rtx-5070", "tv-qled-55", "power-bank-20000", "silla-gamer", "dyson-v15", "robot-aspirador", "heladera-350", "lavarropas-8kg", "aire-split", "olla-multifuncion", "freidora-aire", "cafetera-espresso", "pava-electrica", "termo-stanley", "stanley-quencher", "bici-mtb-29", "pelota-futbol-5", "carpa-4", "mochila-trekking-50", "nike-pegasus-41", "air-force-1", "levis-501", "squier-stratocaster", "ukelele-soprano"];

List<Product> fakeProducts() => ids
    .map((id) => Product(id: id, n: id, c: 'Test', s: ['a'], p: 100000))
    .toList();

void main() {
  test('hash y azar repetible', () {
    expect(hashStr('pap-2026-10-31'), 3095854564);
    expect(hashStr('pap-2026-01-01'), 2483807624);
    expect(hashStr('x'), 3439761885);
    final r = mulberry32(12345);
    expect(r(), closeTo(0.9797282677609473, 1e-12));
    expect(r(), closeTo(0.3067522644996643, 1e-12));
    expect(r(), closeTo(0.484205421525985, 1e-12));
  });

  test('el desafío del día es el mismo para todos', () {
    expect(dailyItems(fakeProducts(), '2026-10-31').map((p) => p.id).toList(),
        ['teclado-mecanico-75', 'jbl-flip-6', 'freidora-aire', 'mx-master-3s', 'bici-mtb-29']);
    expect(dailyItems(fakeProducts(), '2026-11-01').map((p) => p.id).toList(),
        ['heladera-350', 'mochila-trekking-50', 'carpa-4', 'squier-stratocaster', 'ssd-portatil-1tb']);
    final shuffled = fakeProducts().reversed.toList();
    expect(dailyItems(shuffled, '2026-10-31').map((p) => p.id).toList(),
        dailyItems(fakeProducts(), '2026-10-31').map((p) => p.id).toList());
  });

  test('puntaje', () {
    expect(roundScore(495000, 450000).base, 811);
    expect(roundScore(495000, 450000).bonus, 0);
    expect(roundScore(1000, 1000).base, 1000);
    expect(roundScore(1000, 1000).bonus, 200);
    expect(roundScore(3000000, 100000).base, 1);
    expect(roundScore(103000, 100000).base, 937);
    expect(roundScore(103000, 100000).bonus, 200); // 3% justo cuenta como exacto
    expect(roundScore(97000, 100000).bonus, 200);
    expect(roundScore(50000, 100000).base, 218);
  });

  test('escala del precio', () {
    expect(fromPos(0), 10000);
    expect(fromPos(0.25), 47500);
    expect(fromPos(0.5), 225000);
    expect(fromPos(0.77), 1200000);
    expect(fromPos(1), 5000000);
    expect(toPos(10000), 0);
    expect(toPos(200000), closeTo(0.48204685253034185, 1e-12));
    expect(toPos(5000000), closeTo(1, 1e-12));
  });

  test('fechas de Argentina', () {
    expect(arDateKey(DateTime.parse('2026-11-01T02:59:59Z')), '2026-10-31');
    expect(arDateKey(DateTime.parse('2026-11-01T03:00:00Z')), '2026-11-01');
    expect(weekStartKey('2026-10-31'), '2026-10-26');
    expect(weekStartKey('2026-11-02'), '2026-11-02');
    expect(weekStartKey('2026-11-01'), '2026-10-26');
    expect(prettyDate('2026-10-31'), '31 oct');
  });

  test('formato y nombres', () {
    expect(money(1234567), '\$ 1.234.567');
    expect(money(999), '\$ 999');
    expect(parseMoney('1.234.567'), 1234567);
    expect(sanitizeName('  <b>Lu"cía</b>  de   la Cruz muy larga '), 'bLucía/b de la');
    expect(normalizeCode('ab-c12 3x'), 'ABC123');
  });

  test('partida completa con racha y recuperación', () {
    final items = [
      Product(id: 'a', n: 'A', c: '', s: ['x'], p: 100000),
      Product(id: 'b', n: 'B', c: '', s: ['x'], p: 200000),
      Product(id: 'c', n: 'C', c: '', s: ['x'], p: 300000),
    ];
    final g = Game(mode: 'quick', items: items);
    final e1 = g.guess(100000);
    expect(e1.pts, 1200);
    final e2 = g.guess(200000);
    expect(e2.mult, closeTo(1.1, 1e-9));
    expect(e2.pts, 1320);
    expect(g.streak, 2);
    final saved = g.toJson();
    final back = Game.restore('quick', items, saved)!;
    expect(back.round, 2);
    expect(back.total, g.total);
    expect(Game.restore('quick', items, {'round': 5, 'total': 0, 'base': 0, 'streak': 0, 'log': []}), isNull);
    back.guess(10000);
    expect(back.streak, 0);
    expect(back.done, isTrue);
  });

  test('productos: solo links de Mercado Libre', () {
    final ok = Product.tryParse({
      'id': 'z', 'n': 'Z', 's': ['x'], 'p': 50000,
      'img': 'https://http2.mlstatic.com/D_1.jpg', 'link': 'https://articulo.mercadolibre.com.ar/MLA-1',
    })!;
    expect(ok.img, isNotNull);
    expect(ok.link, isNotNull);
    final bad = Product.tryParse({
      'id': 'z', 'n': 'Z', 's': ['x'], 'p': 50000,
      'img': 'http://evil.com/x.jpg', 'link': 'https://mercadolibre.com.evil.com/x',
    })!;
    expect(bad.img, isNull);
    expect(bad.link, isNull);
    expect(Product.tryParse({'id': 'z', 'n': 'Z', 's': ['x'], 'p': 5}), isNull);
    expect(ok.buyUrl, 'https://articulo.mercadolibre.com.ar/MLA-1');
    expect(bad.buyUrl, 'https://listado.mercadolibre.com.ar/z');
  });

  test('pickFresh no repite lo visto y reparte categorías', () {
    final ps = List.generate(
        60, (i) => Product(id: 'p$i', n: 'p$i', c: 'C${i % 6}', s: ['a'], p: 100000));
    final seen = <String>{};
    final rng = mulberry32(7);
    for (var round = 0; round < 7; round++) {
      final pick = pickFresh(ps, 8, seen, rng);
      expect(pick.length, 8);
      expect(pick.map((p) => p.id).toSet().length, 8);
      expect(pick.where((p) => seen.contains(p.id)), isEmpty, reason: 'ronda $round');
      final perCat = <String, int>{};
      for (final p in pick) {
        perCat[p.c] = (perCat[p.c] ?? 0) + 1;
      }
      if (round < 3) expect(perCat.values.every((n) => n <= 2), isTrue);
      seen.addAll(pick.map((p) => p.id));
    }
    // quedan 4 sin ver: elige entre todos y devuelve igual 8
    expect(pickFresh(ps, 8, seen, rng).length, 8);
  });

  test('las pistas dan un rango que contiene el precio y el nivel 2 es más ajustado', () {
    for (var i = 0; i < 40; i++) {
      final p = Product(id: 'x$i', n: 'x', c: 'C', s: ['a'], p: 15000 + i * 37000);
      final r1 = hintRange(p, 1);
      final r2 = hintRange(p, 2);
      expect(r1[0] <= p.p && p.p <= r1[1], isTrue, reason: 'nivel 1 · ${p.p}');
      expect(r2[0] <= p.p && p.p <= r2[1], isTrue, reason: 'nivel 2 · ${p.p}');
      expect(r2[1] - r2[0] <= r1[1] - r1[0], isTrue);
      expect(hintRange(p, 1), r1, reason: 'siempre da lo mismo');
    }
  });

  test('las pistas restan puntos pero no bajan de cero', () {
    final p = Product(id: 'a', n: 'a', c: 'C', s: ['a'], p: 100000);
    final g = Game(mode: 'quick', items: [p, p]);
    final e = g.guess(100000, hint: 100);
    expect(e.pts, 1200 - 100); // base 1000 + exacto 200
    expect(e.hint, 100);
    final e2 = g.guess(100000, hint: 5000);
    expect(e2.pts, 0);
    expect(g.total, 1100);
    // se guarda y se recupera
    final back = Game.restore('quick', [p, p], g.toJson());
    expect(back!.log.first.hint, 100);
  });

  test('la racha cuenta días seguidos y no se corta si hoy todavía no jugaste', () {
    final played = {'2026-11-08', '2026-11-09', '2026-11-10', '2026-11-12'};
    bool f(String k) => played.contains(k);
    expect(dailyStreak(f, '2026-11-10'), 3);
    expect(dailyStreak(f, '2026-11-11'), 3, reason: 'hoy no jugó pero ayer sí');
    expect(dailyStreak(f, '2026-11-12'), 1);
    expect(dailyStreak(f, '2026-11-14'), 0);
    expect(shiftDateKey('2026-12-31', 1), '2027-01-01');
    expect(shiftDateKey('2026-03-01', -1), '2026-02-28');
    expect(streakBadge(2), '');
    expect(streakBadge(3), 'Entrando en calor');
    expect(streakBadge(30), 'Leyenda');
  });

  test('veredictos, rangos y cuadraditos de color', () {
    expect(verdictOf(900, 200), 'Exacto');
    expect(verdictOf(850, 0), 'Muy cerca');
    expect(verdictOf(650, 0), 'Cerca');
    expect(verdictOf(400, 0), 'Lejos');
    expect(verdictOf(100, 0), 'Muy lejos');
    expect(rankOf(900), 'Tasador experto');
    expect(rankOf(720), 'Ojo clínico');
    expect(rankOf(550), 'Buen ojo');
    expect(rankOf(320), 'En formación');
    expect(rankOf(10), 'A ciegas');
    expect(tierOf(700), 'good');
    expect(tierOf(699), 'mid');
    expect(tierOf(349), 'bad');
    LogEntry e(int base) => LogEntry(id: 'a', guess: 1, real: 1, pts: base, base: base, bonus: 0, mult: 1, err: 0);
    expect(shareGrid([e(900), e(500), e(100)]), '🟩🟨🟥');
  });

  test('la racha de aciertos sube el multiplicador hasta un tope', () {
    expect(multOf(0), 1.0);
    expect(multOf(3), closeTo(1.3, 1e-12));
    expect(multOf(5), closeTo(1.5, 1e-12));
    expect(multOf(50), closeTo(1.5, 1e-12));
  });

  test('el desafío cambia cada día y no repite productos dentro del día', () {
    final ps = List.generate(80, (i) => Product(id: 'p${i.toString().padLeft(2, '0')}', n: 'p$i', c: 'C', s: ['a'], p: 20000 + i));
    final a = dailyItems(ps, '2026-11-12').map((p) => p.id).toList();
    final b = dailyItems(ps, '2026-11-13').map((p) => p.id).toList();
    expect(a.length, 5);
    expect(a.toSet().length, 5);
    expect(a, isNot(b));
    // da lo mismo aunque la lista llegue en otro orden
    expect(dailyItems(ps.reversed.toList(), '2026-11-12').map((p) => p.id).toList(), a);
  });

  test('parseProducts ignora lo que no sirve', () {
    expect(parseProducts(null), isEmpty);
    expect(parseProducts('hola'), isEmpty);
    final out = parseProducts([
      {'id': 'a', 'n': 'A', 's': ['x'], 'p': 50000},
      {'id': 'b', 'n': 'B', 's': ['x'], 'p': 3},
      'basura',
      null,
    ]);
    expect(out.map((p) => p.id), ['a']);
  });

  test('códigos de sala y nombres', () {
    final code = newRoomCode(mulberry32(1));
    expect(code, matches(RegExp(r'^[A-Z0-9]{6}$')));
    expect(code, isNot(contains('0')));
    expect(code, isNot(contains('O')));
    expect(normalizeCode('  abc '), 'ABC');
    expect(normalizeCode('abcdefghij'), 'ABCDEF');
    expect(sanitizeName('   '), '');
  });

  test('el precio se limita a lo que acepta el juego', () {
    expect(clampPrice(1), kMin);
    expect(clampPrice(999999999), kMax);
    expect(clampPrice(123456), 123456);
    expect(stepFor(20000), 500);
    expect(stepFor(200000), 5000);
    expect(stepFor(800000), 10000);
    expect(stepFor(2000000), 50000);
  });
}
