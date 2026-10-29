# Pegale al Precio

Juego para adivinar cuánto sale un producto en pesos a partir de su ficha técnica. Tiene partida rápida, desafío del día y versus de dos jugadores en un solo celular. Cada producto trae un botón que abre la búsqueda en Mercado Libre Argentina. Este juego no tiene relación con Mercado Libre.

El mismo código sirve para tres cosas: la web (GitHub Pages o itch.io), la app instalable desde el navegador (PWA) y el APK de Android.

## Qué hay en cada carpeta

- `docs/`: el juego. `index.html` es un solo archivo con todo el código, más el manifest, el service worker y los íconos.
- `assets/`: los íconos originales que usa el APK.
- `.github/workflows/build-apk.yml`: el paso a paso que GitHub ejecuta para compilar el APK.
- `package.json` y `capacitor.config.json`: configuración de Capacitor, que empaqueta la web como app Android.

## Generar el APK sin Android Studio

1. Creá un repositorio en GitHub y subí todo el contenido de esta carpeta, incluida la carpeta oculta `.github`.
   Si al arrastrar archivos en la web no sube `.github`, usá **Add file → Create new file**, escribí el nombre `.github/workflows/build-apk.yml` y pegá el contenido del archivo.
2. Andá a la pestaña **Actions**, elegí **Compilar APK** y tocá **Run workflow**. Tarda entre 5 y 10 minutos.
3. Cuando termine, abrí esa corrida y bajá **pegale-al-precio-apk** desde la sección **Artifacts**. Es un zip con el archivo `pegale-al-precio.apk`.
4. Para tener un link de descarga público, creá un release con un tag que empiece con `v`, por ejemplo `v1.0.0` (**Releases → Draft a new release**). El workflow corre solo y adjunta el APK al release.
5. Para instalarlo, pasá el APK al celular y permití instalar apps de orígenes desconocidos cuando Android lo pida.

Es un APK de prueba (debug), bueno para compartir en foros o con amigos. Para subirlo a Google Play hace falta una versión release firmada con tu propia clave.

El APK usa el nombre de paquete `com.pegalealprecio.juego`. Cambialo en `capacitor.config.json` antes de publicar en cualquier tienda.

## Instalarlo desde el navegador (PWA)

1. En el repositorio, andá a **Settings → Pages**, elegí **Deploy from a branch**, la rama `main` y la carpeta `/docs`.
2. Abrí `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` en Chrome del celular.
3. Tocá el menú y elegí **Instalar app** o **Agregar a la pantalla principal**.

## Subirlo a itch.io

1. En itch.io, andá a **Dashboard → Create new project** y en **Kind of project** elegí **HTML**.
2. Subí `pegale-al-precio-itch.zip` y marcá **This file will be played in the browser**.
3. En **Embed options** activá **Mobile friendly** y elegí orientación **Portrait**.

## Cambiar o agregar productos

Está todo en el arreglo `PRODUCTS` al principio del `<script>` de `docs/index.html`:

```js
{n:'Nombre', e:'📱', c:'Categoría', s:['Dato 1','Dato 2','Dato 3'], p:280000, q:'texto-de-busqueda-en-ml'}
```

- `p` es el precio de referencia en pesos, entre 10.000 y 3.000.000.
- `q` es la búsqueda que abre el botón: `https://listado.mercadolibre.com.ar/` seguido de `q`. Usá minúsculas, sin tildes y con guiones.
- Cada producto necesita exactamente 3 datos en `s`.
- Los precios actuales son estimaciones para octubre 2026, con el dólar a unos $1.560. Conviene revisarlos de vez en cuando.

Si cambiás el juego y ya lo tenías instalado como PWA, subí el número de `CACHE` en `docs/sw.js` para que los celulares bajen la versión nueva.

## Detalles del APK

- Queda fijo en vertical.
- El botón Atrás de Android vuelve al inicio, y desde el inicio cierra la app.
- Los links a Mercado Libre se abren fuera del juego, en el navegador o en la app de Mercado Libre si la tenés instalada.
- Las tipografías se bajan de Google Fonts. Sin internet el juego funciona igual, pero con las del sistema.
