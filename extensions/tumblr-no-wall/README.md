# tumblr-no-wall

Extensión para navegar Tumblr sin cuenta.

- Oculta el popup y la barra de "Sign up or log in" y devuelve el scroll de la página.
- Al pasar el ratón por una imagen de un post aparecen dos botones:
  - **HD** abre un visor con la versión más grande que ofrece Tumblr. Clic en la imagen para hacer zoom y `Esc` para cerrar.
  - **Pin** guarda la imagen en alta en Pinterest, enlazada al post original, con el blog y las etiquetas como descripción.

Versión 1.2.0. Funciona en `*.tumblr.com`.

## Instalar

Carga esta carpeta como extensión sin empaquetar (ver el README de la raíz).

## Archivos

| Archivo | Qué hace |
|---------|----------|
| `manifest.json` | Manifest V3. Inyecta los scripts en `document_start` sin pedir permisos extra. |
| `content.js` | Detecta y oculta el muro de login, y quita el bloqueo de scroll e `inert`. |
| `viewer.js` | Botones HD y Pin sobre las imágenes, y el visor a pantalla completa. |
| `content.css` | Estilos de lo anterior, todos con el prefijo `tnw-`. |

## Cómo detecta el muro

Tumblr ofusca sus clases CSS, así que el muro se reconoce **por su texto** (`sign up or log in`, `continue with google`, `regístrate o inicia sesión`…). Se oculta el primer contenedor `position: fixed` que lo envuelve y que no contiene posts, para no tapar el panel de un blog abierto.

Si Tumblr cambia esos textos, hay que actualizar `PHRASES` y `FRAGMENTS` en `content.js`.

## Historial

`archive/tumblr/inject.json` es una versión anterior del script de `content.js`, pensada para un inyector de JS y CSS. No desactiva el `<style>` con `overflow: hidden` que trae el popup, así que esta extensión la supera.
