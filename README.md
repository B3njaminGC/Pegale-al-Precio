# Pegale al Precio

Juego para celular (Android) en el que adivinás el precio en pesos de productos reales que se venden en Mercado Libre Argentina. Ves la foto y la ficha, fijás tu precio y se revela el real, con el link a la publicación.

- **Desafío del día**: 5 productos iguales para todo el país. En el ranking cuenta la primera partida de cada día.
- **Partida rápida**: 8 productos al azar.
- **Salas online**: creás una sala, mandás el código y cada uno juega a su hora. La tabla se arma sola a medida que terminan.
- **Ranking Argentina**: del día y de la semana.

Juego independiente, sin relación con Mercado Libre. App hecha con Flutter, solo para celular.

## Cómo está armado

| Carpeta | Qué tiene |
|---|---|
| `lib/` | La app (Flutter): pantallas, puntaje, conexión online |
| `test/` | Pruebas de la lógica (puntaje, desafío del día, fechas) |
| `data/products.json` | Productos y precios del día. Va dentro de la app y además la app lo baja actualizado |
| `scripts/` | `catalog.json` (qué productos se buscan) y `fetch-products.mjs` (trae precios y fotos de Mercado Libre) |
| `database.rules.json` | Reglas de seguridad de Firebase |
| `.github/workflows/` | `build-apk.yml` compila el APK; `update-products.yml` actualiza los precios cada día |
| `ci/debug.keystore` | Firma con la que se compila el APK (la misma siempre, así se puede actualizar sin desinstalar) |

## Bajar el APK

1. En GitHub, pestaña **Actions**, **Compilar APK**, la última corrida verde: abajo, en **Artifacts**, está `pegale-al-precio-apk`.
2. Para tenerlo siempre en **Releases**: creá un release nuevo con un tag que empiece con `v` (por ejemplo `v2.0.0`). El workflow compila y adjunta `pegale-al-precio.apk` solo.
3. En el celu: abrí el APK y permití "instalar apps de esta fuente".

Si ya tenías instalada la versión anterior (la de Capacitor), son apps distintas: podés desinstalarla.

## Salas online y ranking (Firebase)

Hace falta un proyecto de Firebase gratis. Una sola vez:

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com) y creá un proyecto (sin Google Analytics).
2. **Authentication**, **Sign-in method**, activá **Anónimo**.
3. **Realtime Database**, **Crear base de datos** (elegí una región y modo bloqueado).
4. En la pestaña **Reglas**, pegá todo el contenido de `database.rules.json` y publicá.
5. **Configuración del proyecto** (la ruedita), **General**, **Tus apps**, agregá una app web (`</>`). Copiá `apiKey`. La `databaseURL` está en Realtime Database, arriba de los datos (algo como `https://tu-proyecto-default-rtdb.firebaseio.com`).
6. Pegá esas dos cosas en `lib/config.dart` (`kFirebaseApiKey` y `kFirebaseDatabaseUrl`). Al guardar, GitHub compila un APK nuevo solo.

Mientras esos datos estén vacíos, las salas y el ranking aparecen apagados y el resto del juego funciona igual.

Límites a tener en cuenta: el ranking confía en lo que manda el celular (las reglas limitan el puntaje máximo, una sola partida por día y que cada uno escriba solo lo suyo, pero un jugador con conocimientos podría falsear su puntaje). Las salas no se borran solas.

## Precios y fotos reales de Mercado Libre

La búsqueda abierta de Mercado Libre (`/sites/MLA/search`) está cerrada a apps de terceros: da error 403 aunque uses credenciales. Lo que sí funciona con una app de desarrollador gratis es el **catálogo de productos** (`/products/search` y `/products/{id}/items`), que trae el nombre, la foto y las ofertas con precio en pesos. Es lo que usa el script.

1. Entrá a [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar), **Mis aplicaciones**, **Crear aplicación**.
2. Copiá el **App ID** y la **Clave secreta**.
3. En GitHub: **Settings**, **Secrets and variables**, **Actions**, **New repository secret**: `ML_CLIENT_ID` y `ML_CLIENT_SECRET`.
4. En **Actions**, **Actualizar productos**, **Run workflow**. El resumen de la corrida muestra una tabla con el producto elegido de cada búsqueda y, abajo, por qué no se pudo actualizar cada uno de los que fallaron. Si alguno está mal, ajustá `scripts/catalog.json` (`q`, `must`, `not`, `lo`, `hi`).

Corre todos los días a la madrugada y guarda `data/products.json`. Si un producto no se encuentra, queda con el último dato bueno (o con el precio estimado y sin foto). Si hay al menos 20 productos con datos reales, la app juega solo con esos.

## Desarrollo

Se necesita Flutter. El APK se puede compilar sin instalar nada, con GitHub Actions. Para probar en la compu:

```bash
flutter create --platforms=android --org com.pegalealprecio --project-name pegale_al_precio .
flutter pub get
flutter test
flutter run
```

Los scripts de precios se prueban con `node --test tests/*.test.mjs` (usan un Mercado Libre simulado, no necesitan internet).

## Puntaje

Base = `1000 · e^(−2,2 · |ln(tu precio / precio real)|)`. Si el error es de hasta 3% hay +200. Las rachas (puntaje base de 700 o más) multiplican hasta ×1,5. El máximo por producto es 1.800.
