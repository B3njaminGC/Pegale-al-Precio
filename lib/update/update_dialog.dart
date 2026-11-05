import 'package:flutter/material.dart';

import '../config.dart';
import '../theme.dart';
import '../widgets.dart';
import 'update_installer.dart';

/// Baja el APK dentro de la app (con progreso) y abre el instalador de Android.
/// Si no se puede, ofrece abrir la página de descarga en el navegador.
Future<void> showDownloadDialog(BuildContext context, {required String version, String? apkUrl}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _DownloadDialog(version: version, apkUrl: apkUrl),
  );
}

class _DownloadDialog extends StatefulWidget {
  const _DownloadDialog({required this.version, required this.apkUrl});
  final String version;
  final String? apkUrl;

  @override
  State<_DownloadDialog> createState() => _DownloadDialogState();
}

class _DownloadDialogState extends State<_DownloadDialog> {
  double? _progress;
  String? _error;
  bool _cancelled = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final url = widget.apkUrl;
    if (url == null) {
      _error = 'No se encontró el archivo de la versión.';
      return;
    }
    try {
      final path = await UpdateInstaller.download(
        url,
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
        isCancelled: () => _cancelled,
      );
      if (!mounted || _cancelled) return;
      Navigator.of(context).pop();
      await UpdateInstaller.install(path);
    } catch (_) {
      if (mounted && !_cancelled) {
        setState(() => _error = 'No se pudo descargar. Revisá tu conexión.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;
    return AlertDialog(
      backgroundColor: C.surface,
      title: Text(error == null ? 'Descargando ${widget.version}…' : 'Algo falló', style: sans(18, w: FontWeight.w700)),
      content: error == null
          ? Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LinearProgressIndicator(value: _progress, color: C.accent, backgroundColor: C.line),
                const SizedBox(height: 10),
                Text(
                  _progress == null ? 'Conectando…' : '${(_progress! * 100).floor()} %',
                  style: sans(14, color: C.muted),
                ),
              ],
            )
          : Text(error, style: sans(14, color: C.muted)),
      actions: [
        if (error != null)
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              openUrl(context, kDownloadUrl);
            },
            child: const Text('Abrir en el navegador'),
          ),
        TextButton(
          onPressed: () {
            _cancelled = true;
            Navigator.of(context).pop();
          },
          child: Text(error == null ? 'Cancelar' : 'Cerrar'),
        ),
      ],
    );
  }
}
