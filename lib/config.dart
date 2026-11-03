// Datos de configuración de la app.

/// Salas online y ranking. Se completan con los datos de la consola de Firebase
/// (ver README, sección "Salas online y ranking"). Si quedan vacíos, esas funciones se muestran apagadas.
const String kFirebaseApiKey = 'AIzaSyB3ONfDb3MfTKBsV3IDkuWPBcb1vJr6lAM';
const String kFirebaseDatabaseUrl = 'https://pegale-al-precio-default-rtdb.firebaseio.com';

/// Productos y precios del día. Los actualiza el workflow "Actualizar productos".
const String kProductsUrl =
    'https://raw.githubusercontent.com/B3njaminGC/Pegale-al-Precio/main/data/products.json';

/// Dónde bajar la app. Se incluye en el texto que se comparte.
const String kDownloadUrl = 'https://github.com/B3njaminGC/Pegale-al-Precio/releases/latest';

/// Versión de esta compilación (la completa el workflow). Se muestra al pie del inicio.
const String kVersion = String.fromEnvironment('APP_VERSION', defaultValue: 'dev');

/// Alias de Mercado Pago para colaborar con el proyecto (es público a propósito: solo sirve para recibir plata).
const String kDonateAlias = 'b3njamin.dev.mp';

/// Última versión publicada, para avisar cuando hay una nueva.
const String kLatestUrl = 'https://api.github.com/repos/B3njaminGC/Pegale-al-Precio/releases/latest';
