# Tirs | طِـرْس
> **A distraction-free, high-fidelity document reading environment.**

Tirs (طِرس — Arabic for *the pristine folio*) is a modern, local-first PDF reading application crafted for deep focus, typographic clarity, and cognitive calm.

---

## Highlights

* **Precision Typography & Native Selection:** High-DPI subpixel canvas rendering coupled with a transparent native TextLayer for accurate text selection, highlighting, and copying (`Ctrl + C`).
* **Calibrated Ambient Environments:** 5 distinct reading palettes (Paper, Midnight OLED, E-Ink Monochrome, Warm Amber, Studio Pure).
* **Focus Guidance Ruler:** Minimalist line-level focus mask (`R`) tracking cursor velocity at 144Hz.
* **In-Document Search:** Rapid sequential phrase matching (`Ctrl + F`) with instant page jumping.
* **Lightweight Concurrency Pipeline:** Windowed virtualization and adaptive render queue ensuring low memory footprint even on massive volumes.
* **Ambient Sound Synth:** Zero-external-file synthetic brown noise/rain generator powered entirely by Web Audio API.
* **Local-First & Private:** Zero telemetry, no cloud dependencies, completely offline.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :---: | :--- |
| `J` / `↓` | Advance line / Next page |
| `K` / `↑` | Reverse line / Previous page |
| `Ctrl + F` | Toggle in-document search |
| `+` / `-` | Zoom in / Zoom out |
| `0` | Reset zoom to 100% |
| `T` | Cycle color environments |
| `R` | Toggle Focus Ruler mask |
| `F` | Toggle immersive fullscreen |
| `S` | Toggle table of contents and page drawer |
| `Esc` | Dismiss active overlays |

---

## Development

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Build production bundle
npm run build
```

---

## License

MIT © [XRTM8](https://github.com/XRTM8)
