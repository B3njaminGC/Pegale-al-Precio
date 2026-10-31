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
}
