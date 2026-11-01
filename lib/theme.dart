import 'package:flutter/material.dart';

/// Dirección visual: sala de tasación de noche. Azul tinta, un solo celeste para actuar,
/// dorado reservado para el precio real. La foto va sobre una placa de estudio clara
/// y los números en tipografía monoespaciada para que se lean como cifras.
class C {
  static const Color bg = Color(0xFF090E18);
  static const Color surface = Color(0xFF111A2C);
  static const Color surface2 = Color(0xFF172338);
  static const Color line = Color(0xFF1F2D47);
  static const Color line2 = Color(0xFF2D3F61);
  static const Color ink = Color(0xFFEDF2FA);
  static const Color muted = Color(0xFF8D9BB6);
  static const Color faint = Color(0xFF66748F);
  static const Color accent = Color(0xFF79C2FF);
  static const Color accentInk = Color(0xFF05203A);
  static const Color gold = Color(0xFFFFC53D);
  static const Color good = Color(0xFF35D49A);
  static const Color mid = Color(0xFFE8B04A);
  static const Color bad = Color(0xFFFF6B7B);
  static const Color plate = Color(0xFFEEF1F6);
  static const Color plateInk = Color(0xFF0B1220);

  static Color tier(String t) => t == 'good' ? good : (t == 'mid' ? mid : bad);
}

TextStyle sans(double size, {FontWeight w = FontWeight.w400, Color color = C.ink, double? ls, double? h}) =>
    TextStyle(fontSize: size, fontWeight: w, color: color, letterSpacing: ls, height: h);

TextStyle mono(double size, {FontWeight w = FontWeight.w500, Color color = C.ink, double? ls}) => TextStyle(
      fontFamily: 'monospace',
      fontSize: size,
      fontWeight: w,
      color: color,
      letterSpacing: ls,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: C.bg,
    canvasColor: C.bg,
    colorScheme: const ColorScheme.dark(
      primary: C.accent,
      onPrimary: C.accentInk,
      secondary: C.accent,
      surface: C.surface,
      onSurface: C.ink,
      error: C.bad,
    ),
    sliderTheme: const SliderThemeData(
      trackHeight: 4,
      activeTrackColor: C.accent,
      inactiveTrackColor: C.line,
      thumbColor: C.ink,
      overlayColor: Color(0x3379C2FF),
    ),
    textSelectionTheme: const TextSelectionThemeData(cursorColor: C.accent, selectionHandleColor: C.accent),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: C.surface2,
      contentTextStyle: sans(14),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
  return base;
}
