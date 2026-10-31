import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../config.dart';
import '../core.dart';
import '../env.dart';
import '../net.dart';
import '../theme.dart';
import '../widgets.dart';
import 'play.dart';
import 'rank.dart';

enum _Board { none, needName, sending, done, error }

/// Resultado de una partida del desafío o rápida.
class EndScreen extends StatefulWidget {
  const EndScreen({super.key, required this.game, required this.mode, required this.practice});
  final Game game;
  final String mode;
  final bool practice;

  @override
  State<EndScreen> createState() => _EndScreenState();
}

class _EndScreenState extends State<EndScreen> {
  final TextEditingController _nick = TextEditingController();
  String note = '';
  _Board board = _Board.none;
  String boardText = '';

  bool get daily => widget.mode == 'daily';
  Game get g => widget.game;

  @override
  void initState() {
    super.initState();
    if (!daily) {
      final bestRaw = env.prefs.getInt('pap.best') ?? 0;
      if (g.total > bestRaw) {
        env.prefs.setInt('pap.best', g.total);
        note = bestRaw > 0 ? 'Nuevo récord personal' : 'Primer récord guardado';
      } else {
        note = 'Tu récord: ${num0(bestRaw)} puntos';
      }
    } else if (widget.practice) {
      note = 'Partida de práctica. En el ranking cuenta tu primera partida del día.';
    } else {
      env.setJson('pap.daily.${arDateKey()}', {'score': g.total, 'base': g.base, 'grid': shareGrid(g.log)});
    }
    _initBoard();
  }

  @override
  void dispose() {
    _nick.dispose();
    super.dispose();
  }

  Map<String, dynamic>? _rec() {
    final r = env.getJson('pap.daily.${arDateKey()}');
    return r is Map ? Map<String, dynamic>.from(r) : null;
  }

  void _initBoard() {
    if (!daily || widget.practice || !env.net.enabled) return;
    final rec = _rec();
    if (rec == null) return;
    if (rec['submitted'] == true) {
      final rank = rec['rank'];
      final of = rec['of'];
      boardText = rec['status'] == 'exists'
          ? 'Ya tenías un resultado de hoy en el ranking.'
          : (rank is num
              ? 'Quedaste puesto ${rank.toInt()} de ${of is num ? of.toInt() : '?'}${of is num && of >= 50 ? '+' : ''} jugadores de hoy.'
              : 'Entraste al ranking de hoy, fuera del top 50.');
      board = _Board.done;
      return;
    }
    if (env.name.isEmpty) {
      board = _Board.needName;
      return;
    }
    _submit();
  }

  Future<void> _submit() async {
    final key = arDateKey();
    final rec = _rec();
    if (rec == null || env.name.isEmpty) return;
    setState(() {
      board = _Board.sending;
      boardText = 'Enviando tu resultado…';
    });
    try {
      final score = (rec['score'] as num).toInt();
      final status = await env.net.submitDaily(key, env.name, score);
      if (status == 'ok') {
        try {
          await env.net.submitWeekly(weekStartKey(key), key, env.name, score);
        } catch (_) {}
      }
      final t = await env.net.top('daily', key, 50);
      var idx = -1;
      for (var i = 0; i < t.rows.length; i++) {
        if (t.rows[i].uid == t.me) idx = i;
      }
      rec['submitted'] = true;
      rec['status'] = status;
      rec['rank'] = idx >= 0 ? idx + 1 : null;
      rec['of'] = t.rows.length;
      await env.setJson('pap.daily.$key', rec);
      if (!mounted) return;
      setState(_initBoard);
    } on NetError {
      if (mounted) {
        setState(() {
          board = _Board.error;
          boardText = 'No se pudo enviar tu resultado. Revisá tu conexión.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          board = _Board.error;
          boardText = 'No se pudo enviar tu resultado. Revisá tu conexión.';
        });
      }
    }
  }

  void _saveNick() {
    final n = sanitizeName(_nick.text);
    if (n.isEmpty) {
      toast(context, 'Escribí un apodo');
      return;
    }
    env.setName(n).then((_) => _submit());
  }

  String get _label => daily ? 'Desafío del ${prettyDate(arDateKey())}' : 'Partida rápida';

  void _share() {
    final text = 'Pegale al Precio · $_label\n${num0(g.total)} puntos · ${rankOf(g.base / g.items.length)}\n${shareGrid(g.log)}\n$kDownloadUrl';
    Share.share(text);
  }

  Widget _boardPanel() {
    if (board == _Board.none) return const SizedBox.shrink();
    Widget body;
    if (board == _Board.needName) {
      body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Poné un apodo para que tu resultado entre al ranking de hoy.', style: sans(14, color: C.muted)),
        const SizedBox(height: 10),
        TextField(
          controller: _nick,
          maxLength: 14,
          style: sans(16),
          decoration: _nickDecoration(),
        ),
        const SizedBox(height: 4),
        PrimaryButton('Entrar al ranking', onPressed: _saveNick),
      ]);
    } else if (board == _Board.error) {
      body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(boardText, style: sans(14, color: C.muted)),
        const SizedBox(height: 10),
        SecondaryButton('Reintentar', onPressed: _submit, height: 44),
      ]);
    } else if (board == _Board.done) {
      body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(boardText, style: sans(14, color: C.muted)),
        const SizedBox(height: 10),
        SecondaryButton('Ver el ranking', height: 44, onPressed: () {
          Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RankScreen()));
        }),
      ]);
    } else {
      body = Text(boardText, style: sans(14, color: C.muted));
    }
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Kicker('Ranking Argentina', color: C.accent),
          const SizedBox(height: 8),
          body,
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 28),
          children: [
            Kicker(_label),
            const SizedBox(height: 10),
            Text(rankOf(g.base / g.items.length), style: sans(34, w: FontWeight.w800, ls: -1, h: 1.05)),
            const SizedBox(height: 6),
            Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
              Text(num0(g.total), style: mono(44, w: FontWeight.w700, color: C.accent)),
              const SizedBox(width: 8),
              Text('puntos', style: sans(15, color: C.muted)),
            ]),
            if (note.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(note, style: sans(13, color: C.muted)),
            ],
            const SizedBox(height: 4),
            Text(shareGrid(g.log), style: const TextStyle(fontSize: 22, letterSpacing: 2)),
            _boardPanel(),
            const SizedBox(height: 18),
            for (var i = 0; i < g.log.length; i++) _recapRow(g.items[i], g.log[i]),
            const SizedBox(height: 14),
            PrimaryButton(daily ? 'Jugar una partida rápida' : 'Jugar de nuevo', onPressed: () {
              Navigator.of(context).pushReplacement(PlayScreen.quickRoute());
            }),
            const SizedBox(height: 10),
            SecondaryButton('Compartir resultado', onPressed: _share),
            const SizedBox(height: 10),
            SecondaryButton('Volver al inicio', onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst)),
          ],
        ),
      ),
    );
  }

  Widget _recapRow(Product it, LogEntry l) {
    final tc = C.tier(tierOf(l.base));
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        SizedBox(width: 60, child: Plate(it, aspect: 1, radius: 10, pad: 5, small: true)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(it.n, style: sans(14, w: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
            Text('Vos ${money(l.guess)} · real ${money(l.real)}', style: sans(12, color: C.muted)),
            InkWell(
              onTap: () => openUrl(context, it.buyUrl),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Text('Ver en Mercado Libre', style: sans(12, color: C.accent)),
              ),
            ),
          ]),
        ),
        const SizedBox(width: 8),
        Text('+${num0(l.pts)}', style: mono(15, w: FontWeight.w700, color: tc)),
      ]),
    );
  }
}

InputDecoration _nickDecoration() => InputDecoration(
      hintText: 'Tu apodo',
      hintStyle: sans(16, color: C.faint),
      filled: true,
      fillColor: C.bg,
      counterStyle: sans(11, color: C.faint),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: C.line2)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: C.line2)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: C.accent)),
    );
