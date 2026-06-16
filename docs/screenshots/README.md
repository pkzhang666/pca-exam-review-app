# Screenshots

The root README references images here. The `.svg` files are **placeholders** —
replace them with real screenshots of the running web app.

## What the README expects

| File | Screen |
|------|--------|
| `deck-list.svg` (or `.png`) | The deck library / home screen with the upload control |
| `study-question.svg` (or `.png`) | A graded question in the study view (showing the Next button) |

Two ways to swap them in:

1. **Easiest:** drop `deck-list.png` and `study-question.png` here, then change the
   two `src="docs/screenshots/*.svg"` references in the root [README.md](../../README.md)
   to `*.png`.
2. Or just overwrite the `.svg` files (keep the same names) and leave the README
   as‑is.

## Capturing the real screenshots

Run the app locally (see the root README → Quickstart), open
http://localhost:5173, and:

- **Manually:** open the "PCA Exam Review (built-in)" deck, answer a question so
  the explanation + Next button show, and use your OS screenshot tool. A window
  width around **1100–1300px** matches the two‑pane layout best.
- **Scripted (optional):** with the stack running, a few lines of Playwright will
  do it:

  ```bash
  npm i -D playwright && npx playwright install chromium
  ```
  ```js
  // capture.mjs — node capture.mjs
  import { chromium } from 'playwright';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('http://localhost:5173');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'docs/screenshots/deck-list.png' });
  // …click into a deck, answer a question, then screenshot study-question.png…
  await b.close();
  ```
