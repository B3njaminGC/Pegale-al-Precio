# Desarrollo

Esta guía es para quien quiera tocar el código, compilar o publicar una versión. Si solo querés jugar, el [README](../README.md) alcanza.

## Estructura

| Ruta | Qué tiene |
|---|---|
| `lib/` | La app (Flutter, solo Android, en vertical). `core.dart` tiene la lógica sin pantallas (puntaje, escala de precio, fechas de Argentina, azar repetible, pistas, rachas). `env.dart` guarda el estado local y baja los productos. `net.dart` habla con Firebase por REST. `screens/` son las pantallas; `update/` baja e instala el APK nuevo; `share_card.dart` dibuja la imagen para compartir. |
| `test/` | Pruebas de la app en Dart (`flutter test`). |
| `tests/` | Pruebas de los scripts en Node (`node --test tests/*.test.mjs`), con un Mercado Libre simulado (`mock-ml.mjs`) y fotos de prueba (`fixtures/`). |
| `data/products.json` | Productos y precios. Va dentro del APK y además la app lo baja actualizado desde GitHub (`raw.githubusercontent.com`). Lo escribe el workflow nocturno. Trae además el plan `daily` (5 productos por día). |
| `data/pool-skip.json` | Ids de productos que no tienen ofertas, para no volver a consultarlos cada noche. También lo escribe el workflow. |
| `scripts/` | `fetch-products.mjs` (productos curados de `catalog.json`), `build-pool.mjs` (miles de productos a partir de `pool-seeds*.json`), `diagnostico/` (pruebas manuales de Mercado Libre y Firebase). |
| `database.rules.json` | Reglas de seguridad de Firebase Realtime Database. |
| `ci/debug.keystore` | Llave con la que se firma siempre el APK. |
| `tools/core.reference.js` | Versión en JavaScript de la lógica del puntaje, de cuando el juego era web. Solo sirve para generar los valores de referencia de las pruebas de `test/core_test.dart`. |
| `.github/workflows/` | `verificar.yml` (pruebas en cada push), `build-apk.yml` (compila y publica), `update-products.yml` (actualización nocturna), `probe-*.yml` (diagnósticos manuales). |

La carpeta `android/` **no está en el repositorio**: la genera `flutter create` en cada compilación (ver más abajo) y está en `.gitignore`.

## Probar

No hace falta tener Flutter instalado para colaborar con los scripts:

```bash
node --test tests/*.test.mjs        # scripts de productos, con Mercado Libre simulado, sin internet
```

Para la app hace falta [Flutter](https://docs.flutter.dev/get-started/install) (canal `stable`):

```bash
flutter pub get
flutter analyze --no-fatal-infos
flutter test
```

Para correrla en un celular o emulador hay que generar el proyecto Android una vez:

```bash
flutter create --platforms=android --org com.pegalealprecio --project-name pegale_al_precio .
flutter run
```

Lo que **no** cubren las pruebas automáticas: pantallas y animaciones, Firebase real (ranking y salas), la instalación/actualización del APK, el menú de compartir de Android y los datos que devuelve Mercado Libre de verdad. Eso se prueba a mano en un celular.

## Compilar y publicar una versión

El APK se compila **solo con GitHub Actions** (`build-apk.yml`), no hace falta compilar en la computadora.

1. Hacé los cambios en `main`. En cada push se corren las pruebas (`Verificar`).
2. En **Actions**, **Compilar APK**, **Run workflow**, escribí la versión en el campo `version` (por ejemplo `v2.7.0`). También se publica si se sube un tag que empiece con `v`.
3. El workflow genera el proyecto Android, le agrega el nombre, los permisos (internet, instalar paquetes) y la firma, analiza el código, corre las pruebas (si fallan, se corta), compila el APK, comprueba que la firma sea la de `ci/debug.keystore` y lo publica en **Releases** como `pegale-al-precio.apk`.
4. El número de compilación es el de la corrida de Actions y la versión visible sale de `--dart-define=APP_VERSION`. Si se compila sin escribir versión, la app muestra `bN` y **no avisa de actualizaciones** (solo avisan las versiones con formato `vX.Y.Z`). El campo `version` de `pubspec.yaml` no se usa.
5. El workflow guarda el registro de la compilación en la rama `ci-log` (archivo `ci.log`), útil para ver errores de análisis o de Gradle.

Después de publicar, conviene actualizar el [CHANGELOG](../CHANGELOG.md).

### Sobre la firma

Todas las versiones se firman con `ci/debug.keystore` (contraseña `android`) para que una se instale encima de otra. Es una llave **pública** (está en el repo), así que no impide que alguien arme un APK falso con la misma firma. Si se quisiera una llave privada habría que guardarla como secreto de GitHub, y como la firma cambiaría, todos los usuarios tendrían que desinstalar y reinstalar una vez.

## Firebase (ranking y salas)

Hace falta un proyecto de Firebase gratis. Una sola vez:

1. En [console.firebase.google.com](https://console.firebase.google.com) creá un proyecto (sin Google Analytics).
2. **Authentication**, **Sign-in method**, activá **Anónimo**.
3. **Realtime Database**, **Crear base de datos** (modo bloqueado).
4. En **Reglas**, pegá el contenido de `database.rules.json` y publicá.
5. En la configuración del proyecto agregá una app web y copiá la `apiKey`. La `databaseURL` está arriba de los datos de Realtime Database.
6. Poné esos dos valores en `lib/config.dart` (`kFirebaseApiKey`, `kFirebaseDatabaseUrl`).

La `apiKey` de Firebase **no es un secreto**: identifica el proyecto y va dentro de cualquier app. Lo que protege los datos son las reglas de `database.rules.json`. Conviene, igual, restringir la clave en Google Cloud Console.

Con los dos valores vacíos, las salas y el ranking aparecen apagados y el resto del juego funciona. Para comprobar que todo está bien configurado, usá el workflow manual **Probar Firebase** (`scripts/diagnostico/probe-firebase.mjs`); ojo: escribe datos de prueba en la base real.

## Productos y precios de Mercado Libre

La búsqueda abierta (`/sites/MLA/search`) está cerrada a apps de terceros (da 403 aunque se usen credenciales). Lo que sí funciona con una app de desarrollador gratis es el catálogo de productos (`/products/search`, `/products/{id}/items`), que trae nombre, foto, atributos y ofertas en pesos.

1. En [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar), **Mis aplicaciones**, creá una aplicación.
2. En GitHub, **Settings**, **Secrets and variables**, **Actions**, creá `ML_CLIENT_ID` (App ID) y `ML_CLIENT_SECRET` (clave secreta). Nunca van en el código.
3. El workflow **Actualizar productos** corre todos los días a las 00:05 (Argentina) y también a pedido (con campos para cuántos productos nuevos sumar y cuántos minutos buscar).

Cada corrida hace dos cosas, y commitea `data/products.json` si cambió:

- `fetch-products.mjs` actualiza los productos **curados** de `scripts/catalog.json` (cada entrada tiene la búsqueda `q`, palabras que el nombre debe o no debe tener, y el rango de precio esperado). Si uno falla, conserva el último dato bueno. El resumen de la corrida lista por qué falló cada uno.
- `build-pool.mjs` suma productos nuevos buscando las palabras de `scripts/pool-seeds.json` y `pool-seeds-2.json` (sigue donde quedó la corrida anterior). Se queda con los que tienen marca, foto y al menos 3 ofertas nuevas en pesos; descarta accesorios, usados, repuestos y variantes del mismo modelo; arma una ficha con hasta 3 atributos; y toma como precio la mediana de las ofertas. Refresca los precios con más de 6 días, mantiene el pool en un máximo de 4.000 productos (al llegar al tope deja de sumar) y completa el plan de desafíos diarios de las próximas 2 semanas sin repetir productos. Los productos del plan de hoy en adelante nunca se descartan.

La app juega solo con productos reales (`src: "ml"`) si hay al menos 20.

### Formato de `data/products.json`

```json
{
  "version": 1,
  "updated": "2026-11-12T03:10:00.000Z",
  "site": "MLA",
  "source": "api.mercadolibre.com",
  "daily": { "2026-11-13": ["MLA123", "MLA456", "MLA789", "MLA111", "MLA222"] },
  "pool": { "cursor": 1941, "queries": 1233, "size": 4000 },
  "items": [
    { "id": "MLA123", "n": "Nombre", "c": "Categoría", "s": ["Dato 1", "Dato 2"], "p": 250000,
      "img": "https://http2.mlstatic.com/....jpg", "link": "https://articulo.mercadolibre.com.ar/MLA-1234",
      "src": "ml", "t": "2026-11-12T03:10:00.000Z" }
  ]
}
```

`p` es el precio en pesos, entre 10.000 y 5.000.000 (el rango del juego). La prueba `tests/data.test.mjs` verifica esta forma.

## Cómo funciona el desafío diario

Todos juegan los mismos 5 productos porque salen del plan `daily` del archivo de productos. Si el plan todavía no llegó (o falta algún producto), la app calcula los 5 con una semilla que depende de la fecha, de forma repetible en cualquier celular (`dailyItems` en `core.dart`). La fecha es la de Argentina (UTC-3) y la semana empieza el lunes.

El celular guarda por día el resultado (`pap.daily.<fecha>`) y el progreso (`pap.dailyprog.<fecha>`). Al ranking se sube una sola vez por día; las reglas del servidor rechazan un segundo intento.

## Diagnósticos manuales

`probe-ml.yml` y `probe-firebase.yml` (con sus scripts en `scripts/diagnostico/`) solo se corren a mano. Sirven para ver qué responde hoy la API de Mercado Libre y si Firebase y sus reglas están bien.

## Atribución de IA

El proyecto se desarrolla con ayuda de Claude. Los commits conservan la línea `Co-Authored-By` que corresponde y no se reescribe el historial.
