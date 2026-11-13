# Pegale al Precio

[![Verificar](https://github.com/B3njaminGC/Pegale-al-Precio/actions/workflows/verificar.yml/badge.svg)](https://github.com/B3njaminGC/Pegale-al-Precio/actions/workflows/verificar.yml)
[![Última versión](https://img.shields.io/github/v/release/B3njaminGC/Pegale-al-Precio?label=versi%C3%B3n)](https://github.com/B3njaminGC/Pegale-al-Precio/releases/latest)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

Juego para celular Android: ves la foto y la ficha de un producto real que se vende en Mercado Libre Argentina, fijás cuánto creés que cuesta (en pesos) y el juego te muestra el precio real y te da puntos según qué tan cerca estuviste.

## Qué es y qué no es

- **Es** un juego gratis, sin publicidad y sin cuentas. Los productos, fotos y precios salen del catálogo público de Mercado Libre Argentina.
- **No es** una app de Mercado Libre ni tiene relación con la empresa. Tampoco es una tienda ni un comparador de precios: el precio que se muestra es una referencia (ver [limitaciones](#limitaciones-conocidas)).
- **No es** para iPhone: solo Android.

## Qué se puede hacer

- **Desafío del día:** 5 productos, los mismos para todo el país, una sola partida por día. Se renueva a las 00:00 (hora de Argentina). Si salís a la mitad, retomás donde quedaste.
- **Partida rápida:** 8 productos al azar. Los productos ya vistos no se repiten hasta que viste casi todo el catálogo.
- **¿Más caro o más barato?:** ves el precio de un producto y decidís si el siguiente cuesta más o menos. Seguís mientras no falles; se guarda tu récord en el celular.
- **Salas online:** creás una sala, pasás el código y cada uno juega a su hora. La tabla se arma sola a medida que terminan.
- **Ranking Argentina:** del día (hoy y ayer) y de la semana.
- **Rachas de días:** cuántos días seguidos completaste el desafío, con insignias a los 3, 7, 14 y 30 días.
- **Pistas:** podés pedir un rango de precio a cambio de puntos (100 la primera, 150 más la segunda).
- **Compartir:** el resultado se comparte como imagen (por ejemplo por WhatsApp).
- Cada producto tiene un botón para ver la publicación en Mercado Libre.

### Cómo se puntúa

El puntaje de cada producto baja a medida que te alejás del precio real (la escala es proporcional, no en pesos: errar por el doble penaliza igual en un producto barato que en uno caro). Si te equivocás por 3 % o menos hay un bono de 200 puntos. Acertar varios seguidos (puntaje base de 700 o más) multiplica el puntaje, hasta ×1,5. El máximo por producto es 1.800.

## Instalación

1. Entrá a [**Releases**](https://github.com/B3njaminGC/Pegale-al-Precio/releases/latest) y bajá `pegale-al-precio.apk` desde un celular Android.
2. Abrilo. Android te va a pedir permiso para instalar apps de esta fuente y puede avisarte que no viene de Play Store: es normal, la app se distribuye solo por acá.
3. Si ya tenías una versión instalada, el APK nuevo se instala encima y conserva tus datos.

Bajá el APK **siempre desde la página de Releases de este repositorio** y no de otro lado. El APK se firma con una llave que está en este mismo repo (ver [limitaciones](#limitaciones-conocidas)), así que no hay forma de verificar por la firma que un archivo que te pasó otra persona sea el original.

### Actualizar

Desde la versión 2.5.0 la app avisa en el inicio cuando hay una versión nueva, y desde la 2.5.1 la descarga ella misma y abre el instalador de Android (la primera vez Android pide permiso para "instalar apps desconocidas"). Si tenés una versión anterior a la 2.5.1, bajá la nueva a mano desde Releases e instalala encima; de ahí en adelante se actualiza desde la app.

Los productos y los precios se actualizan solos, sin necesidad de reinstalar.

## Privacidad

El juego no pide mail, teléfono ni registro. Para el ranking y las salas inicia una sesión anónima (Firebase) y guarda en un servidor el **apodo que elegís, tu puntaje y el código de las salas en las que jugás**. Todo lo demás (récords, rachas, productos vistos, partidas en curso) queda solo en tu celular.

## Limitaciones conocidas

- **Los precios son una referencia.** Se toma la mediana de ofertas nuevas en pesos al momento de actualizar (una vez por noche, y los productos más viejos se refrescan cada pocos días). El precio real en la publicación puede ser distinto, o la publicación puede haber cambiado o terminado.
- **Los productos se eligen automáticamente.** Aunque se filtran accesorios, usados y repuestos, a veces aparece un producto raro, una ficha poco útil o una categoría mal asignada. Si ves alguno, avisá abriendo un [issue](https://github.com/B3njaminGC/Pegale-al-Precio/issues).
- **El ranking confía en el celular.** Las reglas del servidor limitan el puntaje máximo, permiten una sola partida por día y que cada uno escriba solo lo suyo, pero alguien con conocimientos técnicos podría falsear su puntaje. No hay moderación de apodos más allá de un filtro básico de caracteres.
- **Las salas no se borran solas.** Quedan en el servidor.
- **Sin ranking para "¿Más caro o más barato?"** ni por categorías: el récord de ese modo es solo local.
- **Firma del APK pública.** La llave con la que se firma el APK es una llave de depuración que está en el repositorio. Sirve para que las versiones se instalen una encima de otra, pero no protege contra un APK falso firmado con la misma llave.
- **Poco probado en dispositivos.** Se probó en el celular del autor; no hay pruebas en una variedad de modelos ni versiones de Android.
- Necesita internet para el ranking, las salas y para actualizar productos. El resto funciona sin conexión con los productos que ya bajó.

## Desarrollo

Este proyecto se hace **con ayuda de Claude** (el asistente de IA de Anthropic) como asistente de programación: buena parte del código, de las pruebas y de la documentación la escribe Claude a pedido del autor, y los commits conservan esa atribución. Cada cambio se verifica de dos formas:

1. **Pruebas automáticas** que corren en cada push con GitHub Actions (lógica del juego, scripts de productos con un Mercado Libre simulado y forma de los datos), más el análisis del código.
2. **Prueba manual** del autor en su celular. Lo que no está cubierto por pruebas (pantallas, ranking y salas contra el servidor real, instalación y actualización del APK, compartir imagen) depende de esa prueba manual.

Para colaborar, mirá [CONTRIBUTING.md](CONTRIBUTING.md). Para compilar, probar o sacar una versión, mirá [docs/desarrollo.md](docs/desarrollo.md). Los cambios de cada versión están en el [CHANGELOG](CHANGELOG.md).

## Colaborar con el proyecto

El juego es gratis y sin publicidad. Si querés darme una mano, podés mandar una colaboración al alias de Mercado Pago **b3njamin.dev.mp**. Es opcional y no desbloquea nada en el juego.

## Licencia

[MIT](LICENSE). Mercado Libre y sus marcas pertenecen a sus dueños; las fotos y los nombres de los productos pertenecen a quienes los publican y se muestran con fines de juego, con link a la publicación original.
