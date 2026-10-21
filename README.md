# RSOP back office

## Contents

- [Overview](#overview)
- [Run locally](#run-locally)
- [Checks](#checks)
- [Where things live](#where-things-live)
- [How the Designer works](#how-the-designer-works)
- [Design](#design)
- [Decisions applied](#decisions-applied)
- [When the sketch or the doc changes](#when-the-sketch-or-the-doc-changes)

## Overview

A first-draft, frontend-only UI for the RSOP back office, built from KJ's HLD sketch ([pics/](pics/), upright copy in [docs/sketch-upright.jpg](docs/sketch-upright.jpg)). Everything runs on mock data; nothing connects to RSOP, Raast, RabbitMQ or a biller. The plan behind it is in [docs/executive-summary.md](docs/executive-summary.md) and [docs/details.md](docs/details.md).

| Route | Screen |
|---|---|
| `/` | Sign in: any username and password go to the dashboard |
| `/dashboard/` | Bill-pay stats (collected, payments per hour, funnel, bill types) and billing (the bill ledger, filterable) |
| `/designer/inquiry/` | RSOP Designer, Inquiry flow: KJ's pipeline, YAML params, four sample transactions on a timeline |
| `/designer/payment/` | RSOP Designer, Payment flow: KJ's blocks plus the doc's Validate, Await ACSP and Rejected steps |
| `/users/` | Users, search and role filter, roles and permissions, invite and edit dialog (sends nothing) |

`/designer/` redirects to the Inquiry flow.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in dist/
npm run preview   # serve the built site
```

In Astro 7, `npm run preview` starts a background server; stop it with `npx astro preview stop`.

## Checks

```sh
npm run check
```

This runs two things:

- `astro check`: strict TypeScript across every page, component and data file.
- `npm run check:data`: Node's built-in test runner on `tests/`. It checks:
  - **Shape.** Both flows are sound graphs: one start, no dangling edges, every step reachable, no overlapping steps.
  - **The sketch.** The Inquiry main line is exactly KJ's pipeline, the Payment flow keeps KJ's blocks in KJ's order, and every step the sketch doesn't draw is tagged as coming from the doc.
  - **The doc.** The sample transactions follow the doc's demo checks:
    - the inquiry ID is returned unchanged;
    - a refused payment never reaches bill marking;
    - bill marking only follows ACSP;
    - a bill-marking failure is retried without reversing the payment.
  - **The dashboard.** Every series adds up to its total, and every trace link opens a real sample transaction.
  - **YAML.** The serializer quotes what YAML would misread and keeps `TBC` notes as comments.

## Where things live

| What | File |
|---|---|
| The two flows, with their YAML params and sample transactions | `src/data/flows/inquiry.ts`, `src/data/flows/payment.ts` |
| Shared sample bills and references | `src/data/sample.ts` |
| Dashboard figures and the bill ledger | `src/data/dashboard.ts`, `src/data/bills.ts` |
| Users, roles and permissions | `src/data/users.ts` |
| Flow types, grid layout, graph checks, state at a timeline position | `src/lib/flow.ts` |
| Data → coloured YAML | `src/lib/yaml.ts` |
| The Designer (rail, canvas, timeline, inspector) | `src/components/designer/`, `src/scripts/designer.ts`, `src/styles/designer.css` |
| Dashboard tiles and charts | `src/components/dashboard/`, `src/scripts/charts.ts`, `src/scripts/billing.ts`, `src/styles/dashboard.css` |
| Colour, type and glass tokens | `src/styles/global.css` |

## How the Designer works

- **Rendered at build time.** Every step, YAML block, transaction event and Debug entry is rendered when the site is built. The script only switches state. Without JavaScript, the page still lists the whole pipeline, every step's parameters and every transaction's events.
- **The layout.** It follows the sketch:
  - Left: flows, then the transactions numbered 1–4.
  - Middle: the canvas, with the timeline under it.
  - Right: the selected step's Params (YAML) and Debug tabs.
- **Picking a transaction** overlays it on the canvas. Each step shows passed, failed or waiting; steps not reached are dimmed; crossed edges are drawn solid, and the current event's step pulses.
- **The timeline** is a native range input laid over the event dots, so pointer, keyboard and screen-reader users share one control. Moving it selects the event's step, and the Debug tab shows only what had happened by then.
- **Deep links.** `?txn=3&at=12&tab=debug#node-rest` opens a view exactly. `?txn=none` shows the bare design.
- **Zoom.** The canvas opens at "fit", never below 70%; below that it scrolls sideways within itself.

## Design

- **The family look.** RSOP demo's tokens, fonts (EB Garamond and Nunito, both under the SIL Open Font License) and theme toggle, so both demos read as one family. Dark is the default.
- **Denser than RSOP demo.** Smaller type and edge-to-edge panels; the serif is kept for page titles.
- **Step colours** follow RSOP demo's party colours: Raast-facing pink, RSOP violet, the queue orange, outbound blue, the store grey, the biller green, refusal red. A dashed outline marks a step added from the doc rather than drawn on the sketch.
- **Chart colours** were checked with the dataviz colour-vision validator on this UI's own surfaces.
  - The settled/refused pair passes in both themes.
  - A third, "awaiting", colour failed beside refused, so awaiting has its own tile instead of a stack segment.
  - The funnel uses a validated ordinal blue ramp.
- **Accessibility.**
  - Every chart has a table view and keyboard-reachable tooltips.
  - Statuses always carry an icon and a word.
  - axe-core reports no violations on any screen in either theme.

## Decisions applied

None of these were confirmed; each is the plan's default (see [docs/details.md](docs/details.md#12-open-questions)).

| Question | Applied |
|---|---|
| Which are the "4 screen static"? | Sign in, Dashboard, Designer, Users, all on mock data |
| Designer: editor or viewer? | Viewer; YAML read-only |
| Stack | Astro, as in RSOP demo |
| Payment canvas | KJ's blocks plus the doc's Validate, Await ACSP and Rejected, tagged "From the doc" |
| The "T…" box, the "Tim…" strip, "Dvb…" | Transactions 1–4, a timeline, a Debug tab |
| "Billing" | The bill ledger, not fee invoicing |
| `NAUT` or `NAUTH` | `NAUT`, as in RSOP demo |
| Branding and hosting | Neutral, local only |

## When the sketch or the doc changes

1. Edit the flow in `src/data/flows/`: nodes, edges, params or transactions.
2. Run `npm run check`. A failing test names the step, edge or doc rule that broke.
3. If KJ's main line itself changes, update `SKETCH` in `tests/flows.test.ts` to match the new sketch.
