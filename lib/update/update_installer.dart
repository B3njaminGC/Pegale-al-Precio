import 'dart:async';
import 'dart:io';

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

/// Descarga el APK de una release y lanza el instalador de Android.
class UpdateInstaller {
  UpdateInstaller._();

  /// Baja [url] a la caché y devuelve la ruta. Comprueba que el tamaño
  /// recibido sea el anunciado, para no instalar un archivo cortado.
  static Future<String> download(
    String url, {
    required void Function(double progress) onProgress,
    required bool Function() isCancelled,
  }) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/pegale-update.apk');
    if (await file.exists()) await file.delete();

    final client = HttpClient()..connectionTimeout = const Duration(seconds: 20);
    try {
      final request = await client.getUrl(Uri.parse(url));
      request.followRedirects = true;
      request.maxRedirects = 5;
      final response = await request.close();
      if (response.statusCode != 200) {
        throw HttpException('HTTP ${response.statusCode}');
      }
      final total = response.contentLength;
      final sink = file.openWrite();
      var received = 0;
      try {
        await for (final chunk in response.timeout(const Duration(seconds: 30))) {
          if (isCancelled()) break;
          sink.add(chunk);
          received += chunk.length;
          if (total > 0) onProgress(received / total);
        }
      } finally {
        await sink.close();
      }
      if (isCancelled()) {
        if (await file.exists()) await file.delete();
        return file.path;
      }
      if (total > 0 && received != total) {
        throw HttpException('Descarga incompleta ($received de $total bytes)');
      }
      return file.path;
    } finally {
      client.close(force: true);
    }
  }

  /// Abre el instalador del sistema (pide el permiso "instalar apps" la
  /// primera vez).
  static Future<void> install(String path) async {
    await OpenFilex.open(path, type: 'application/vnd.android.package-archive');
  }
}
