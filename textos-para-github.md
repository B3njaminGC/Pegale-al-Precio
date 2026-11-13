# Textos para pegar en GitHub

Estas cosas no se pueden editar desde acá: pegalas vos en la web de GitHub y después podés borrar este archivo.

## Descripción del repositorio

(Repositorio, rueda de engranaje al lado de "About", campo **Description**.)

```
Juego para Android: adiviná el precio en pesos de productos reales de Mercado Libre Argentina. Desafío diario, salas online y ranking. Hecho con Flutter.
```

Sitio web (campo **Website**): dejarlo vacío, o el link de Releases: `https://github.com/B3njaminGC/Pegale-al-Precio/releases/latest`

## Topics

```
flutter
dart
android
game
juego
argentina
mercado-libre
mercadolibre
price-guessing
mobile-game
```

## Notas de cada release

Para cada release: **Releases**, abrir el release, **Edit** (lápiz), pegar el texto en la descripción. Los títulos ya están bien (`Pegale al Precio vX.Y.Z`).

### v2.6.0

```
Compartir como imagen, rachas, pistas y un modo nuevo.

- Compartir el resultado como imagen (frase, cuadraditos de color, puntaje y racha).
- Rachas de días seguidos jugando el desafío, con insignias a los 3, 7, 14 y 30 días.
- Pistas a cambio de puntos: un rango de precio amplio (−100) y otro más ajustado (−150 más).
- Modo "¿Más caro o más barato?", con récord guardado en el celular.

Instalación: bajá pegale-al-precio.apk e instalalo encima de la versión anterior. Si tenés una versión anterior a la 2.5.1, bajá este APK a mano; de ahí en adelante la app se actualiza sola desde el aviso del inicio.
```

### v2.5.1

```
Arregla la actualización desde la app.

- Al tocar "Bajar" en el aviso de versión nueva, la descarga se abría en el navegador y se quedaba trabada. Ahora la app baja el APK ella misma, muestra el progreso, comprueba que el archivo esté completo y abre el instalador de Android. Si falla, ofrece abrir el navegador.
- La primera vez, Android pide permiso para "instalar apps desconocidas".

Si tenés la 2.5.0 o anterior, instalá este APK a mano una vez.
```

### v2.5.0

```
Aviso de versión nueva y alias para colaborar.

- Aviso en el inicio cuando hay una versión más nueva publicada.
- Alias de Mercado Pago para colaborar con el proyecto, con botón para copiarlo (es opcional y no desbloquea nada).

Nota: en esta versión el botón "Bajar" abre el navegador; la descarga dentro de la app llegó en la 2.5.1.
```

### v2.4.0

```
Miles de productos y desafío diario sin repetir.

- Catálogo de hasta 4.000 productos reales de Mercado Libre, que se amplía y se refresca solo cada noche.
- El desafío diario sale de un plan armado en el servidor: los mismos 5 productos para todos y sin repetir entre días.
- Las partidas rápidas y las salas no repiten productos que ya viste.
- Íconos para las categorías nuevas.
```

### v2.3.2

```
Subir el resultado al ranking.

- Si tu resultado del desafío no había llegado al ranking, ahora se puede subir con un botón (el de hoy o el de ayer).
- Pestaña "Ayer" en el ranking.
```

### v2.3.1

```
Desafío diario como Wordle.

- Una sola partida por día: el botón queda deshabilitado, hay cuenta regresiva hasta las 00:00 (hora de Argentina) y se retoma donde quedó si salís a la mitad.
- Las partidas siguientes del día son de práctica y no cuentan para el ranking.
```

### v2.3.0

```
Salas online y ranking conectados.

- Las salas y el ranking de Argentina quedan conectados a Firebase.
- Se agrega una prueba de conexión manual para el mantenimiento.
```

### v2.2.0

```
Productos reales de Mercado Libre.

- Los productos, fotos y precios salen del catálogo de Mercado Libre (la búsqueda abierta no está disponible para apps de terceros).
- La app juega solo con productos reales cuando hay suficientes.
```

### v2.1.2

```
Detalles del inicio.

- Scroll firme en el inicio (sin rebote infinito).
- La versión se muestra al pie del inicio.
```

### v2.1.1

```
Arregla el error al instalar encima de otra versión.

- Android rechazaba la instalación ("conflicto con un paquete") porque cada compilación se firmaba con una llave distinta. Ahora el APK se firma siempre con la misma.
- Si te dio ese error con una versión anterior, desinstalá esa versión una sola vez; desde esta se instala encima sin problemas.
```

### v2.1.0

```
Rediseño del inicio.

- Título a la izquierda y tres cartas con productos.
- Animaciones y vibración al jugar.
- Cada versión sube el número de compilación.
```

### v2.0.1

```
Arreglos del inicio.

- El inicio no se dibujaba bien (una fila sin altura).
- Los productos sin foto muestran un ícono de su categoría en vez de texto.
```

### v2.0.0

```
El juego pasa a ser una app de Flutter solo para Android.

- Antes era una página web empaquetada como app; las versiones anteriores son una app distinta y se pueden desinstalar.
- Fotos y precios de Mercado Libre, desafío del día, partida rápida, salas online y ranking de Argentina.
```

### v1.0.0

```
Primera versión: juego de adivinar precios, instalable en Android.

Esta versión es la web empaquetada y quedó superada por la 2.0.0 (Flutter).
```

## Otros ajustes de GitHub que te tocan

- **Security**, **Report a vulnerability**: activá *Private vulnerability reporting* (Settings, Code security) para que funcione lo que dice `CONTRIBUTING.md`.
- **Settings**, **Pages**: si quedó publicada la carpeta `docs/` de la versión web vieja, desactivá Pages (ahora `docs/` solo tiene documentación técnica).
- **Issues**: dejalos activados, el README los usa para avisar productos raros.
- Opcional: en Google Cloud Console, restringí la API key de Firebase a tu app (no es un secreto, pero conviene).
