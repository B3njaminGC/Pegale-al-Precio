import 'dart:async';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../config.dart';
import '../core.dart';
import '../env.dart';
import '../theme.dart';
import '../widgets.dart';
import 'play.dart';
import 'rooms.dart';

/// Una sala: se juega a la hora de cada uno y la tabla se actualiza sola.
class RoomScreen extends StatefulWidget {
  const RoomScreen({super.key, required this.code});
  final String code;
  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> with WidgetsBindingObserver {
  Room? room;
  String error = '';
  Timer? _poll;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    if (_loading) return;
    _loading = true;
    try {
      final r = await env.net.getRoom(widget.code);
      if (!mounted) return;
      setState(() {
        room = r;
        error = r == null ? 'Esta sala ya no existe.' : '';
      });
    } catch (e) {
      if (mounted) setState(() => error = errText(e));
    }
    _loading = false;
  }

  Map<String, dynamic>? get _local {
    final r = env.getJson('pap.room.${widget.code}');
    return r is Map ? Map<String, dynamic>.from(r) : null;
  }

  Future<void> _play() async {
    final r = room;
    if (r == null || r.items.isEmpty) return;
    final result = await Navigator.of(context).push<String?>(MaterialPageRoute<String?>(
      builder: (_) => PlayScreen(mode: 'room', items: r.items, roomCode: widget.code, saved: _local),
    ));
    if (!mounted) return;
    if (result == 'sendfail') {
      setState(() => error = 'Tu resultado no se pudo enviar todavía. Tocá "Enviar mi resultado" cuando tengas conexión.');
    }
    _refresh();
  }

  Future<void> _sendSaved() async {
    final local = _local;
    if (local == null) return;
    try {
      final log = (local['log'] as List).map((e) => (e as Map)['guess']).toList();
      await env.net.pushProgress(widget.code, {
        'round': local['round'],
        'done': true,
        'score': local['total'],
        'picks': log,
      });
      if (mounted) setState(() => error = '');
      _refresh();
    } catch (e) {
      if (mounted) setState(() => error = errText(e));
    }
  }

  void _share() {
    Share.share('Jugá conmigo a Pegale al Precio. Código de la sala: ${widget.code}\nBajá la app: $kDownloadUrl');
  }

  Widget _cta(Room r, RoomPlayer? me) {
    final n = r.items.length;
    if (n == 0) return const SizedBox.shrink();
    final local = _local;
    final lr = local == null ? 0 : (local['round'] as num).toInt();
    if (local != null && lr >= n) {
      if (me != null && me.done) return const SizedBox.shrink();
      return PrimaryButton('Enviar mi resultado', onPressed: _sendSaved);
    }
    if (local != null && lr > 0) {
      return PrimaryButton('Seguir jugando · producto ${lr + 1} de $n', onPressed: _play);
    }
    return PrimaryButton('Jugar mis $n productos', onPressed: _play);
  }

  @override
  Widget build(BuildContext context) {
    final r = room;
    final uid = env.net.uid;
    RoomPlayer? me;
    if (r != null) {
      for (final p in r.players) {
        if (p.uid == uid) me = p;
      }
    }
    final done = r == null ? <RoomPlayer>[] : (r.players.where((p) => p.done).toList()
      ..sort((a, b) {
        final c = b.score.compareTo(a.score);
        return c != 0 ? c : a.t.compareTo(b.t);
      }));
    final rest = r == null ? <RoomPlayer>[] : (r.players.where((p) => !p.done).toList()
      ..sort((a, b) {
        final c = b.round.compareTo(a.round);
        return c != 0 ? c : a.t.compareTo(b.t);
      }));

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
          children: [
            TopBar(title: 'Sala', onBack: () => Navigator.of(context).pop()),
            Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Kicker('Código de la sala'),
                const SizedBox(height: 6),
                Text(widget.code, style: mono(38, w: FontWeight.w700, color: C.accent, ls: 6)),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: SecondaryButton('Compartir', height: 44, onPressed: _share)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: SecondaryButton('Copiar código',
                        height: 44, onPressed: () => copyText(context, widget.code, 'Código copiado')),
                  ),
                ]),
              ]),
            ),
            if (error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(error, style: sans(14, color: C.bad, h: 1.35)),
            ],
            const SizedBox(height: 14),
            if (r != null) _cta(r, me),
            const SizedBox(height: 18),
            Row(children: [
              const Kicker('Tabla'),
              const Spacer(),
              if (r != null) Text('${done.length} de ${r.players.length} terminaron', style: mono(11, color: C.faint)),
            ]),
            const SizedBox(height: 8),
            if (r == null && error.isEmpty) Text('Cargando la sala…', style: sans(14, color: C.muted)),
            if (r != null && r.players.isEmpty) Text('Todavía no hay jugadores.', style: sans(14, color: C.muted)),
            if (r != null)
              for (var i = 0; i < done.length; i++) _doneRow(r, done[i], i, uid),
            if (r != null)
              for (final p in rest) _waitRow(r, p, uid),
            const SizedBox(height: 12),
            if (r != null)
              Text(
                r.players.length < 2
                    ? 'Mandá el código para que se sumen. Cada uno juega a su hora y la tabla se actualiza sola.'
                    : 'La tabla se actualiza sola. Tocá un resultado para ver cada precio.',
                style: sans(12, color: C.faint, h: 1.4),
              ),
          ],
        ),
      ),
    );
  }

  Widget _rowShell(bool mine, bool first, Widget child) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: mine ? const Color(0xFF14243D) : C.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: first ? C.gold : (mine ? C.accent : C.line)),
        ),
        clipBehavior: Clip.antiAlias,
        child: child,
      );

  Widget _doneRow(Room r, RoomPlayer p, int i, String? uid) {
    final mine = p.uid == uid;
    final err = avgError(p.picks, r.items);
    final head = Row(children: [
      SizedBox(width: 28, child: Text('${i + 1}', style: mono(16, w: FontWeight.w700, color: i == 0 ? C.gold : C.muted))),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${p.name}${mine ? ' (vos)' : ''}', style: sans(15, w: FontWeight.w700)),
          Text(err == null ? 'Terminó' : 'Error medio ${pct(err)}', style: sans(12, color: C.muted)),
        ]),
      ),
      Text(num0(p.score), style: mono(18, w: FontWeight.w700)),
    ]);
    final picks = p.picks ?? <int>[];
    final det = <Widget>[];
    for (var k = 0; k < picks.length && k < r.items.length; k++) {
      det.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(r.items[k].n, style: sans(13, color: C.muted))),
          const SizedBox(width: 8),
          Text('${money(picks[k])} / ${money(r.items[k].p)}', style: mono(12)),
        ]),
      ));
    }
    return _rowShell(
      mine,
      i == 0,
      Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
          iconColor: C.muted,
          collapsedIconColor: C.faint,
          shape: const Border(),
          collapsedShape: const Border(),
          title: head,
          children: det.isEmpty ? <Widget>[Text('Sin detalle.', style: sans(12, color: C.faint))] : det,
        ),
      ),
    );
  }

  Widget _waitRow(Room r, RoomPlayer p, String? uid) {
    final mine = p.uid == uid;
    final n = r.items.length;
    final st = p.round > 0
        ? 'Jugando · va por el producto ${p.round + 1 > n ? n : p.round + 1} de $n'
        : 'Todavía no empezó';
    return _rowShell(
      mine,
      false,
      Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          SizedBox(width: 28, child: Text('·', style: mono(16, color: C.faint))),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${p.name}${mine ? ' (vos)' : ''}', style: sans(15, w: FontWeight.w700)),
              Text(st, style: sans(12, color: C.muted)),
            ]),
          ),
          Text('en juego', style: mono(12, color: C.faint)),
        ]),
      ),
    );
  }
}
