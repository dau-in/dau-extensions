# dau-extensions

Personal browser extensions. Each one lives in its own folder under `extensions/` and is loaded in Brave, Chrome, Edge or Opera as an unpacked extension.

| Extension | What it does | State |
|-----------|--------------|-------|
| [`steam-precios-ug`](extensions/steam-precios-ug/) | **Ukrainian Gang Extension.** Steam Ukraine prices in HK$, USDT and bolívares at the Binance P2P rate, with a receipt per edition, a region comparison and the UG list for the group. UI in English and Spanish. | In use, v0.2.0 |
| [`tumblr-no-wall`](extensions/tumblr-no-wall/) | Removes Tumblr's "Sign up or log in" wall, restores scrolling and adds an HD viewer and a Pinterest button. UI follows the browser's language. | In use, v1.3.0 |

| | |
|---|---|
| ![Receipt under a Steam edition](extensions/steam-precios-ug/docs/ticket.png) | ![Stub next to each search price](extensions/steam-precios-ug/docs/search.png) |
| A receipt under every edition, with the price in ₴, HK$, USDT and Bs | A stub next to every paid price in search and in lists |
| ![UG list popup](extensions/steam-precios-ug/docs/popup.png) | ![Tumblr without the wall](extensions/tumblr-no-wall/docs/hero.png) |
| The UG list with the total, the wallet and the summary for WhatsApp | Tumblr without the login wall, with the HD and Pin buttons |

The UG extension starts in English and has an **Español** option in its settings. Tumblr No Login Wall has no settings page: it uses the browser's language.

## Install an extension

1. Open `brave://extensions` (or `chrome://extensions`, `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick the extension's folder, for example `extensions/tumblr-no-wall`.
4. After changing the code, click the extension's reload button and refresh the page.

If an extension has a build step, its own README says which folder to load.

## Development

Node 24 is needed for the tests and the tools; the extensions themselves do not need it.

```
node tools/check-manifests.mjs         # checks every extension's manifest

cd extensions/steam-precios-ug
npm install
npm test                               # unit tests
npm run test:live                      # against the real APIs
npm run test:e2e                       # the extension in Chrome on Steam
```

GitHub Actions checks the manifests and runs the unit tests on every push to `main` (see `.github/workflows/tests.yml`).

### Conventions

- Manifest V3, aimed at Chromium browsers. Request only the permissions and `host_permissions` the extension uses.
- Plain JavaScript with no build step unless it is truly needed. Requests to other domains go through the service worker.
- UI injected into a third-party page is isolated in Shadow DOM or prefixed, so its classes do not clash with the site.
- Text that comes from the page goes in with `textContent`, never as HTML.
- The code and the docs are in English. User-facing text is in English too, with Spanish where the extension says so.
- Bump the manifest `version` with every change that will be used.

### Adding an extension

1. Create `extensions/<name>/` with its `manifest.json` (Manifest V3, version `0.1.0`) and its `README.md`. The README says what it does, how to install it and what it relies on to detect things on the page.
2. If it has logic worth testing, add a `package.json` with `npm test` and add it to the workflow's matrix.
3. Add it to the table above.

## Layout

```
dau-extensions/
├── extensions/          one folder per extension, each self-contained
├── tools/               repo-wide tools
└── .github/workflows/   continuous integration
```