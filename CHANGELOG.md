# Registro de cambios

Todos los cambios importantes del proyecto se anotan acá. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones siguen la numeración `X.Y.Z` de los [releases](https://github.com/B3njaminGC/Pegale-al-Precio/releases). Las fechas son de Argentina.

## [Sin publicar]

### Añadido
- Verificación automática en cada push (workflow `Verificar`): sintaxis de los scripts, pruebas de Node, `flutter analyze` y `flutter test`.
- Pruebas nuevas de la lógica del juego y una prueba que revisa la forma de `data/products.json` y que el plan diario no repita productos.
- Formularios de GitHub para reportar errores, sugerir mejoras y avisar de productos raros.
- `LICENSE` (MIT), `CONTRIBUTING.md`, `docs/desarrollo.md` y este registro de cambios.

### Cambiado
- El README ahora está pensado para quien usa el juego; lo técnico pasó a `docs/desarrollo.md`.
- La compilación del APK se corta si fallan las pruebas.
- Los scripts de diagnóstico pasaron a `scripts/diagnostico/`.
- `.gitignore` reordenado y ampliado (datos personales y secretos, Flutter, Node, sistema).

### Corregido
- Tres avisos menores del analizador de código.

## [2.6.0] - 2026-11-11

### Añadido
- Compartir el resultado como imagen (con frase, cuadraditos de color, puntaje y racha).
- Rachas de días seguidos jugando el desafío, con insignias a los 3, 7, 14 y 30 días.
- Pistas a cambio de puntos: un rango de precio amplio (−100) y otro más ajustado (−150 más).
- Modo "¿Más caro o más barato?", con récord guardado en el celular.

### Corregido
- La compilación fallaba con las herramientas de Android actuales; el workflow pasó a Java 21.

## [2.5.1] - 2026-11-04

### Corregido
- Al tocar "Bajar" en el aviso de versión nueva, la descarga se abría en el navegador y se quedaba trabada. Ahora la app baja el APK ella misma, muestra el progreso, comprueba que el archivo esté completo y abre el instalador de Android (con la opción de abrir el navegador si falla).

### Añadido
- Permiso de Android para instalar paquetes (necesario para abrir el instalador).

## [2.5.0] - 2026-11-03

### Añadido
- Aviso en el inicio cuando hay una versión nueva publicada.
- Alias de Mercado Pago para colaborar con el proyecto, con botón para copiarlo.

## [2.4.0] - 2026-11-02

### Añadido
- Catálogo de miles de productos reales (hasta 4.000), que se amplía y se refresca solo cada noche.
- Plan de desafíos diarios armado en el servidor, sin repetir productos entre días.
- Las partidas rápidas y las salas no repiten productos ya vistos.

### Cambiado
- Los productos se guardan en un archivo en el celular y no en las preferencias.
- Íconos para las categorías nuevas.

## [2.3.2] - 2026-11-02

### Corregido
- El resultado del desafío que no se había subido al ranking (por ejemplo, el jugado antes de configurar Firebase) ahora se puede subir con un botón, hoy o al día siguiente.

### Añadido
- Pestaña "Ayer" en el ranking.

## [2.3.1] - 2026-11-01

### Cambiado
- El desafío diario se juega una sola vez por día: el botón queda deshabilitado, hay cuenta regresiva hasta las 00:00 y se retoma donde quedó si se sale a la mitad. Las partidas siguientes del día son de práctica y no cuentan para el ranking.

## [2.3.0] - 2026-11-01

### Añadido
- Salas online y ranking conectados a Firebase, con una prueba de conexión manual.

## [2.2.0] - 2026-11-01

### Cambiado
- Los productos, fotos y precios salen del catálogo de Mercado Libre (la búsqueda abierta no está disponible para apps de terceros). La app juega solo con productos reales cuando hay suficientes.

### Añadido
- Diagnósticos manuales de la API de Mercado Libre.

## [2.1.2] - 2026-11-01

### Cambiado
- Scroll firme en el inicio (sin rebote infinito).
- La versión se muestra al pie del inicio.

## [2.1.1] - 2026-11-01

### Corregido
- Android rechazaba instalar una versión encima de otra por conflicto de firma: ahora el APK se firma siempre con la misma llave y la compilación se corta si no coincide.

## [2.1.0] - 2026-11-01

### Cambiado
- Rediseño del inicio: título a la izquierda y tres cartas con productos.
- Animaciones y vibración al jugar.
- Cada versión sube el número de compilación.

## [2.0.1] - 2026-11-01

### Corregido
- El inicio no se dibujaba bien (una fila sin altura).
- Los productos sin foto muestran un ícono de su categoría en vez de texto.

## [2.0.0] - 2026-11-01

### Cambiado
- El juego pasa a ser una app de Flutter solo para Android (antes era una página web empaquetada como app).

### Añadido
- Fotos y precios de Mercado Libre, desafío del día, partida rápida, salas online y ranking de Argentina, con reglas de seguridad de Firebase.
- El workflow de compilación publica el release por su cuenta.

## [1.0.0] - 2026-10-29

### Añadido
- Primera versión: juego de adivinar precios, instalable en Android, con el workflow que compila el APK.

[Sin publicar]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.6.0...HEAD
[2.6.0]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.5.1...v2.6.0
[2.5.1]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.3.2...v2.4.0
[2.3.2]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.1.2...v2.2.0
[2.1.2]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/B3njaminGC/Pegale-al-Precio/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/B3njaminGC/Pegale-al-Precio/releases/tag/v1.0.0
