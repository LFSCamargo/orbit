# Creating Orbit Themes

Design system reference: [docs/UI.mdc](UI.mdc). Command contract: [docs/DESIGN_DOC.mdc](DESIGN_DOC.mdc).

Orbit themes are plain JSON files. Drop them into your themes folder and they appear in **Settings → Interface theme**.

## Themes folder

On macOS the folder is created automatically:

```text
~/Library/Application Support/Orbit/themes/
```

You can also open Settings and use **Reload custom themes** after adding files. The active path is shown under the Custom theme card.

## Minimal theme

```json
{
  "id": "my-living-room",
  "name": "My Living Room",
  "description": "Warm couch-night palette for our house.",
  "author": "You",
  "fonts": {
    "display": "DM Sans",
    "body": "DM Sans"
  },
  "colors": {
    "canvas": "12 10 16",
    "surface": "22 18 28",
    "panel": "32 26 40",
    "foreground": "245 240 250",
    "muted": "160 150 170",
    "accent": "255 140 90",
    "focus": "255 190 140",
    "border": "60 50 72"
  },
  "radius": "1.25rem",
  "cardRadius": "1rem",
  "blur": "24px",
  "backgroundStyle": "radial",
  "layout": "orbit",
  "motion": {
    "duration": "0.35s",
    "easing": "cubic-bezier(0.22, 1, 0.36, 1)"
  }
}
```

Save as `my-living-room.json` in the themes folder.

## Color format

Every color is **space-separated RGB channels without commas** (same format CSS uses for `rgb(r g b / alpha)`):

| Token | Used for |
| --- | --- |
| `canvas` | App background |
| `surface` | Inputs / nested surfaces |
| `panel` | Cards and glass panels |
| `foreground` | Primary text |
| `muted` | Secondary text |
| `accent` | Primary CTA / highlights |
| `focus` | Controller focus ring |
| `border` | Subtle borders |

Tip: keep contrast high for TV / couch distance. Accent should stay readable on both canvas and panel.

## Optional fields

| Field | Purpose |
| --- | --- |
| `fonts.display` / `fonts.body` | Font family names (load the font yourself if it is not DM Sans) |
| `radius` | Large panel corner radius |
| `cardRadius` | Smaller card radius |
| `blur` | Backdrop blur for panels |
| `backgroundStyle` | `radial` · `ps5` · `switch` |
| `layout` | Changes the complete app layout and navigation: `orbit` · `ps5` · `switch` |
| `motion.duration` / `motion.easing` | Global transition feel |

## Built-in themes

Orbit ships with:

1. **Orbit Default** — cinematic dark launcher  
2. **PlayStation 5** — immersive artwork, circular tiles, glass panels  
3. **Switch 2** — bright home screen with square tiles and bottom dock  

Custom themes override a built-in theme **only if they reuse the same `id`**. Prefer unique ids like `house-neon-01`.

## Sharing themes with friends

1. Zip one or more `.json` theme files.  
2. Friends unpack them into their Orbit `themes/` folder.  
3. Open Settings → **Reload custom themes**.  
4. Focus a theme card with the controller and press Confirm.

No code changes required — themes are data.

## Controller notes

Theme cards are fully focusable. Use D-pad / stick to move, Confirm to apply. Theme choice is stored in Orbit settings and restored on next launch.

## Example: arcade neon

```json
{
  "id": "arcade-neon",
  "name": "Arcade Neon",
  "description": "High-energy neon for late-night sessions.",
  "author": "Orbit Community",
  "colors": {
    "canvas": "6 4 18",
    "surface": "16 10 34",
    "panel": "28 16 52",
    "foreground": "250 246 255",
    "muted": "170 150 200",
    "accent": "0 255 200",
    "focus": "255 80 200",
    "border": "70 40 110"
  },
  "radius": "0.85rem",
  "cardRadius": "0.65rem",
  "backgroundStyle": "radial",
  "layout": "orbit",
  "motion": {
    "duration": "0.26s",
    "easing": "cubic-bezier(0.2, 0.9, 0.2, 1)"
  }
}
```
