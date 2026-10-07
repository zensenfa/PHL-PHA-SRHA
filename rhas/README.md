# Railway Hazard Analysis Suite (RHAS) – source tree

Single-file, offline hazard analysis tool for EN 50126-1/-2:2017 and EN 50129:2018.

## Layout

| Path | Content |
| --- | --- |
| `src/*.js`, `src/ui/*.js` | Application modules (order in `build-manifest.json`) |
| `src/data/*.json` | Normative data: calibration (EN 50126-1 Annex C), SIL table, hazard sources, guidewords, modes, demo project |
| `src/head.html`, `src/styles.css`, `src/markup.html` | Page shell |
| `src/VERSION` | Version stamped into the build |
| `vendor/` | SheetJS, mammoth, pdf.js (+ worker), unchanged |
| `tests/` | Node tests, fixtures, golden report snapshots |
| `build.py` | Builds `dist/Railway_Hazard_Analysis_Suite.html` |

## Build and test

```
python3 build.py          # -> dist/Railway_Hazard_Analysis_Suite.html
npm test                  # Node >= 20, no dependencies
```

Golden files in `tests/golden/` are text snapshots of the DOCX, XLSX and print
output for `tests/fixtures/reference-project.json`. When a report change is
intended, review the diff and run `npm run test:update-golden`.

## Provenance

This tree was recovered from `Railway_Hazard_Analysis_Suite_patched.html`
(version 2026-09-20-p1, PATCH-1 to PATCH-4 included). `python3 build.py`
reproduces that file byte for byte (verified with `cmp`).

## Known open items (tracked as tests)

- `reports contain no MIL-STD-882E reference` is marked `todo` until WP1
  (normative cleanup) removes the references.
