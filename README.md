# dau-extensions

Extensiones de navegador personales. Cada una vive en su propia carpeta dentro de `extensions/` y se carga en Brave, Chrome, Edge u Opera como extensión sin empaquetar.

| Extensión | Qué hace | Estado |
|-----------|----------|--------|
| [`tumblr-no-wall`](extensions/tumblr-no-wall/) | Quita el muro de "Sign up or log in" de Tumblr, devuelve el scroll y añade un visor HD y un botón para guardar en Pinterest. | En uso, v1.2.0 |
| [`steam-precios-ug`](extensions/steam-precios-ug/) | **Ukrainian Gang Extension.** Precios de Steam Ucrania en HK$, USDT y bolívares según Binance P2P, con ticket por edición, comparación de regiones y Lista UG para el grupo. | En uso, v0.1.1 |

## Instalar una extensión

1. Abre `brave://extensions` (o `chrome://extensions`, `edge://extensions`).
2. Activa el **Modo de desarrollador**.
3. Pulsa **Cargar extensión sin empaquetar** y elige la carpeta de la extensión, por ejemplo `extensions/tumblr-no-wall`.
4. Tras cambiar el código, pulsa el botón de recargar de la extensión y refresca la página.

Si una extensión tiene paso de compilación, su propio README dice qué carpeta cargar.

> Si ya tenías `tumblr-no-wall` cargada desde su ruta anterior (`Desktop\Development\tumblr\tumblr-no-wall`), el navegador mostrará un error. Quítala y vuelve a cargarla desde `extensions/tumblr-no-wall`.

## Desarrollo

Hace falta Node 24 para las pruebas y las herramientas; las extensiones en sí no lo necesitan.

```
node tools/revisar-manifiestos.mjs     # revisa el manifest de todas las extensiones

cd extensions/steam-precios-ug
npm install
npm test                               # pruebas unitarias
npm run test:red                       # contra las APIs reales
npm run test:e2e                       # la extensión en Chrome sobre Steam
```

GitHub Actions revisa los manifiestos y corre las pruebas unitarias en cada push a `main` (ver `.github/workflows/pruebas.yml`).

### Crear una extensión nueva

1. Crea `extensions/<nombre>/` con su `manifest.json` (Manifest V3, versión `0.1.0`) y su `README.md`. El README dice qué hace, cómo se instala y en qué se basa para detectar cosas en la página.
2. Si tiene lógica que merezca pruebas, añade un `package.json` con `npm test` y súmala a la matriz del workflow.
3. Sigue las convenciones de [`AGENTS.md`](AGENTS.md): permisos mínimos, peticiones en el service worker, UI aislada en Shadow DOM o con prefijo, textos en español.
4. Añádela a la tabla de arriba.

## Estructura

```
dau-extensions/
├── extensions/          una carpeta por extensión, cada una autocontenida
├── archive/             versiones viejas o experimentos que ya no se usan
├── tools/               herramientas de todo el repo
├── .github/workflows/   integración continua
├── .opencode/skills/    skills de diseño de interfaces (jakubkrehel/skills, MIT)
└── AGENTS.md            convenciones para agentes de código
```

## Skills de diseño

`.opencode/skills/` trae una copia de las skills de [jakubkrehel/skills](https://github.com/jakubkrehel/skills) dedicadas a interfaces: UI, color, tipografía, layout, accesibilidad, redacción y revisión. OpenCode las carga solo al abrir este proyecto. El commit exacto está en `.opencode/skills/SOURCE`.
