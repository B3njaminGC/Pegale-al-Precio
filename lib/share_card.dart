import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:path_provider/path_provider.dart';

import 'core.dart';
import 'theme.dart';

/// Frase corta con la que se comparte el resultado.
String shareHeadline(Game g) {
  final hits = g.log.where((l) => l.base >= 700).length;
  final total = g.items.length;
  if (hits == total) return '¡Le pegué al precio a los $total!';
  if (hits == 0) return 'No le pegué a ninguno… ¿vos podés?';
  return 'Le pegué al precio a $hits de $total';
}

TextPainter _text(String s, double size, Color color, {FontWeight w = FontWeight.w700, double maxWidth = 920, String? family, TextAlign align = TextAlign.center, double? h}) {
  final tp = TextPainter(
    text: TextSpan(text: s, style: TextStyle(fontSize: size, color: color, fontWeight: w, fontFamily: family, height: h, letterSpacing: -0.5)),
    textAlign: align,
    textDirection: TextDirection.ltr,
    maxLines: 3,
    ellipsis: '…',
  )..layout(minWidth: maxWidth, maxWidth: maxWidth);
  return tp;
}

/// Dibuja la tarjeta de resultado (1080 x 1350) y la guarda como PNG en la carpeta temporal.
Future<File> renderShareCard({required String label, required Game g, int streak = 0}) async {
  const w = 1080.0, h = 1350.0;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec, const Rect.fromLTWH(0, 0, w, h));

  c.drawRect(
    const Rect.fromLTWH(0, 0, w, h),
    Paint()..shader = ui.Gradient.linear(Offset.zero, const Offset(w, h), const [Color(0xFF1A2B48), Color(0xFF090E18)]),
  );
  // marco
  c.drawRRect(
    RRect.fromRectAndRadius(const Rect.fromLTWH(36, 36, w - 72, h - 72), const Radius.circular(44)),
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = C.line2,
  );

  var y = 96.0;
  void put(TextPainter tp, {double gap = 0}) {
    tp.paint(c, Offset((w - tp.width) / 2, y));
    y += tp.height + gap;
  }

  put(_text('PEGALE AL PRECIO', 40, C.accent, family: 'monospace', w: FontWeight.w600), gap: 10);
  put(_text(label, 34, C.muted, w: FontWeight.w500), gap: 70);

  put(_text(shareHeadline(g), 84, C.ink, w: FontWeight.w800, h: 1.05, maxWidth: 880), gap: 40);

  // cuadrados del resultado
  final n = g.log.length;
  final sq = n <= 5 ? 120.0 : 92.0;
  const gap = 18.0;
  final rowW = n * sq + (n - 1) * gap;
  var x = (w - rowW) / 2;
  for (final l in g.log) {
    final color = C.tier(tierOf(l.base));
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, y, sq, sq), const Radius.circular(22)), Paint()..color = color);
    x += sq + gap;
  }
  y += sq + 70;

  put(_text('${num0(g.total)}', 180, C.accent, family: 'monospace', w: FontWeight.w700), gap: 0);
  put(_text('puntos · ${rankOf(g.base / g.items.length)}', 44, C.muted, w: FontWeight.w500), gap: 50);

  if (streak >= 2) {
    final badge = streakBadge(streak);
    final txt = badge.isEmpty ? 'Racha de $streak días seguidos' : 'Racha de $streak días · $badge';
    final tp = _text(txt, 38, C.gold, w: FontWeight.w700, maxWidth: 860);
    final bw = tp.width.clamp(0, 860).toDouble();
    final r = RRect.fromRectAndRadius(Rect.fromLTWH((w - bw) / 2 - 28, y - 14, bw + 56, tp.height + 28), const Radius.circular(40));
    c.drawRRect(r, Paint()..color = const Color(0xFF2A220A));
    c.drawRRect(
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = const Color(0xFF5A4513),
    );
    put(tp, gap: 40);
  }

  final foot = _text('¿Le pegás vos? Jugalo gratis', 40, C.ink, w: FontWeight.w600);
  final foot2 = _text('github.com/B3njaminGC/Pegale-al-Precio', 32, C.muted, w: FontWeight.w400, family: 'monospace');
  foot2.paint(c, Offset((w - foot2.width) / 2, h - 96 - foot2.height));
  foot.paint(c, Offset((w - foot.width) / 2, h - 96 - foot2.height - foot.height - 10));

  final img = await rec.endRecording().toImage(w.toInt(), h.toInt());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  if (data == null) throw StateError('No se pudo armar la imagen');
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/pegale-resultado.png');
  await file.writeAsBytes(data.buffer.asUint8List(), flush: true);
  return file;
}
