import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core.dart';
import 'theme.dart';

void toast(BuildContext context, String msg) {
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(content: Text(msg), duration: const Duration(milliseconds: 2200)));
}

Future<void> copyText(BuildContext context, String text, String okMsg) async {
  await Clipboard.setData(ClipboardData(text: text));
  if (context.mounted) toast(context, okMsg);
}

Future<void> openUrl(BuildContext context, String url) async {
  var ok = false;
  try {
    ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  } catch (_) {}
  if (!ok && context.mounted) toast(context, 'No se pudo abrir el link');
}

class Kicker extends StatelessWidget {
  const Kicker(this.text, {super.key, this.color = C.muted});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: mono(11, w: FontWeight.w500, color: color, ls: 1.2));
}

class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.color = C.surface, this.border = C.line});
  final Widget child;
  final EdgeInsets padding;
  final Color color;
  final Color border;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: padding,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: border),
        ),
        child: child,
      );
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton(this.label, {super.key, required this.onPressed});
  final String label;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: 54,
        child: ElevatedButton(
          onPressed: onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: C.accent,
            foregroundColor: C.accentInk,
            disabledBackgroundColor: C.line,
            disabledForegroundColor: C.faint,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            textStyle: sans(16, w: FontWeight.w700),
          ),
          child: Text(label),
        ),
      );
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton(this.label, {super.key, required this.onPressed, this.height = 50});
  final String label;
  final VoidCallback? onPressed;
  final double height;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: height,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            backgroundColor: C.surface2,
            foregroundColor: C.ink,
            disabledForegroundColor: C.faint,
            side: const BorderSide(color: C.line2),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            textStyle: sans(15, w: FontWeight.w600),
          ),
          child: Text(label, textAlign: TextAlign.center),
        ),
      );
}

/// Barra superior de las pantallas secundarias.
class TopBar extends StatelessWidget {
  const TopBar({super.key, required this.title, required this.onBack});
  final String title;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 14),
        child: Row(children: [
          InkWell(
            onTap: onBack,
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(2, 8, 12, 8),
              child: Row(children: [
                const Icon(Icons.arrow_back_ios_new_rounded, size: 16, color: C.muted),
                const SizedBox(width: 6),
                Text('Volver', style: sans(14, color: C.muted)),
              ]),
            ),
          ),
          const Spacer(),
          Text(title, style: sans(15, w: FontWeight.w600)),
          const Spacer(),
          const SizedBox(width: 74),
        ]),
      );
}

/// Foto del producto sobre una placa de estudio clara. Sin foto muestra la categoría.
class Plate extends StatelessWidget {
  const Plate(this.product, {super.key, this.aspect = 1.25, this.radius = 14, this.pad = 14, this.small = false});
  final Product product;
  final double aspect;
  final double radius;
  final double pad;
  final bool small;

  Widget _placeholder() => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(product.c.isEmpty ? 'Producto' : product.c,
              style: sans(small ? 11 : 17, w: FontWeight.w700, color: C.plateInk), textAlign: TextAlign.center),
          if (!small) const SizedBox(height: 2),
          if (!small) Text('Foto no disponible', style: sans(12, color: const Color(0xFF5B677F))),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final ph = _placeholder();
    final url = product.img;
    final child = url == null
        ? ph
        : Padding(
            padding: EdgeInsets.all(pad),
            child: Image.network(
              url,
              fit: BoxFit.contain,
              errorBuilder: (c, e, s) => ph,
              loadingBuilder: (c, w, prog) => prog == null
                  ? w
                  : const Center(
                      child: SizedBox(
                          width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: C.accent))),
            ),
          );
    return AspectRatio(
      aspectRatio: aspect,
      child: Container(
        decoration: BoxDecoration(color: C.plate, borderRadius: BorderRadius.circular(radius)),
        clipBehavior: Clip.antiAlias,
        child: child,
      ),
    );
  }
}
