# Ukrainian Gang Extension (steam-precios-ug)

Extensión para el grupo familiar de Steam **Ukrainian Gang**, que compra con cuentas de región Ucrania pagando con bolívares. Al lado de cada precio de la tienda muestra cuánto cuesta en ₴, en HK$ (para saber qué tarjeta de Hong Kong comprar), en USDT y en bolívares según Binance P2P.

Versión 0.1.1. Funciona en `store.steampowered.com`, sin iniciar sesión y con cualquier VPN.

## Qué hace

- **Ticket en la ficha de cada juego.** Debajo de cada edición comprable (juego base, deluxe, bundle…) aparece un ticket impreso con cuatro líneas: el precio en Steam Ucrania, la tarjeta de Hong Kong, los USDT de Binance y el total en bolívares. Cada línea dice qué tasa usó.
  - Los descuentos salen como en un ticket de tienda: precio normal tachado y una línea de descuento en rojo.
  - **Comparar regiones** abre una tabla con el precio en las regiones elegidas, pasado a USD y comparado con Ucrania.
  - **Lista UG** añade la edición a la lista de compra.
  - Si una tasa no se pudo actualizar, el ticket lo avisa y sigue con la última conocida. También tiene estados para un juego gratis, uno que no se vende en Ucrania, uno sin datos y un error de Steam.
- **Talones en búsquedas y listas.** En la búsqueda, la portada y la lista de DLC de cada ficha, al lado de cada precio de pago aparece un talón con Bs y HK$. El detalle completo sale al pasar el ratón o al enfocar la fila con el teclado.
- **Popup con la Lista UG.** Muestra la lista de compra como un ticket largo, con el total en ₴, HK$, USDT y Bs. Los precios se refrescan al abrirlo.
  - Si escribes el saldo de la billetera, dice cuánto falta recargar o cuánto sobra.
  - **Copiar resumen** copia un texto para WhatsApp o Discord: `ELDEN RING 1 799₴ + Portal 2 240₴ = 2 039₴ ≈ HK$ 381 ≈ 50,5 USDT ≈ Bs 54.423`.
  - Quitar un juego o vaciar la lista se puede deshacer.
  - El icono de la barra muestra cuántos juegos hay en la lista.
- **Tienda en ₴.** Añade `?cc=ua` a las páginas de la tienda para que Steam muestre los precios de Ucrania. Se puede apagar.
- **Ajustes.** Los ajustes son estos:
  - lado del P2P (comprar o vender USDT) y número de anuncios que se promedian;
  - precio real de la tarjeta de HK$100 y recargo del vendedor;
  - ₴ que acredita Steam por cada HK$;
  - regiones a comparar;
  - sugerir tarjetas (apagado por defecto).

## Instalar

1. Abre `brave://extensions` (o `chrome://extensions`, `edge://extensions`).
2. Activa el **Modo de desarrollador**.
3. Pulsa **Cargar extensión sin empaquetar** y elige esta carpeta, `extensions/steam-precios-ug`.

No hay paso de compilación: se carga la carpeta tal cual. `node_modules/` solo hace falta para las pruebas y no afecta a la extensión.

## Cómo calcula

```
₴ por HK$      = fx.UAH / fx.HKD                   (o el valor manual de los ajustes)
USDT por HK$   = (1 / fx.HKD) × (1 + recargo %)    (o el precio real de la tarjeta de HK$100 ÷ 100)
HK$            = ₴ / (₴ por HK$)
USDT           = HK$ × (USDT por HK$)
Bs             = USDT × promedio de los N primeros anuncios de Binance P2P
```

La comparación de regiones pasa cada precio a USD con la tasa de mercado. No incluye lo que cuesta comprar tarjetas de cada región.

## De dónde salen los datos

Todas las peticiones las hace el service worker (`src/background.js`); el content script no sale a otros dominios.

| Dato | Fuente | Caché |
|------|--------|-------|
| USDT/VES | `POST p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search`. No es una API documentada | 5 min |
| Tasas de cambio | `open.er-api.com`, con `currency-api.pages.dev` y `cdn.jsdelivr.net` de reserva | 6 h |
| Precio de apps | `store.steampowered.com/api/appdetails?appids=…&cc=ua&filters=price_overview`, en lotes de 25 | 30 min |
| Precio de paquetes | `api/packagedetails/?packageids=…&cc=ua`, de uno en uno porque en lote da 400 | 30 min |
| Precio de bundles | `actions/ajaxresolvebundles?bundleids=…&cc=ua`. Se lee `formatted_final_price`, porque `final_price` viene en 0 sin sesión | 30 min |
| Otras regiones | Las mismas APIs con otro `cc`, solo al abrir «Comparar regiones» | 6 h |

Si una fuente falla, se usa la última respuesta guardada y la UI dice de cuándo es. Los precios se guardan en `chrome.storage.session`; las tasas, la lista y los ajustes, en `chrome.storage.local`.

## Cómo detecta las cosas en la página

Steam cambia su HTML. Si algo deja de aparecer, el arreglo va en `src/content/detect.js`.

- **Tipo de página:** la ruta `/app/<id>`, `/sub/<id>` o `/bundle/<id>`.
- **Ediciones comprables:** cada `.game_area_purchase_game` con `input[name="subid"]` (paquete) o `input[name="bundleid"]` (bundle). El ticket va después de `.game_area_purchase_game_wrapper`.
- **Nombre de la edición:** el título del bloque, por ejemplo `Comprar «ELDEN RING Shadow of the Erdtree Edition»`, sin el verbo y sin la etiqueta «BUNDLE (?)». Si empieza por el nombre del juego (`#appHubAppName`), el ticket lleva el nombre del juego y el resto es la edición; si no queda nada, la edición se llama «Juego base». Si es otra cosa, como un paquete con otros juegos («Grand Theft Auto: The Trilogy»), el ticket lleva el título del bloque y, como edición, «Incluye N juegos», contados en `.package_contents`.
- **Suscripciones:** el bloque tiene la clase `game_area_purchase_game_dropdown_subscription` o un `.game_purchase_subscription` con el período («every 1 month(s)»). El ticket dice «Precio al mes» y no compara regiones.
- **Precio en la página:** `[data-price-final]` en céntimos, pero solo si el texto lleva `₴`. Si no, el precio sale de la API de Steam. Así funciona igual con VPN o con la tienda en otra moneda.
- **Ficha sin ediciones**, como un juego gratis, no disponible o por salir: se pide el precio de la app y el ticket va al principio de `#game_area_purchase`.
- **Listas:** cada `.discount_final_price` o `.game_area_dlc_price` dentro de un elemento con `data-ds-itemkey` (`App_620`, `Sub_440408`, `Bundle_232`) o con `data-ds-appid`, `data-ds-packageid` o `data-ds-bundleid`. Los precios en 0 o sin cifras («Gratis») no llevan talón. Un `MutationObserver` cubre lo que Steam carga después, como el scroll infinito de la búsqueda.
- **Límite conocido:** las páginas de ofertas hechas en React, como `/specials`, no usan `data-ds-*` y no llevan talones.

La UI se monta en elementos `<ug-extension-ui>` con Shadow DOM, así que los estilos de Steam no la afectan y los suyos no se escapan. La fuente se registra en la página como `UG Martian Mono`.

## Pruebas

```
npm install          # solo la primera vez
npm test             # cálculo, formatos, ajustes y lectura de las APIs (sin red)
npm run test:red     # las APIs reales: Binance, tasas y Steam
npm run test:e2e     # la extensión cargada en Chrome sobre la tienda real
npm run test:todo    # las tres
```

La prueba de extremo a extremo usa el Chrome instalado; con `CHROME_PATH` se puede elegir otro, por ejemplo Brave. Con `HEADFUL=1` se ve el navegador.

Recorre 38 pasos y guarda capturas en `tests/e2e/capturas/`. Entre ellos:

- la redirección a `?cc=ua`;
- un ticket por edición, con las cifras comprobadas contra el cálculo;
- la carga de la fuente;
- «Lista UG» y el contador del icono;
- la comparación de regiones;
- todos los estados del ticket, con Steam y Binance caídos de forma simulada;
- los talones y el tooltip con ratón y teclado, incluido el scroll infinito y la lista de DLC;
- una ficha con suscripción y con un paquete de otros juegos (GTA San Andreas);
- el popup completo, con saldo, copiar resumen, deshacer y lista vacía;
- los ajustes, incluidos los valores no válidos;
- la pantalla estrecha y el alto contraste;
- una auditoría de accesibilidad con axe (WCAG 2.2 AA) del ticket, el popup y los ajustes;
- que no haya errores de la extensión en consola.

## Archivos

| Archivo | Qué hace |
|---------|----------|
| `manifest.json` | Manifest V3. Permisos: `storage` y `declarativeNetRequestWithHostAccess` (para `?cc=ua`). |
| `src/background.js` | Service worker: red, caché, Lista UG, regla `?cc=ua` y contador del icono. |
| `src/shared/config.js` | Ajustes por defecto, regiones y validación. |
| `src/shared/calc.js` | Conversiones, formatos de cada moneda, tarjetas sugeridas, comparación de regiones y resumen. |
| `src/shared/sources.js` | Direcciones de las APIs y lectura de sus respuestas. |
| `src/shared/icons.js` | Emblema, iconos y código de barras en SVG. |
| `src/shared/receipt.css` | Sistema de diseño «Recibo». |
| `src/content/detect.js` | Lectura del HTML de Steam. |
| `src/content/render.js` | Ticket y talón. |
| `src/content/content.js` | Orquesta la página: detecta, pide datos y monta la UI. |
| `src/popup/` | Popup con la Lista UG. |
| `src/options/` | Página de ajustes. |
| `fonts/` | Martian Mono (SIL OFL 1.1). |
| `icons/` | Iconos de la extensión, generados con `npm run iconos`. |
| `diseno/` | Decisiones de diseño, maqueta final y exploración. |
| `tests/`, `tools/` | Pruebas y herramientas de desarrollo. |
| `HANDOFF.md` | El traspaso con lo decidido antes de empezar. |
