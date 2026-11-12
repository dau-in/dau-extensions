# steam-precios-ug: documento de traspaso

Este documento resume todo lo decidido y verificado antes de empezar la extensión. El chat que la construya parte de aquí, sin código previo en esta carpeta.

## Para quién y para qué

Es para el grupo familiar de Steam **Ukrainian Gang**. Viven en Venezuela, tienen las cuentas de Steam en **región Ucrania**, así que la tienda cobra en grivnas (₴, UAH).

Así compran hoy:

1. Buscan el juego y calculan de cabeza cuántos USDT cuesta.
2. Miran en el mercado de Binance (Kryptomate) cuánto cuesta una tarjeta de regalo de Steam **Hong Kong (HKD)** de cierta denominación.
3. Compran USDT por **P2P de Binance con bolívares (VES)**.
4. Compran la tarjeta HKD, la canjean en Steam (que la convierte a ₴) y compran el juego.

La extensión elimina el paso 1 y la incertidumbre de los demás. Al lado de cada precio muestra:

- el precio en **₴** (región Ucrania), aunque la página esté en otra moneda;
- su equivalente en **HK$**, para saber qué tarjeta o tarjetas comprar;
- lo que cuesta en **USDT**;
- lo que cuesta en **bolívares** según el promedio de Binance P2P;
- **qué tan barato** sale en Ucrania frente a otras regiones.

## Decisiones tomadas

- **Extensión de navegador**, Manifest V3, para Chromium (Brave, Chrome, Edge, Opera). Firefox queda para después y solo si alguien lo usa.
- **No modificar Steam.** Nada de Millennium ni de ningún mod del cliente. El usuario no quiere tocar Steam, y además esos mods son no oficiales y frágiles ante actualizaciones. Millennium ya se desinstaló y no quedan restos.
- **Funciona sin iniciar sesión y con cualquier VPN.** La extensión no se fía de la moneda que muestra la página: lee qué app o paquete es y pide su precio en Ucrania a la API de Steam (`cc=ua`).
- **Mostrar el precio en HK$, no sugerir tarjetas.** El usuario lo pidió así: con el monto en HK$ cada uno deduce qué tarjeta o cuántas compra. Una sugerencia de tarjetas puede existir como ajuste **apagado por defecto**.
- **Carrito propio: "Lista UG".** El carrito de Steam exige sesión, así que la extensión tiene su propia lista:
  - botón **"+ Lista UG"** en cada edición de un juego (estándar, deluxe, bundle…);
  - en el popup de la extensión, la lista con cada precio en ₴ y el **total en ₴, HK$, USDT y Bs**;
  - los precios se refrescan al abrir el popup;
  - **saldo de billetera** opcional, escrito a mano, para ver cuánto falta recargar;
  - botón **"Copiar resumen"** que copia un texto para WhatsApp o Discord, por ejemplo `Elden Ring 1 799₴ + Portal 2 240₴ = 2 039₴ ≈ HK$ 381 ≈ 50,5 USDT ≈ Bs 54.400`.
  - Una sola lista por navegador. Varias listas con nombre pueden venir después.
  - Si algún día inician sesión en el navegador, la extensión también puede leer el carrito real de Steam. Es secundario.
- **Opción "Mostrar la tienda en ₴"**: añadir `?cc=ua` a las URLs de la tienda para que la propia página salga en grivnas sin sesión.
- Interfaz en **español**.

## UX y estética

El usuario pidió **la mejor UX posible y una estética muy cuidada**. La UI debe convivir con la de Steam sin romperla, pero distinguirse a simple vista como algo propio de la extensión.

- Primero se diseña un **sistema de diseño** para la extensión: tokens de color en OKLCH, escala tipográfica, espaciado, radios, sombras, estados y movimiento. Después se construyen las piezas.
- Usa las skills de `.opencode/skills/`: `better-colors`, `better-typography`, `better-layout`, `better-ui`, `better-accessibility` y `better-writing`. Revisa el resultado con `better-interface`.
- Inyecta la UI en la tienda dentro de **Shadow DOM**. Así los estilos de Steam no la afectan y los suyos no se escapan.
- Contexto de la paleta de Steam, para diferenciarse sin chocar: fondos azul petróleo oscuro (`#1b2838`, `#171a21`), texto `#c6d4df`, acento azul `#66c0f4` y verde de precios `#beee11`.
- Las cifras usan `font-variant-numeric: tabular-nums`.
- Piezas a diseñar:
  1. **Tarjeta de precio** debajo de cada edición en la página del juego: ₴ → HK$ → USDT → Bs, botón "+ Lista UG" y comparación de regiones desplegable.
  2. **Etiqueta compacta** al lado de cada precio en búsquedas, ofertas, DLC y listas: Bs y HK$, con el detalle en un tooltip.
  3. **Popup**: Lista UG, total, saldo, "Copiar resumen" y tasas actuales con su antigüedad.
  4. **Página de ajustes**.
  5. Estados de **carga, error, sin conexión, juego gratis y "no disponible en Ucrania"**.

## Arquitectura sugerida

| Pieza | Responsabilidad |
|-------|-----------------|
| Service worker | Todas las peticiones de red: Binance, tasas de cambio y API de Steam. Caché en `chrome.storage`: P2P 5 min, tasas de cambio 6 h, precios 30 min. Agrupa pedidos de precios en lote. |
| Content script en `store.steampowered.com` | Detecta app, paquete o bundle en la página, pide precios al service worker y monta la UI en Shadow DOM. Un `MutationObserver` cubre el contenido que carga Steam después. |
| Popup | Lista UG, totales, saldo, copiar resumen y tasas. |
| Página de opciones | Ajustes. |
| Módulo de cálculo puro | Conversiones y formatos, sin DOM, fácil de probar con Node. |

Permisos esperados: `storage`, `clipboardWrite` si hiciera falta, y `host_permissions` para `store.steampowered.com`, `p2p.binance.com` y las APIs de tasas de cambio.

## Datos verificados el 2026-11-12

### Binance P2P (USDT/VES)

- `POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search`
- Cuerpo: `{"asset":"USDT","fiat":"VES","tradeType":"BUY","page":1,"rows":5,"payTypes":[],"publisherType":null}`
- Respuesta: `data[].adv.price` como texto, por ejemplo `"1069.000"`. Se promedian los N primeros anuncios.
- `tradeType: "BUY"` es comprar USDT con Bs, el caso normal. `"SELL"` es venderlos.
- Responde 200 aunque el `Origin` sea `chrome-extension://…`, pero **no envía cabeceras CORS**. Por eso la petición va desde el service worker con `host_permissions`.
- No es una API documentada. Si falla, la UI tiene que decirlo con claridad y seguir funcionando con la última tasa conocida.
- Valores observados: entre 1050 y 1078 Bs por USDT.

### Tasas de cambio

- Principal: `https://open.er-api.com/v6/latest/USD` → `rates.HKD`, `rates.UAH` y demás monedas.
- Alternativas:
  - `https://latest.currency-api.pages.dev/v1/currencies/usd.json`
  - `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`
  - Las dos devuelven las claves en minúscula, dentro de `usd`.

### API de la tienda de Steam

- Apps, **varias por consulta**: `https://store.steampowered.com/api/appdetails?appids=620,1245620,570&cc=ua&filters=price_overview`
  - Con precio: `data.price_overview = {currency, initial, final, discount_percent, final_formatted}`. `final` va en centavos, por ejemplo `179900` = 1 799₴.
  - Juego gratis: `success: true` y sin `price_overview`.
  - No disponible en esa región: `success: false`.
  - Agrupar varias apps solo funciona con `filters=price_overview`.
- Paquetes o ediciones, **de uno en uno**, porque varios a la vez devuelve 400: `https://store.steampowered.com/api/packagedetails/?packageids=440408&cc=ua` → `data.price = {currency, initial, final, discount_percent}`. Algunos paquetes devuelven `success: false`. En ese caso hay que usar el precio de la página si está en ₴, o mostrar "sin datos".
- La API limita peticiones a unas 200 cada 5 minutos por IP. Agrupa y cachea.
- Página sin sesión: `https://store.steampowered.com/app/620/?cc=ua` muestra `240₴`. Sin `cc` muestra `$9.99`.

### HTML de la tienda

- Cada edición comprable es un `.game_area_purchase_game` y su id de paquete está en `<form name="add_to_cart_440408">` con `<input type="hidden" name="subid" value="440408">`. Los bundles usan `bundleid`.
  - Ejemplo en Elden Ring: 440408 es la base, 1010505 Shadow of the Erdtree Edition y 1010506 la Deluxe.
- Precio en la página: `[data-price-final]` en centavos, `.game_purchase_price` y `.discount_final_price`.
- Búsqueda: cada fila es `<a … data-ds-appid="620" data-ds-itemkey="App_620">` y el precio va en `.discount_final_price`.
- Formatos de ₴ en la página: `240₴` en la ficha y `240,00₴` en la búsqueda.
- Saldo de billetera, solo con sesión: `#header_wallet_balance`.

### Tarjetas HKD

- Denominaciones de tarjetas Steam HK: 40, 50, 80, 100, 200, 300, 400, 500, 600, 750 y 1000 HK$.
- Steam convierte el saldo de la tarjeta a ₴ al canjearla, con una tasa propia que no publica. Por defecto se usa la de mercado y la tasa real se puede poner a mano en los ajustes.
- Steam restringe canjear tarjetas de otra moneda en algunas cuentas, pero esta familia ya lo hace sin problema.

## Cálculo

```
₴ por HK$       = fx.UAH / fx.HKD                  (o valor manual)
USDT por HK$    = (1 / fx.HKD) × (1 + recargo %)   (o precio real de la tarjeta de HK$100 ÷ 100)
HK$             = ₴ / (₴ por HK$)
USDT            = HK$ × (USDT por HK$)
Bs              = USDT × tasa P2P
USD de mercado  = ₴ / fx.UAH                        (solo para comparar regiones)
```

Comparación de regiones: el precio de cada región se convierte a USD con la tasa de mercado y se compara con Ucrania en %. Regiones por defecto: US, HK, AR, TR, KZ, RU, BR, DE y PL. AR y TR cobran en USD. Las comisiones de comprar tarjetas de otras regiones no entran en la cuenta.

Ejemplo con fx.UAH 41,6, fx.HKD 7,78, P2P 1078 y 3 % de recargo: **1 799₴ ≈ HK$ 336.45 ≈ 44,54 USDT ≈ Bs 48.016,87**.

Formatos:

| Moneda | Formato | Ejemplo |
|--------|---------|---------|
| Bs | punto para miles y coma decimal | `Bs 48.016,87` |
| USDT | coma decimal | `44,54 USDT` |
| HK$ | punto decimal | `HK$ 336.45` |
| ₴ | espacio para miles | `1 799₴` |

## Ajustes

| Ajuste | Por defecto |
|--------|-------------|
| Anuncios de P2P que se promedian (1 a 20) | 5 |
| Lado del P2P: comprar o vender USDT | Comprar |
| Precio real en USDT de una tarjeta de HK$100. Con 0 se usa mercado más recargo | 0 |
| Recargo del vendedor de tarjetas | 0 % |
| ₴ que acredita Steam por 1 HK$. Con 0 se usa la tasa de mercado | 0 |
| Regiones a comparar | ver arriba |
| Mostrar la tienda en ₴ con `?cc=ua` | encendido |
| Etiquetas en búsquedas y listas | encendido |
| Comparación de regiones en la ficha | encendido |
| Sugerir tarjetas | **apagado** |

## Sin código previo

Hubo un prototipo como plugin de Millennium, descartado y borrado porque el usuario no quiere modificar Steam. Todo lo útil de él está en este documento. La extensión se escribe desde cero.

## Primeros pasos sugeridos

1. Comprobar desde el service worker de una extensión mínima que Binance P2P, las tasas de cambio y la API de Steam responden.
2. Diseñar el sistema de diseño y las piezas con las skills, y enseñárselo al usuario antes de cablear todo.
3. Construir el módulo de cálculo con pruebas en Node.
4. Montar la ficha del juego, luego las listas, el popup con la Lista UG y por último los ajustes.
5. Probar en Brave con la extensión cargada sin empaquetar, sin sesión, con y sin VPN.
