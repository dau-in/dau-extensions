# Ukrainian Gang Extension design

The chosen direction is **Receipt**: every price is shown as a printed receipt on light paper over Steam's dark store. It has perforated edges, a blue rubber-stamp emblem and the bolívar total marked with a highlighter and an accounting double rule.

| File | What it is |
|------|------------|
| `../src/shared/receipt.css` | The real system: tokens and components. Used by the store (Shadow DOM), the popup and the settings page. |
| `../src/shared/icons.js` | The "ticket stub" emblem, the small mark, the icons and the barcode. |
| `receipt.html` | Final mockup of the receipt, the emblem and the icon. Open it in a browser. |
| `exploration/` | What was tried before choosing: the original dark UI, color and shape variants, typography directions and five visual directions. Not loaded by the extension, and kept as they were written: the mockups show the Spanish UI. |

## Decisions

- **Light paper over Steam.** It is what sets the extension apart from the store's dark UI most. To look physical, the paper has grain, a slight shading at the edges and a shadow that lifts it off the page.
- **Ink palette.** Paper `oklch(0.955 0.01 85)`, ink `oklch(0.22 0.01 80)`, soft ink `oklch(0.47 0.012 80)`, stamp blue `oklch(0.45 0.17 262)`, highlighter `oklch(0.9 0.15 100)`, red ink for discounts and errors and green ink for good news. Every text pair passes WCAG AA; the tightest is red ink on paper at 5.74:1.
- **Martian Mono** everywhere, at three widths: 87.5 % for text, 100 % for large figures and 112.5 % for titles. It ships with the extension (OFL) in two subsets, latin and latin-ext; the second has the ₴.
- **"Ticket stub" emblem.** A ticket stub with "UKRAINIAN GANG", "EXTENSION" and the UG monogram crossed by the two bars of the hryvnia sign. Drawn as a rubber stamp with slightly worn ink. At 16–32 px a simplified version is used: the blue stub with "UG".
- **No text separators** such as "·" or "|". Structure comes from spacing, receipt lines and shape.
- **Several purchases, several tickets.** When a game page has more than one purchasable block, every ticket says which one it is ("Purchase 2 of 3") and only the first keeps the full letterhead; the rest use a shorter header with a smaller emblem and no date, so the page is not a stack of identical headers.
- **Minimal motion.** Only color transitions, the disclosure arrow and the button shrinking when pressed. With `prefers-reduced-motion` the scale, rotation and loading pulse go away.
- **Windows high contrast.** The perforation masks are dropped and system borders are drawn instead.

## Tools

- `npm run icons` renders `icons/icon-*.png` from the emblem.
- `npm run docs` renders the README images in `docs/`.
- `npm run palette` measures the palette of the discarded dark UI. Kept for reference.
