import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core.dart';
import '../env.dart';
import '../theme.dart';
import '../widgets.dart';
import 'end.dart';

class PlayScreen extends StatefulWidget {
  const PlayScreen({super.key, required this.mode, required this.items, this.practice = false, this.roomCode, this.saved, this.dailyKey});

  final String mode; // daily, quick o room
  final List<Product> items;
  final bool practice;
  final String? roomCode;
  final dynamic saved;
  final String? dailyKey;

  static Route<void> dailyRoute() {
    final key = arDateKey();
    return MaterialPageRoute<void>(
      builder: (_) => PlayScreen(
        mode: 'daily',
        items: dailyItems(env.products, key, 5),
        dailyKey: key,
        saved: env.getJson('pap.dailyprog.$key'), // si ya empezó, retoma donde quedó
      ),
    );
  }

  static Route<void> quickRoute() => MaterialPageRoute<void>(
        builder: (_) => PlayScreen(
          mode: 'quick',
          items: pickItems(env.products, math.min(8, env.products.length), math.Random().nextDouble),
        ),
      );

  @override
  State<PlayScreen> createState() => _PlayScreenState();
}

class _PlayScreenState extends State<PlayScreen> {
  late Game game;
  final TextEditingController _amt = TextEditingController();
  final FocusNode _focus = FocusNode();
  final ScrollController _scroll = ScrollController();
  int price = kStart;
  double pos = toPos(kStart);
  bool revealed = false;
  bool sending = false;
  LogEntry? entry;
  Product? shown;
  bool quitArmed = false;
  Timer? _quitTimer;

  @override
  void initState() {
    super.initState();
    game = Game.restore(widget.mode, widget.items, widget.saved) ?? Game(mode: widget.mode, items: widget.items);
    _focus.addListener(() {
      if (!_focus.hasFocus) _syncText();
    });
    _syncText();
    if (game.done && widget.mode == 'daily') {
      WidgetsBinding.instance.addPostFrameCallback((_) => _next()); // terminó pero no llegó a ver el resultado
    }
  }

  @override
  void dispose() {
    _quitTimer?.cancel();
    _amt.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _syncText() => _amt.text = num0(price);

  void _setPrice(int v, {bool typing = false}) {
    setState(() {
      price = clampPrice(v);
      pos = toPos(price);
    });
    if (!typing) _syncText();
  }

  void _onType(String s) {
    final n = parseMoney(s);
    final f = n > 0 ? num0(n) : '';
    if (f != s) {
      _amt.value = TextEditingValue(text: f, selection: TextSelection.collapsed(offset: f.length));
    }
    if (n > 0) _setPrice(n, typing: true);
  }

  void _lock() {
    if (revealed || game.done) return;
    _focus.unfocus();
    final it = game.current;
    final e = game.guess(price);
    if (e.base >= 700) {
      HapticFeedback.heavyImpact();
    } else {
      HapticFeedback.mediumImpact();
    }
    if (widget.dailyKey != null) {
      env.setJson('pap.dailyprog.${widget.dailyKey}', game.toJson());
    }
    if (widget.mode == 'room' && widget.roomCode != null) {
      env.setJson('pap.room.${widget.roomCode}', game.toJson());
      env.net.pushProgress(widget.roomCode!, {'round': game.round}).catchError((Object _) {});
    }
    setState(() {
      entry = e;
      shown = it;
      revealed = true;
    });
    _toTop();
  }

  void _toTop() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(0);
    });
  }

  Future<void> _next() async {
    if (!game.done) {
      setState(() {
        revealed = false;
        entry = null;
        shown = null;
      });
      _setPrice(kStart);
      _toTop();
      return;
    }
    if (widget.mode == 'room' && widget.roomCode != null) {
      setState(() => sending = true);
      String? result;
      try {
        await env.net.pushProgress(widget.roomCode!, {
          'round': game.items.length,
          'done': true,
          'score': game.total,
          'picks': game.log.map((l) => l.guess).toList(),
        });
      } catch (_) {
        result = 'sendfail';
      }
      if (mounted) Navigator.of(context).pop(result);
      return;
    }
    Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
      builder: (_) => EndScreen(game: game, mode: widget.mode, practice: widget.practice, dateKey: widget.dailyKey),
    ));
  }

  void _quit() {
    if (quitArmed) {
      _quitTimer?.cancel();
      Navigator.of(context).pop();
      return;
    }
    setState(() => quitArmed = true);
    _quitTimer = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() => quitArmed = false);
    });
  }

  String _mult(double m) => m.toStringAsFixed(1).replaceAll('.', ',');

  @override
  Widget build(BuildContext context) {
    if (game.done && !revealed) return const Scaffold(body: SizedBox.shrink());
    final it = revealed ? shown! : game.current;
    final lot = revealed ? game.round : game.round + 1;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _quit();
      },
      child: Scaffold(
        body: SafeArea(
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            behavior: HitTestBehavior.translucent,
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
              children: [
                _header(),
                const SizedBox(height: 12),
                Row(children: [
                  Text('Producto $lot de ${game.items.length}', style: mono(12, color: C.muted)),
                  const Spacer(),
                  if (game.streak > 0)
                    Text('Racha ${game.streak} · ×${_mult(multOf(game.streak))}', style: mono(12, color: C.gold)),
                ]),
                const SizedBox(height: 10),
                _card(it),
                const SizedBox(height: 16),
                if (!revealed) _guessPanel() else _revealPanel(it, entry!),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    final seg = <Widget>[];
    for (var i = 0; i < game.items.length; i++) {
      final done = i < game.round;
      final now = i == game.round && !revealed;
      seg.add(Expanded(
        child: Container(
          height: 4,
          margin: EdgeInsets.only(left: i == 0 ? 0 : 4),
          decoration: BoxDecoration(
            color: done ? C.accent : (now ? C.ink : C.line2),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ));
    }
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      InkWell(
        onTap: _quit,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
          child: Text(quitArmed ? 'Tocá de nuevo' : 'Salir', style: sans(14, color: quitArmed ? C.gold : C.muted)),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(child: Row(children: seg)),
      const SizedBox(width: 12),
      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('PUNTOS', style: mono(10, color: C.faint, ls: 1.2)),
        TweenAnimationBuilder<double>(
          tween: Tween<double>(begin: 0, end: game.total.toDouble()),
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeOutCubic,
          builder: (c, v, _) => Text(num0(v), style: mono(20, w: FontWeight.w700)),
        ),
      ]),
    ]);
  }

  Widget _card(Product it) {
    return Container(
      decoration: BoxDecoration(
        color: C.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: C.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Plate(it, aspect: 1.5, radius: 0, pad: 18),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (it.c.isNotEmpty) Kicker(it.c, color: C.accent),
            const SizedBox(height: 6),
            Text(it.n, style: sans(24, w: FontWeight.w800, ls: -0.5, h: 1.1)),
            const SizedBox(height: 10),
            for (final s in it.s)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: C.line))),
                child: Text(s, style: sans(15, color: const Color(0xFFC9D3E6))),
              ),
          ]),
        ),
      ]),
    );
  }

  Widget _guessPanel() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Kicker('Tu precio en pesos', color: C.faint),
      const SizedBox(height: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        decoration: BoxDecoration(
          color: C.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: C.line2),
        ),
        child: Row(children: [
          Text('\$', style: mono(26, color: C.muted)),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _amt,
              focusNode: _focus,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              textInputAction: TextInputAction.done,
              onChanged: _onType,
              onSubmitted: (_) => _lock(),
              style: mono(32, w: FontWeight.w700),
              decoration: const InputDecoration(border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.symmetric(vertical: 12)),
            ),
          ),
        ]),
      ),
      const SizedBox(height: 6),
      Slider(
        value: pos.clamp(0.0, 1.0).toDouble(),
        min: 0,
        max: 1,
        onChanged: (v) {
          _focus.unfocus();
          setState(() {
            pos = v;
            price = fromPos(v);
          });
          _syncText();
        },
      ),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(money(kMin), style: mono(11, color: C.faint)),
        Text('escala logarítmica', style: mono(11, color: C.faint)),
        Text(money(kMax), style: mono(11, color: C.faint)),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        _nudge('÷ 2', 0.5),
        _nudge('− 10%', 0.9),
        _nudge('+ 10%', 1.1),
        _nudge('× 2', 2),
      ]),
      const SizedBox(height: 16),
      PrimaryButton('Fijar precio', onPressed: _lock),
    ]);
  }

  Widget _nudge(String label, double f) => Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 3),
          child: SizedBox(
            height: 44,
            child: OutlinedButton(
              onPressed: () {
                _focus.unfocus();
                _setPrice((price * f).round());
              },
              style: OutlinedButton.styleFrom(
                backgroundColor: C.surface,
                foregroundColor: C.ink,
                padding: EdgeInsets.zero,
                side: const BorderSide(color: C.line2),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(label, style: mono(13)),
            ),
          ),
        ),
      );

  Widget _revealPanel(Product it, LogEntry e) {
    final tier = tierOf(e.base);
    final tc = C.tier(tier);
    final br = <String>['Base ${num0(e.base)}'];
    if (e.bonus > 0) br.add('Exacto +${e.bonus}');
    if (e.mult > 1) br.add('Racha ×${_mult(e.mult)}');
    final delta = e.err.abs() < 0.005 ? 'Clavaste el precio' : '${pct(e.err)} ${e.err > 0 ? 'más caro' : 'más barato'}';
    final hasLink = it.link != null;
    return TweenAnimationBuilder<double>(
      key: ValueKey<int>(game.round),
      tween: Tween<double>(begin: 0, end: 1),
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      builder: (c, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0).toDouble(),
        child: Transform.translate(offset: Offset(0, 18 * (1 - t)), child: child),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(child: Text(verdictOf(e.base, e.bonus), style: sans(32, w: FontWeight.w800, ls: -0.8, color: tc))),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('+${num0(e.pts)}', style: mono(26, w: FontWeight.w700, color: tc)),
          Text(br.join(' · '), style: sans(12, color: C.faint)),
        ]),
      ]),
      const SizedBox(height: 12),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF1B1708),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF5A4513)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Kicker(it.live ? 'Precio en Mercado Libre' : 'Precio de referencia', color: C.gold),
          const SizedBox(height: 4),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: it.p.toDouble()),
            duration: const Duration(milliseconds: 650),
            curve: Curves.easeOutCubic,
            builder: (c, v, _) => Text(money(v), style: mono(34, w: FontWeight.w700, color: C.gold)),
          ),
        ]),
      ),
      const SizedBox(height: 10),
      Panel(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
        child: _Track(real: it.p, guess: e.guess),
      ),
      const SizedBox(height: 12),
      Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
        Text('TU PRECIO', style: mono(11, color: C.faint, ls: 1.2)),
        const SizedBox(width: 10),
        Text(money(e.guess), style: mono(20, w: FontWeight.w700)),
        const SizedBox(width: 10),
        Expanded(child: Text(delta, style: sans(13, color: C.muted))),
      ]),
      const SizedBox(height: 14),
      SecondaryButton(hasLink ? 'Ver publicación en Mercado Libre' : 'Buscar en Mercado Libre',
          onPressed: () => openUrl(context, it.buyUrl)),
      const SizedBox(height: 10),
      PrimaryButton(sending ? 'Enviando…' : (game.done ? 'Ver resultado' : 'Siguiente producto'),
          onPressed: sending ? null : _next),
    ]),
    );
  }
}

/// Recta de precios con el real (dorado) y el tuyo (celeste).
class _Track extends StatelessWidget {
  const _Track({required this.real, required this.guess});
  final int real;
  final int guess;

  double _shift(double pos) => pos < 14 ? -0.12 : (pos > 86 ? -0.88 : -0.5);

  Widget _tag(String text, Color bg, Color fg, double pos, double w, double top) {
    return Positioned(
      left: pos / 100 * w,
      top: top,
      child: FractionalTranslation(
        translation: Offset(_shift(pos), 0),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
          child: Text(text, style: mono(12, w: FontWeight.w700, color: fg)),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rp = toPos(real) * 100;
    final gp = toPos(guess) * 100;
    const ticks = [
      [10000, '10 mil'],
      [100000, '100 mil'],
      [1000000, '1 millón'],
      [5000000, '5 mill.'],
    ];
    return LayoutBuilder(builder: (context, c) {
      final w = c.maxWidth;
      return SizedBox(
        height: 104,
        child: Stack(clipBehavior: Clip.none, children: [
          Positioned(left: 0, right: 0, top: 49, height: 2, child: Container(color: C.line2)),
          Positioned(
            left: math.min(rp, gp) / 100 * w,
            width: (rp - gp).abs() / 100 * w,
            top: 48,
            height: 4,
            child: Container(color: const Color(0x6679C2FF)),
          ),
          Positioned(left: rp / 100 * w - 1, top: 27, width: 2, height: 23, child: Container(color: C.gold)),
          _tag(money(real), C.gold, const Color(0xFF241A00), rp, w, 2),
          Positioned(
            left: gp / 100 * w - 8,
            top: 42,
            width: 16,
            height: 16,
            child: Container(
              decoration: BoxDecoration(
                color: C.bg,
                shape: BoxShape.circle,
                border: Border.all(color: C.accent, width: 3),
              ),
            ),
          ),
          Positioned(
            left: gp / 100 * w,
            top: 62,
            child: FractionalTranslation(
              translation: Offset(_shift(gp), 0),
              child: Text('Tu precio', style: sans(12, color: C.accent)),
            ),
          ),
          for (final t in ticks)
            Positioned(
              left: toPos(t[0] as int) * w,
              top: 86,
              child: FractionalTranslation(
                translation: Offset(_shift(toPos(t[0] as int) * 100), 0),
                child: Text(t[1] as String, style: mono(10, color: C.faint)),
              ),
            ),
        ]),
      );
    });
  }
}
