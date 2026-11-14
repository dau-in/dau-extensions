# steam-precios-ug: handoff

> **Historical.** The extension is built. What is current lives in [`README.md`](README.md), and the design in [`design/README.md`](design/README.md). This document records what was asked for and verified before work started.

This document summarizes everything decided and verified before the extension was started. The session that built it started from here, with no earlier code in this folder.

## Who it is for and why

It is for the **Ukrainian Gang** Steam family group. They live in Venezuela and have their Steam accounts in the **Ukraine region**, so the store charges in hryvnias (₴, UAH).

How they buy today:

1. They find the game and work out in their heads how many USDT it costs.
2. They check on the Binance marketplace (Kryptomate) how much a Steam **Hong Kong (HKD)** gift card of a given denomination costs.
3. They buy USDT through **Binance P2P with bolívares (VES)**.
4. They buy the HKD card, redeem it on Steam (which converts it to ₴) and buy the game.

The extension removes step 1 and the guesswork in the others. Next to each price it shows:

- the price in **₴** (Ukraine region), even if the page is in another currency;
- the equivalent in **HK$**, to know which card or cards to buy;
- the cost in **USDT**;
- the cost in **bolívares** at the Binance P2P average;
- **how cheap** Ukraine is compared with other regions.

## Decisions

- **A browser extension**, Manifest V3, for Chromium (Brave, Chrome, Edge, Opera). Firefox later, and only if someone uses it.
- **Do not modify Steam.** No Millennium or any client mod. The user does not want to touch Steam, and those mods are unofficial and break with updates. Millennium has been uninstalled with nothing left behind.
- **Works without signing in and with any VPN.** The extension does not trust the currency the page shows: it reads which app or package it is and asks the Steam API for its Ukraine price (`cc=ua`).
- **Show the price in HK$, do not suggest cards.** The user asked for this: with the HK$ amount everyone works out which card or how many to buy. A card suggestion can exist as a setting that is **off by default**.
- **Its own cart: "Lista UG".** Steam's cart needs a session, so the extension has its own list:
  - a **"+ Lista UG"** button on every edition of a game (standard, deluxe, bundle…);
  - in the extension popup, the list with each price in ₴ and the **total in ₴, HK$, USDT and Bs**;
  - prices refresh when the popup opens;
  - an optional, hand-typed **wallet balance**, to see how much is left to top up;
  - a **"Copiar resumen"** button that copies a line for WhatsApp or Discord, for example `Elden Ring 1 799₴ + Portal 2 240₴ = 2 039₴ ≈ HK$ 381 ≈ 50,5 USDT ≈ Bs 54.400`.
  - One list per browser. Several named lists may come later.
  - If they ever sign in in the browser, the extension could also read the real Steam cart. Secondary.
- **"Show the store in ₴" option:** add `?cc=ua` to store URLs so the page itself shows hryvnias without a session.
- The UI is in **Spanish**.

## UX and aesthetics

The user asked for **the best possible UX and very careful aesthetics**. The UI must live alongside Steam's without breaking it, but be recognizable at a glance as the extension's own.

- First design a **design system**: OKLCH color tokens, type scale, spacing, radii, shadows, states and motion. Then build the pieces.
- Design with the interface design skills used for this project: color, typography, layout, UI, accessibility and writing. Review the result end to end.
- Inject the store UI inside **Shadow DOM**, so Steam's styles do not affect it and its own do not leak.
- Steam's palette, to stand apart without clashing: dark teal-blue backgrounds (`#1b2838`, `#171a21`), text `#c6d4df`, blue accent `#66c0f4` and price green `#beee11`.
- Figures use `font-variant-numeric: tabular-nums`.
- Pieces to design:
  1. **Price card** under each edition on the game page: ₴ → HK$ → USDT → Bs, a "+ Lista UG" button and a collapsible region comparison.
  2. **Compact tag** next to every price in search, specials, DLC and lists: Bs and HK$, with the breakdown in a tooltip.
  3. **Popup**: Lista UG, total, wallet, "Copiar resumen" and current rates with their age.
  4. **Settings page**.
  5. **Loading, error, offline, free game and "not available in Ukraine"** states.

## Suggested architecture

| Piece | Responsibility |
|-------|----------------|
| Service worker | Every network request: Binance, exchange rates and the Steam API. Cache in `chrome.storage`: P2P 5 min, exchange rates 6 h, prices 30 min. Batches price requests. |
| Content script on `store.steampowered.com` | Detects the app, package or bundle on the page, asks the service worker for prices and mounts the UI in Shadow DOM. A `MutationObserver` covers content Steam loads later. |
| Popup | Lista UG, totals, wallet, copy summary and rates. |
| Options page | Settings. |
| Pure calculation module | Conversions and formats, no DOM, easy to test with Node. |

Expected permissions: `storage`, `clipboardWrite` if needed, and `host_permissions` for `store.steampowered.com`, `p2p.binance.com` and the exchange rate APIs.

## Data verified on 2026-11-12

### Binance P2P (USDT/VES)

- `POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search`
- Body: `{"asset":"USDT","fiat":"VES","tradeType":"BUY","page":1,"rows":5,"payTypes":[],"publisherType":null}`
- Response: `data[].adv.price` as text, for example `"1069.000"`. The first N ads are averaged.
- `tradeType: "BUY"` means buying USDT with Bs, the usual case. `"SELL"` means selling them.
- Answers 200 even with an `Origin` of `chrome-extension://…`, but **sends no CORS headers**. That is why the request goes from the service worker with `host_permissions`.
- Not a documented API. If it fails, the UI must say so clearly and keep working with the last known rate.
- Observed values: between 1050 and 1078 Bs per USDT.

### Exchange rates

- Main: `https://open.er-api.com/v6/latest/USD` → `rates.HKD`, `rates.UAH` and the other currencies.
- Fallbacks:
  - `https://latest.currency-api.pages.dev/v1/currencies/usd.json`
  - `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`
  - Both return lowercase keys, inside `usd`.

### Steam store API

- Apps, **several per request**: `https://store.steampowered.com/api/appdetails?appids=620,1245620,570&cc=ua&filters=price_overview`
  - With a price: `data.price_overview = {currency, initial, final, discount_percent, final_formatted}`. `final` is in cents, for example `179900` = 1 799₴.
  - Free game: `success: true` and no `price_overview`.
  - Not available in that region: `success: false`.
  - Batching apps only works with `filters=price_overview`.
- Packages or editions, **one at a time**, because several at once return 400: `https://store.steampowered.com/api/packagedetails/?packageids=440408&cc=ua` → `data.price = {currency, initial, final, discount_percent}`. Some packages return `success: false`. Then use the page price if it is in ₴, or show "no data".
- The API allows about 200 requests every 5 minutes per IP. Batch and cache.
- Page without a session: `https://store.steampowered.com/app/620/?cc=ua` shows `240₴`. Without `cc` it shows `$9.99`.

### Store HTML

- Each purchasable edition is a `.game_area_purchase_game`, and its package id is in `<form name="add_to_cart_440408">` with `<input type="hidden" name="subid" value="440408">`. Bundles use `bundleid`.
  - Example on Elden Ring: 440408 is the base game, 1010505 the Shadow of the Erdtree Edition and 1010506 the Deluxe.
- Price on the page: `[data-price-final]` in cents, `.game_purchase_price` and `.discount_final_price`.
- Search: every row is `<a … data-ds-appid="620" data-ds-itemkey="App_620">` and the price is in `.discount_final_price`.
- ₴ formats on the page: `240₴` on the game page and `240,00₴` in search.
- Wallet balance, only with a session: `#header_wallet_balance`.

### HKD cards

- Steam HK card denominations: 40, 50, 80, 100, 200, 300, 400, 500, 600, 750 and 1000 HK$.
- Steam converts the card balance to ₴ when redeemed, at its own unpublished rate. The market rate is the default, and the real rate can be set by hand in settings.
- Steam restricts redeeming cards in another currency on some accounts, but this family already does it without trouble.

## Calculation

```
₴ per HK$       = fx.UAH / fx.HKD                  (or manual value)
USDT per HK$    = (1 / fx.HKD) × (1 + surcharge %) (or real price of the HK$100 card ÷ 100)
HK$             = ₴ / (₴ per HK$)
USDT            = HK$ × (USDT per HK$)
Bs              = USDT × P2P rate
Market USD      = ₴ / fx.UAH                       (only to compare regions)
```

Region comparison: each region's price is converted to USD at the market rate and compared with Ukraine in %. Default regions: US, HK, AR, TR, KZ, RU, BR, DE and PL. AR and TR charge in USD. The cost of buying other regions' cards is not included.

Example with fx.UAH 41.6, fx.HKD 7.78, P2P 1078 and a 3 % surcharge: **1 799₴ ≈ HK$ 336.45 ≈ 44,54 USDT ≈ Bs 48.016,87**.

Formats:

| Currency | Format | Example |
|----------|--------|---------|
| Bs | dot for thousands, comma for decimals | `Bs 48.016,87` |
| USDT | comma for decimals | `44,54 USDT` |
| HK$ | dot for decimals | `HK$ 336.45` |
| ₴ | space for thousands | `1 799₴` |

## Settings

| Setting | Default |
|---------|---------|
| P2P ads averaged (1 to 20) | 5 |
| P2P side: buy or sell USDT | Buy |
| Real USDT price of a HK$100 card. 0 means market plus surcharge | 0 |
| Card seller surcharge | 0 % |
| ₴ credited by Steam per HK$1. 0 means the market rate | 0 |
| Regions to compare | see above |
| Show the store in ₴ with `?cc=ua` | on |
| Tags in search and lists | on |
| Region comparison on the game page | on |
| Suggest cards | **off** |

## No earlier code

There was a prototype as a Millennium plugin, discarded and deleted because the user does not want to modify Steam. Everything useful from it is in this document. The extension was written from scratch.

## Suggested first steps

1. From a minimal extension's service worker, check that Binance P2P, the exchange rates and the Steam API answer.
2. Design the design system and the pieces with the skills, and show them to the user before wiring everything.
3. Build the calculation module with Node tests.
4. Build the game page, then the lists, the popup with the Lista UG and finally the settings.
5. Test in Brave with the extension loaded unpacked, without a session, with and without a VPN.
