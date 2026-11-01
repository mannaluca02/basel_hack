# Pax UI controls in the web app

Research date: 2026-11-01 (issue #65). Status: measured from the public Pax UI Storybook and applied in `code/apps/web/src/styles.scss` and the Abschluss tab.

## Source and method

Computed styles read with Playwright from the rendered stories at `https://ui.pax.ch/iframe.html?viewMode=story&id=<story>` (story IDs from `https://ui.pax.ch/index.json`). Values below are measurements, not documentation text.

| Story | Measured |
|---|---|
| `buttons-button--all-variants` | Pill (`border-radius: 1000px`), height 54 px, padding 16 px 28 px, 16 px Medium (500). Primary: Pax Green fill, black text. Outline: 1 px black border, no fill. Ghost: no border. Disabled primary: 10 % black fill, 50 % black text. |
| `forms-input--default` | Height 52 px, padding 12 px, radius 10 px, 1 px border `#adadad` (gray-4). Label 14 px Regular, 8 px above the field. |
| `forms-select--default` | Same box as the input (min-height 52 px, radius 10 px). |
| `forms-checkbox--all-states` | 24 px square, radius 4 px; checked: Pax Green fill with a white check. |
| `forms-radio-group--default` | 24 px circle. |
| `navigation-progress-steps--all-states`, `--horizontal-mobile` | 40 px circles. Completed: Pax Green with a white check. Active: Pax Green with a 12 px white dot. Pending: gray-1 fill, 1 px gray-3 border, number in gray-6 Medium. Line between the circles: track 10 % black, filled in Pax Green up to the active step. Labels 14 px below the circles; below 640 px the labels are hidden and "Schritt 3: <label>" is shown under the row. |

## What the app uses

Global classes in `src/styles.scss`, used by every view instead of local copies:

- `.action` (outline), `.action--primary` (filled), `.action--danger` (end the call), `.action--compact` (inside a one-line note).
- `.card`: the chart card surface (`--radius-xl`, `--border-soft`, `--bg-default`).
- `.field`: text inputs and selects. `.choice`: the label around a checkbox or radio.
- `.badge`: the purple Demo pill.
- `h1` to `h3`: Pax typography at its mobile sizes (heading-xl 2 rem, heading-s 1.125 rem, 1 rem), Bold.

The Abschluss stepper follows the progress-steps pattern above.

## Advice dossier

The dossier (`code/apps/api/src/insurance/dossier.ts`) is a standalone HTML page: the app shows it in a sandboxed frame, and it is printed or saved on its own. It cannot load the app's stylesheet, so its `STYLE` block repeats the token values of `tokens.css`, light and dark: on screen it follows the system theme like the app, on paper it is always light. The Pax logo is inline SVG; its dot is deep purple in light and white in dark, as the app's two logo files.

It looks like the app: sections are cards (`.card`), the demo mark is the purple `.badge`, figures are right-aligned in tabular numerals. On phones (below 40 rem) each table row becomes a stacked block with "label: value" lines. Print uses A4 margins, drops the card frames and keeps rows and list items whole.

Kept short on purpose: no audience label for the customer, one review status below the results table when all figures share it (instead of a column), duplicate assumptions removed, the portal section only when there is something in it, and case, profile and snapshot IDs in a small footer.

Open point: the uppercase "DEMO – KEIN VERSICHERUNGSSCHUTZ" comes from the backend message catalogue (`common.demo`) and is asserted by backend tests; Pax Brand avoids uppercase. Changing it is a content decision, not a styling one.

## Deliberate deviations from Pax

All for WCAG 2.2 AA; `npm run check:tokens` covers the text pairs.

| Pax | App | Reason |
|---|---|---|
| Button height 54 px | 44 px (`2.75rem`) | Same touch target as the rest of the app; 54 px crowds the phone layout. |
| Input and checkbox border gray-4 | `--border-default` | Gray-4 is 2.3:1 on white; a control's outline needs 3:1 (1.4.11). |
| White check and dot on Pax Green | `--text-on-brand` (black) | White on Pax Green is 1.93:1. |
| Disabled primary: 10 % / 50 % black | `--bg-muted` / `--text-muted` | No colour literals outside `tokens.css`; same look, AA-checked pair. |
| Custom-drawn checkbox | Native checkbox with `accent-color: var(--bg-brand)` | The browser picks a contrasting check mark; no SVG with colour literals. |
