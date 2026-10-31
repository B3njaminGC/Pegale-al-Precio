import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'env.dart';
import 'screens/home.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: C.bg,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  var failed = false;
  try {
    await env.init();
  } catch (_) {
    failed = true;
  }
  runApp(PapApp(initFailed: failed || env.products.isEmpty));
}

class PapApp extends StatelessWidget {
  const PapApp({super.key, required this.initFailed});
  final bool initFailed;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Pegale al Precio',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: HomeScreen(initFailed: initFailed),
      );
}
