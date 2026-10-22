# RSOP Back Office

An Astro back office for RSOP (Raast Service Orchestration Platform): a dashboard and bill inquiry and payment logs read live from RSOP, a flow designer, and user management. It is demoed to executives.

- `npm run check`: type check plus `tests/`. Run it after every change.
- A dev server usually runs on :4321 (`astro dev`) and reloads on save. The :4392 preview (`astro preview`) serves `dist/`, so it needs `npm run build` and a restart to show changes.

## Visual system: SAP Fiori Horizon

The UI follows SAP Fiori's Horizon theme (light by default), with Evening Horizon as the dark theme. It should read as a mature enterprise product built by a product team. Nothing should look hand-crafted, playful or AI-generated.

**The source of truth is `src/styles/global.css`.** Its tokens hold the real Horizon values (from `@sap-theming/theming-base-content`), and its shared classes are already Fiori-shaped: `.btn`, `.btn.primary`, `.pill` (tag), `.chip`/`.chips` (segmented button), `.input`, `.field`, `.glass` (card), `.table`/`.table-wrap`, `.page-head` (white full-width header band), `.crumbs`, `.title`, `.section-head`. Use them, and use the tokens (`--panel`, `--ink`, `--mut`, `--stroke`, `--link`, `--accent`, `--ok`/`--ok-ink`/`--ok-bg`, and so on) instead of hex values, so both themes work.

### Fiori patterns to follow
- **Type:** the 72 font only (`--font-sans`, `--font-mono` for IDs). Base size 14px. Weights are 400, 600 and 700 only; never 800/900. Titles are bold and plain: page title 1.375rem, section/card title 1rem.
- **Labels:** sentence case or title case, never uppercase with letter-spacing. Table headers are normal-weight `--mut` text.
- **Cards:** `--panel` surface, `--radius` (12px), `--card-shadow`, no border, no blur, no gradients. A card header is a bold 1rem title, with an optional `--mut` subtitle under it.
- **Buttons:** 36px tall, 8px radius. Default buttons are white with blue text; the one primary action per view is solid `--accent`. Icon-only buttons are transparent. No pill (999px) shapes, and no black/ink-filled buttons.
- **Status (ObjectStatus):** in tables and lists, an icon plus coloured text (`--ok-ink`, `--fail-ink`, `--wait-ink`, `--info-ink`), no background. Use a tinted tag (`.pill`) only for a short label that needs to stand out.
- **KPI tiles:** small `--mut` label, large number (2rem, 400 or 600 weight, `--ink-2`), short unit/subtitle. Semantic colour only on the number when it is good or bad news.
- **Charts:** Horizon chart colours (`--viz-*`), thin gridlines, axis labels in `--mut` at 0.75rem.
- **Selection:** selected rows and items use the `--selected` background with a `--link` left or bottom indicator.
- **Radius:** cards 12px, buttons 8px, fields 4px, tags 4px. Circles only for avatars and status dots.

### Copy
- Short enterprise labels, not sentences that explain the UI. "Source: RSOP inquiry log", not "Every bill inquiry the log has recorded, newest first, and what came back."
- No decorative punctuation (no full stop after headings), no spaced-capital labels, no marketing lines.
- Keep every fact, figure and live-data label that is already shown. Restyle and shorten wording; don't drop information or behaviour.

### Do not
- Use SAP's logo, the "SAP" name or "Fiori" in the UI. Only the visual language is borrowed.
- Bring back serif type, glow backgrounds, glassmorphism, emoji, or colours outside the tokens.
