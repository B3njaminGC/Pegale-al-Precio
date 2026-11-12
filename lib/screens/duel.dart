import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core.dart';
import '../env.dart';
import '../theme.dart';
import '../widgets.dart';

/// "¿Más caro o más barato?": se ve el precio del primer producto y hay que decir si el segundo cuesta más o menos.
/// Sigue mientras no te equivoques. El segundo pasa a ser el primero en la ronda siguiente.
class DuelScreen extends StatefulWidget {
  const DuelScreen({super.key});

  @override
  State<DuelScreen> createState() => _DuelScreenState();
}

class _DuelScreenState extends State<DuelScreen> {
  static const String _bestKey = 'pap.duel.best';

  final List<Product> _queue = <Product>[];
  late Product a;
  late Product b;
  int streak = 0;
  int best = 0;
  bool revealed = false;
  bool? lastCorrect;
  bool over = false;
  bool newRecord = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    best = env.prefs.getInt(_bestKey) ?? 0;
    _start();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _refill() {
    _queue
      ..clear()
      ..addAll(env.pickFreshItems(40));
  }

  Product _take() {
    if (_queue.isEmpty) _refill();
    return _queue.removeAt(0);
  }

  /// El siguiente producto, que no cueste casi lo mismo que [other] (para que la respuesta no sea una moneda al aire).
  Product _takeFor(Product other) {
    for (var tries = 0; tries < 60; tries++) {
      if (_queue.isEmpty) _refill();
      for (var i = 0; i < _queue.length; i++) {
        final r = _queue[i].p / other.p;
        if (r >= 1.15 || r <= 1 / 1.15) return _queue.removeAt(i);
      }
      _queue.clear(); // ninguno sirve: se arma otro lote
    }
    return _take();
  }

  void _start() {
    _timer?.cancel();
    _queue.clear();
    a = _take();
    b = _takeFor(a);
    env.markSeen([a.id, b.id]);
    setState(() {
      streak = 0;
      revealed = false;
      lastCorrect = null;
      over = false;
      newRecord = false;
    });
  }

  void _answer(bool higher) {
    if (revealed) return;
    final correct = (b.p > a.p) == higher;
    HapticFeedback.mediumImpact();
    setState(() {
      revealed = true;
      lastCorrect = correct;
      if (correct) {
        streak++;
      } else {
        over = true;
        if (streak > best) {
          best = streak;
          newRecord = streak > 0;
          env.prefs.setInt(_bestKey, best);
        }
      }
    });
    if (correct) {
      _timer = Timer(const Duration(milliseconds: 1400), () {
        if (!mounted) return;
        final next = _takeFor(b);
        env.markSeen([next.id]);
        setState(() {
          a = b;
          b = next;
          revealed = false;
          lastCorrect = null;
        });
      });
    }
  }

  Widget _product(Product p, {required bool showPrice, Color? tint}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: C.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tint ?? C.line, width: tint == null ? 1 : 2),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        SizedBox(width: 112, child: Plate(p, aspect: 1, radius: 12, pad: 8, small: true)),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (p.c.isNotEmpty) Kicker(p.c, color: C.accent),
            const SizedBox(height: 4),
            Text(p.n, style: sans(16, w: FontWeight.w700, h: 1.2), maxLines: 3, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 8),
            Text(
              showPrice ? money(p.p) : '\$ ? ? ?',
              style: mono(22, w: FontWeight.w700, color: showPrice ? (tint ?? C.gold) : C.faint),
            ),
          ]),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tint = revealed ? (lastCorrect == true ? C.good : C.bad) : null;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
          children: [
            Row(children: [
              InkWell(
                onTap: () => Navigator.of(context).pop(),
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
                  child: Text('Salir', style: sans(14, color: C.muted)),
                ),
              ),
              const Spacer(),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('RACHA', style: mono(10, color: C.faint, ls: 1.2)),
                Text('$streak', style: mono(22, w: FontWeight.w700, color: C.accent)),
              ]),
              const SizedBox(width: 18),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('RÉCORD', style: mono(10, color: C.faint, ls: 1.2)),
                Text('$best', style: mono(22, w: FontWeight.w700)),
              ]),
            ]),
            const SizedBox(height: 14),
            Text('¿Más caro o más barato?', style: sans(28, w: FontWeight.w800, ls: -0.8, h: 1.05)),
            const SizedBox(height: 4),
            Text('Mirá el precio de arriba y decidí cómo es el de abajo.', style: sans(14, color: C.muted)),
            const SizedBox(height: 16),
            _product(a, showPrice: true),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Center(child: Icon(Icons.swap_vert_rounded, color: C.faint, size: 26)),
            ),
            _product(b, showPrice: revealed, tint: tint),
            const SizedBox(height: 18),
            if (!revealed)
              Row(children: [
                Expanded(child: PrimaryButton('Más caro', onPressed: () => _answer(true))),
                const SizedBox(width: 12),
                Expanded(child: PrimaryButton('Más barato', onPressed: () => _answer(false))),
              ])
            else if (!over)
              Text(
                '¡Bien! Era ${b.p > a.p ? 'más caro' : 'más barato'}.',
                style: sans(18, w: FontWeight.w700, color: C.good),
                textAlign: TextAlign.center,
              )
            else
              _overPanel(),
          ],
        ),
      ),
    );
  }

  Widget _overPanel() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(
        'Era ${b.p > a.p ? 'más caro' : 'más barato'}.',
        style: sans(20, w: FontWeight.w800, color: C.bad),
      ),
      const SizedBox(height: 4),
      Text(
        streak == 0
            ? 'No sumaste ninguna esta vez.'
            : (newRecord ? 'Nuevo récord: $streak seguidas.' : 'Acertaste $streak seguidas. Tu récord es $best.'),
        style: sans(14, color: C.muted),
      ),
      const SizedBox(height: 16),
      PrimaryButton('Jugar de nuevo', onPressed: _start),
      const SizedBox(height: 10),
      SecondaryButton('Ver en Mercado Libre', onPressed: () => openUrl(context, b.buyUrl)),
      const SizedBox(height: 10),
      SecondaryButton('Volver al inicio', onPressed: () => Navigator.of(context).pop()),
    ]);
  }
}
