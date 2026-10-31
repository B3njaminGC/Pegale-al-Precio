import 'package:flutter/material.dart';

import '../core.dart';
import '../env.dart';
import '../net.dart';
import '../theme.dart';
import '../widgets.dart';
import 'rooms.dart';

/// Ranking nacional: el desafío de hoy y la suma de la semana.
class RankScreen extends StatefulWidget {
  const RankScreen({super.key});
  @override
  State<RankScreen> createState() => _RankScreenState();
}

class _RankScreenState extends State<RankScreen> {
  String kind = 'daily';
  RankResult? result;
  String error = '';
  bool loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!env.net.enabled) return;
    final k = kind;
    setState(() {
      loading = true;
      error = '';
      result = null;
    });
    try {
      final key = arDateKey();
      final r = await env.net.top(k, k == 'daily' ? key : weekStartKey(key), 50);
      if (!mounted || kind != k) return;
      setState(() {
        result = r;
        loading = false;
      });
    } catch (e) {
      if (!mounted || kind != k) return;
      setState(() {
        error = errText(e);
        loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final key = arDateKey();
    final lead = kind == 'daily'
        ? 'Desafío del ${prettyDate(key)}. Cuenta la primera partida de cada jugador.'
        : 'Suma de los desafíos de la semana que empezó el lunes ${prettyDate(weekStartKey(key))}.';
    final r = result;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
          children: [
            TopBar(title: 'Ranking Argentina', onBack: () => Navigator.of(context).pop()),
            Row(children: [
              for (final t in const [['daily', 'Hoy'], ['weekly', 'Semana']])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(t[1]),
                    selected: kind == t[0],
                    onSelected: (_) {
                      setState(() => kind = t[0]);
                      _load();
                    },
                    labelStyle: sans(14, w: FontWeight.w600, color: kind == t[0] ? C.accentInk : C.ink),
                    selectedColor: C.accent,
                    backgroundColor: C.surface,
                    side: const BorderSide(color: C.line2),
                    showCheckmark: false,
                  ),
                ),
            ]),
            const SizedBox(height: 12),
            Text(lead, style: sans(13, color: C.muted, h: 1.4)),
            const SizedBox(height: 14),
            if (!env.net.enabled)
              Text('El ranking todavía no está activado en esta versión.', style: sans(14, color: C.muted)),
            if (loading) Text('Cargando…', style: sans(14, color: C.muted)),
            if (error.isNotEmpty) Text(error, style: sans(14, color: C.bad)),
            if (r != null && r.rows.isEmpty)
              Text('Todavía no jugó nadie. Sé el primero en el ranking.', style: sans(14, color: C.muted)),
            if (r != null)
              for (var i = 0; i < r.rows.length; i++) _row(r.rows[i], i, r.me),
            if (r != null && r.rows.length >= 50)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Se muestran los 50 mejores.', style: sans(12, color: C.faint)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(RankRow row, int i, String me) {
    final mine = row.uid == me;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: mine ? const Color(0xFF14243D) : C.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: i == 0 ? C.gold : (mine ? C.accent : C.line)),
      ),
      child: Row(children: [
        SizedBox(width: 32, child: Text('${i + 1}', style: mono(16, w: FontWeight.w700, color: i == 0 ? C.gold : C.muted))),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${row.name}${mine ? ' (vos)' : ''}', style: sans(15, w: FontWeight.w700)),
            if (kind == 'weekly' && row.days > 0) Text('${row.days} desafíos', style: sans(12, color: C.muted)),
          ]),
        ),
        Text(num0(row.score), style: mono(18, w: FontWeight.w700)),
      ]),
    );
  }
}
