# Diseño de Ukrainian Gang Extension

La dirección elegida es **Recibo**: cada precio se muestra como un ticket impreso en papel claro sobre la tienda oscura de Steam. Tiene borde troquelado, sello de tinta azul y el total en bolívares marcado con resaltador y doble raya de contabilidad.

| Archivo | Qué es |
|---------|--------|
| `../src/shared/receipt.css` | El sistema real: tokens y componentes. Lo usan la tienda (Shadow DOM), el popup y los ajustes. |
| `../src/shared/icons.js` | El emblema «talón», la marca pequeña, los iconos y el código de barras. |
| `recibo.html` | Maqueta final del recibo, del emblema y del icono. Ábrela en el navegador. |
| `exploracion/` | Lo que se probó antes de elegir: la UI oscura original, variantes de color y forma, direcciones tipográficas y las cinco direcciones visuales. No se carga en la extensión. |

## Decisiones

- **Papel claro sobre Steam.** Es lo que más separa la extensión de la interfaz oscura de la tienda. Para que el papel se vea físico, lleva grano, un leve sombreado en los bordes y una sombra que lo despega de la página.
- **Paleta de tinta.** Papel `oklch(0.955 0.01 85)`, tinta `oklch(0.22 0.01 80)`, tinta suave `oklch(0.47 0.012 80)`, sello azul `oklch(0.45 0.17 262)`, resaltador `oklch(0.9 0.15 100)`, tinta roja para descuentos y errores y tinta verde para las buenas noticias. Todos los pares de texto pasan WCAG AA; el más justo es la tinta roja sobre el papel, con 5,74:1.
- **Martian Mono** en todo, a tres anchuras: 87,5 % para el texto, 100 % para las cifras grandes y 112,5 % para los títulos. Va incluida en la extensión (licencia OFL) en dos subconjuntos, latin y latin-ext; este último trae el ₴.
- **Emblema «talón».** Un talón de ticket con «UKRAINIAN GANG», «EXTENSION» y el monograma UG cruzado por las dos barras de la grivna. Se dibuja como sello de goma, con la tinta algo gastada. A 16–32 px se usa una versión simplificada: el talón azul con «UG».
- **Sin separadores de texto** como «·» o «|». La estructura sale del espacio, de las líneas del ticket y de la forma.
- **Movimiento mínimo.** Solo hay transiciones de color, la flecha del desplegable y el botón que se encoge al pulsarlo. Con `prefers-reduced-motion` se quitan la escala, el giro y el pulso de carga.
- **Alto contraste de Windows.** Se quitan las máscaras del troquelado y se dibujan bordes del sistema.

## Herramientas

- `npm run iconos` regenera `icons/icon-*.png` a partir del emblema.
- `npm run paleta` mide la paleta de la UI oscura descartada. Se conserva como referencia.
