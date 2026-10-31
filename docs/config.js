/* Configuración del juego. Cualquier cambio acá se ve en la próxima versión publicada. */
window.PAP_CONFIG = {
  // Dirección pública del juego (GitHub Pages). Se usa para armar los links de las salas
  // y para que la app de Android baje los productos y precios del día.
  siteUrl: 'https://b3njamingc.github.io/Pegale-al-Precio/',
  productsUrl: 'https://b3njamingc.github.io/Pegale-al-Precio/products.json',

  // Salas online y ranking. Si queda vacío, esas funciones se muestran apagadas.
  // Los dos datos salen de la consola de Firebase (ver README, sección "Salas online y ranking").
  firebase: {
    apiKey: '',
    databaseURL: ''
  }
};
