import 'dart:async';

import 'package:flutter/material.dart';

import '../config.dart';
import '../core.dart';
import '../env.dart';
import '../theme.dart';
import '../widgets.dart';
import 'play.dart';
import 'rank.dart';
import 'rooms.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.initFailed = false});
  final bool initFailed;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    if (widget.initFailed && env.products.isEmpty) {
      try {
        await env.init();
      } catch (_) {}
    }
    final newer = await env.refreshProducts();
    if (newer) {
      env.applyDownloaded();
    }
    if (mounted) setState(() {});
  }

  String get _fine {
    var d = '';
    if (env.updated.isNotEmpty) {
      final t = DateTime.tryParse(env.updated);
      if (t != null) d = prettyDate(arDateKey(t));
    }
    if (env.source == 'api.mercadolibre.com') {
      return 'Precios de publicaciones reales de Mercado Libre Argentina, actualizados el $d. Juego independiente, sin relación con Mercado Libre.';
    }
    return 'Precios de referencia estimados${d.isEmpty ? '' : ' al $d'}. Juego independiente, sin relación con Mercado Libre.';
  }

  Future<void> _go(Route<void> route) async {
    await Navigator.of(context).push(route);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (env.products.isEmpty) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('No se pudieron cargar los productos.', style: sans(18, w: FontWeight.w700), textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text('Revisá tu conexión y probá de nuevo.', style: sans(14, color: C.muted), textAlign: TextAlign.center),
                const SizedBox(height: 20),
                SizedBox(width: 200, child: PrimaryButton('Reintentar', onPressed: _refresh)),
              ]),
            ),
          ),
        ),
      );
    }
    final key = arDateKey();
    final rec = env.getJson('pap.daily.$key');
    final played = rec is Map && rec['score'] is num;
    final prog = env.getJson('pap.dailyprog.$key');
    final progRound = prog is Map && prog['round'] is num ? (prog['round'] as num).toInt() : 0;
    final inProgress = !played && progRound > 0;
    final sheet = dailyItems(env.products, key, 5).take(3).toList();

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
          children: [
            Row(children: [
              Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: C.accent, width: 3)),
              ),
              const SizedBox(width: 10),
              Text('Pegale al Precio', style: sans(17, w: FontWeight.w700)),
              const Spacer(),
              TextButton(
                onPressed: () => _go(MaterialPageRoute<void>(builder: (_) => const RankScreen())),
                child: Text('Ranking', style: sans(15, color: C.muted)),
              ),
            ]),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: C.line2),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF16233B), Color(0xFF0D1524)],
                ),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Kicker('Desafío del día · ${prettyDate(key)}'),
                const SizedBox(height: 14),
                SizedBox(
                  height: 176,
                  child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text('5 productos.\nUn solo\nintento\ncuenta.',
                            style: sans(30, w: FontWeight.w800, ls: -1, h: 1.04)),
                      ),
                    ),
                    const SizedBox(width: 6),
                    _Fan(items: sheet),
                  ]),
                ),
                const SizedBox(height: 14),
                if (played) ...[
                  Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                    Text('Hoy: ${num0(rec['score'] as num)} puntos', style: mono(13, w: FontWeight.w700, color: C.accent)),
                    const SizedBox(width: 10),
                    Text('${rec['grid'] ?? ''}', style: const TextStyle(fontSize: 14, letterSpacing: 1)),
                  ]),
                  const SizedBox(height: 6),
                  Row(children: [
                    Text('Próximo desafío en ', style: mono(12, color: C.muted)),
                    _Countdown(onDone: () => setState(() {})),
                  ]),
                ] else
                  Text(
                    inProgress
                        ? 'Ya empezaste el desafío de hoy: no se puede reiniciar.'
                        : 'Una sola partida por día. Se renueva a las 00:00.',
                    style: mono(12, color: C.muted),
                  ),
                const SizedBox(height: 16),
                PrimaryButton(
                  played ? 'Desafío completado' : (inProgress ? 'Seguir el desafío · producto ${progRound + 1} de 5' : 'Jugar el desafío'),
                  onPressed: played ? null : () => _go(PlayScreen.dailyRoute()),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(
                child: _Tile(
                  icon: Icons.bolt_rounded,
                  title: 'Partida rápida',
                  sub: '8 productos al azar',
                  onTap: () => _go(PlayScreen.quickRoute()),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Tile(
                  icon: Icons.groups_rounded,
                  title: 'Sala online',
                  sub: 'Jugá con amigos, cada uno a su hora',
                  onTap: () => _go(MaterialPageRoute<void>(builder: (_) => const RoomsScreen())),
                ),
              ),
            ]),
            ),
            const SizedBox(height: 22),
            const _How('01', 'Mirá el producto.', 'Foto y ficha técnica, sin el precio.'),
            const _How('02', 'Fijá tu precio.', 'Cuanto más cerca, más puntos. Las rachas multiplican.'),
            const _How('03', 'Compará.', 'Se revela el precio real y podés ir a la publicación.'),
            const SizedBox(height: 10),
            Text(_fine, style: sans(12, color: C.faint, h: 1.4)),
            const SizedBox(height: 6),
            Text('Versión $kVersion', style: mono(11, color: C.faint)),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.title, required this.sub, required this.onTap});
  final IconData icon;
  final String title;
  final String sub;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
        color: C.surface,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.all(16),
            constraints: const BoxConstraints(minHeight: 112),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: C.line)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: const Color(0xFF16304D), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: C.accent, size: 22),
              ),
              const SizedBox(height: 14),
              Text(title, style: sans(17, w: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(sub, style: sans(13, color: C.muted, h: 1.3)),
            ]),
          ),
        ),
      );
}

class _How extends StatelessWidget {
  const _How(this.n, this.title, this.text);
  final String n;
  final String title;
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 30, child: Padding(padding: const EdgeInsets.only(top: 2), child: Text(n, style: mono(11, color: C.accent)))),
          Expanded(
            child: Text.rich(
              TextSpan(children: [
                TextSpan(text: '$title ', style: sans(14, w: FontWeight.w600)),
                TextSpan(text: text, style: sans(14, color: C.muted)),
              ]),
              style: const TextStyle(height: 1.4),
            ),
          ),
        ]),
      );
}

/// Tres cartas abanicadas con los productos del día. Se abren al entrar.
class _Fan extends StatelessWidget {
  const _Fan({required this.items});
  final List<Product> items;

  Widget _card(Product p, double angle, double t) {
    return Transform.rotate(
      angle: angle * t,
      alignment: Alignment.bottomCenter,
      child: Container(
        width: 92,
        height: 128,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFFFFFFF), width: 2),
          boxShadow: const [BoxShadow(color: Color(0x99000000), blurRadius: 14, offset: Offset(0, 6))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Plate(p, aspect: 92 / 128, radius: 0, pad: 8, small: true),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (items.length < 3) return const SizedBox(width: 150);
    return SizedBox(
      width: 150,
      height: 176,
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: 1),
        duration: const Duration(milliseconds: 800),
        curve: Curves.easeOutBack,
        builder: (context, t, _) => Stack(clipBehavior: Clip.none, children: [
          Positioned(left: 2, top: 26, child: _card(items[0], -0.24, t)),
          Positioned(right: 2, top: 26, child: _card(items[2], 0.24, t)),
          Positioned(left: 29, top: 8 - 8 * t, child: _card(items[1], 0, t)),
        ]),
      ),
    );
  }
}

/// Cuenta regresiva hasta las 00:00 de Argentina. Al llegar a cero avisa para mostrar el desafío nuevo.
class _Countdown extends StatefulWidget {
  const _Countdown({required this.onDone});
  final VoidCallback onDone;
  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  Timer? _t;
  bool _fired = false;

  Duration get _left {
    final now = DateTime.now().toUtc();
    final ar = now.subtract(const Duration(hours: 3));
    final next = DateTime.utc(ar.year, ar.month, ar.day + 1, 3);
    return next.difference(now);
  }

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_left.inSeconds <= 0 && !_fired) {
        _fired = true;
        widget.onDone();
        return;
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  String _two(int v) => v.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final d = _left.isNegative ? Duration.zero : _left;
    return Text('${_two(d.inHours)}:${_two(d.inMinutes % 60)}:${_two(d.inSeconds % 60)}',
        style: mono(12, w: FontWeight.w700, color: C.ink));
  }
}
