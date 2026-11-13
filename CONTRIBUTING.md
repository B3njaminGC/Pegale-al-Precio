# Cómo colaborar

¡Gracias por querer sumar! Reglas cortas:

1. **Un cambio por idea.** Un pull request (o un commit) por tema: más fácil de revisar y de deshacer si algo sale mal. Los mensajes de commit, en español, explican **por qué** se hace el cambio, no solo qué.
2. **Con pruebas.** Si tocás lógica (puntaje, fechas, scripts de productos), agregá o ajustá una prueba y comprobá que pasen todas:
   ```bash
   node --test tests/*.test.mjs
   flutter analyze --no-fatal-infos && flutter test
   ```
   Se corren solas en cada push. Detalles para compilar y probar en [docs/desarrollo.md](docs/desarrollo.md). Si el cambio es de pantallas y no lo pudiste probar en un celular, decilo en la descripción.
3. **Nada personal en el repositorio.** No subas tokens, claves privadas, credenciales de Mercado Libre, mails, teléfonos, rutas de tu computadora ni datos de otras personas (tampoco en capturas, logs o issues). Las credenciales van en los *Secrets* de GitHub, nunca en el código.
4. **Historial intacto.** No reescribas el historial (nada de `push --force` sobre `main`) y mantené las líneas de atribución de los commits (`Co-Authored-By`). El proyecto se desarrolla con ayuda de Claude y no se oculta.
5. **Sin romper lo existente.** No cambies `ci/debug.keystore` ni `database.rules.json` sin discutirlo antes en un issue: afectan a todos los usuarios.

## Reportar un fallo común

Completá el [formulario de error](https://github.com/B3njaminGC/Pegale-al-Precio/issues/new?template=error.yml) (o el de [producto raro](https://github.com/B3njaminGC/Pegale-al-Precio/issues/new?template=producto.yml)) con la versión de la app (se ve al pie del inicio), el modelo y la versión de Android, y qué pasó. Si es un producto con precio, foto o ficha rara, poné el nombre.

## Reportar un fallo de seguridad

**No lo publiques en un issue.** Usá la pestaña **Security**, **Report a vulnerability** de este repositorio (aviso privado de GitHub). No incluyas en el reporte datos de otras personas ni credenciales reales; alcanza con describir cómo reproducirlo. Si encontraste una clave o dato personal expuesto en el repo, avisá por el mismo canal sin copiarlo.
