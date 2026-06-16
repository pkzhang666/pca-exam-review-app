# Screenshots

Images shown in the root [README.md](../../README.md).

| File | Screen |
|------|--------|
| `deck-list.png` | The deck library / home screen with the upload control |
| `study-question.png` | A graded question in the study view (showing the Next button) |

To refresh them, overwrite these PNGs with new captures (keep the same names).

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
