# dau-extensions

Extensiones de navegador personales. Cada una vive en su propia carpeta dentro de `extensions/` y se carga en Brave, Chrome, Edge u Opera como extensión sin empaquetar.

| Extensión | Qué hace | Estado |
|-----------|----------|--------|
| [`tumblr-no-wall`](extensions/tumblr-no-wall/) | Quita el muro de "Sign up or log in" de Tumblr, devuelve el scroll y añade un visor HD y un botón para guardar en Pinterest. | En uso, v1.2.0 |
| [`steam-precios-ug`](extensions/steam-precios-ug/) | Precios de la tienda de Steam (región Ucrania) en HK$, USDT y bolívares según Binance P2P, con lista de compra propia y comparación de regiones. | Por construir. Ver [`HANDOFF.md`](extensions/steam-precios-ug/HANDOFF.md) |

## Instalar una extensión

1. Abre `brave://extensions` (o `chrome://extensions`, `edge://extensions`).
2. Activa el **Modo de desarrollador**.
3. Pulsa **Cargar extensión sin empaquetar** y elige la carpeta de la extensión, por ejemplo `extensions/tumblr-no-wall`.
4. Tras cambiar el código, pulsa el botón de recargar de la extensión y refresca la página.

Si una extensión tiene paso de compilación, su propio README dice qué carpeta cargar.

> Si ya tenías `tumblr-no-wall` cargada desde su ruta anterior (`Desktop\Development\tumblr\tumblr-no-wall`), el navegador mostrará un error. Quítala y vuelve a cargarla desde `extensions/tumblr-no-wall`.

## Estructura

```
dau-extensions/
├── extensions/          una carpeta por extensión, cada una autocontenida
├── archive/             versiones viejas o experimentos que ya no se usan
├── .opencode/skills/    skills de diseño de interfaces (jakubkrehel/skills, MIT)
└── AGENTS.md            convenciones para agentes de código
```

## Skills de diseño

`.opencode/skills/` trae una copia de las skills de [jakubkrehel/skills](https://github.com/jakubkrehel/skills) dedicadas a interfaces: UI, color, tipografía, layout, accesibilidad, redacción y revisión. OpenCode las carga solo al abrir este proyecto. El commit exacto está en `.opencode/skills/SOURCE`.
