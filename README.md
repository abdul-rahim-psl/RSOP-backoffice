# RSOP back office

## Contents

- [Overview](#overview)
- [Run locally](#run-locally)
- [Checks](#checks)
- [The flow API](#the-flow-api)
- [The bill log APIs](#the-bill-log-apis)
- [Where things live](#where-things-live)
- [How the Designer works](#how-the-designer-works)
- [Design](#design)
- [Decisions applied](#decisions-applied)
- [When the API, the sketch or the doc changes](#when-the-api-the-sketch-or-the-doc-changes)

## Overview

A first-draft UI for the RSOP back office, built from KJ's HLD sketch ([pics/](pics/), upright copy in [docs/sketch-upright.jpg](docs/sketch-upright.jpg)). The Designer's steps come from RSOP's flow API, and the dashboard, Inquiries and Payments from the bill log APIs, each fetched by the preview server on every page load (see [The flow API](#the-flow-api) and [The bill log APIs](#the-bill-log-apis)). Everything else runs on mock data, and the browser itself connects to nothing: not RSOP, Raast, RabbitMQ or a biller. The plan behind it is in [docs/executive-summary.md](docs/executive-summary.md) and [docs/details.md](docs/details.md).

| Route | Screen |
|---|---|
| `/` | Sign in: any username and password will do. Every other screen needs the session it starts: without one, `src/middleware.ts` sends you here and back afterwards. **Log out** in the header ends it |
| `/dashboard/` | Bill-pay activity, **live**: today's counts from both logs (bills paid, inquiries, payments, reply times), needs-attention tiles, payments and inquiries per hour, the inquiry-to-paid funnel, what didn't come back SUCCESS, and the latest entries. No amounts: the logs don't carry them |
| `/inquiries/` | Bill inquiries, **live**: every inquiry the log API recorded, with result, reply time and caller; a drawer per inquiry with IDs, participants and headers. Shown to the Admin role |
| `/payments/` | Bill payments, **live**: the same screen over the payment log, with "Paid" for SUCCESS. Shown to the Admin role |
| `/designer/inquiry/` | RSOP Designer, Inquiry flow: the API's chain, which is KJ's pipeline plus the gateway; YAML params; one sample transaction, "FBR", on a timeline |
| `/designer/payment/` | RSOP Designer, Payment flow: the API's two chains (pacs.008 → AUTH, then ACSP → bill marking), plus the doc's inquiry store and Rejected steps |
| `/users/` | Users, search and role filter, roles and permissions, invite and edit dialog (sends nothing) |

`/designer/` redirects to the Inquiry flow.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # dist/client (static pages) and dist/server (the Designer, rendered per request)
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
  - **Shape.** Both flows are sound graphs: one start per lane, no dangling edges, every step reachable, no overlapping steps.
  - **The API.** Each lane's steps are exactly its chain in the snapshot, every service the API names has a registry entry, and only API steps carry API data.
  - **The sketch.** The Inquiry keeps KJ's blocks in KJ's order, with only the gateway and End added, and "WS" on the hop into the biller.
  - **The chain parser.** It reads the three live chains and refuses malformed ones, naming the problem.
  - **The doc.** The sample transactions follow the doc's demo checks:
    - the inquiry ID is returned unchanged;
    - a refused payment never reaches bill marking;
    - bill marking only follows ACSP;
    - a bill-marking failure is retried without reversing the payment.
  - **The dashboard.** Every series adds up to its total, and every trace link opens a real sample transaction.
  - **YAML.** The serializer quotes what YAML would misread and keeps `TBC` notes as comments.

## The flow API

RSOP answers two endpoints with each flow's chain of services, for example `Start<-->raast-api-gateway<-->…-->End`. `<-->` is a request and its reply, and `-->` is one way.

```sh
npm run api:pull    # fetch both chains into src/data/api/snapshot.json; prints what changed
npm run api:check   # compare the live API with the snapshot; exits 1 if they differ or it can't be reached
```

- **Base URL.** It defaults to `http://192.168.9.15:9991`; set `RSOP_API_BASE` to point elsewhere.
- **Every Designer page load calls the API.** The preview server makes the call, not the browser: the API sends no CORS headers and sits on a private address. The toolbar's green pill reads "RSOP API · live" with the fetch time.
- **The fallback.** If the API doesn't answer within 3 s, or its answer lacks a chain a flow needs, the page draws the snapshot instead. The pill then reads "API unreachable · snapshot", with the reason on hover.
- **Pages that need a server.** All of them: every page renders per request (`output: 'server'`) so the sign-in check runs first. `npm run preview` (port 4392 here) runs the Node adapter's server.
- **The snapshot** is the tests' fixture and the fallback. `npm run api:pull` refreshes it.
- **The snapshot keeps the raw responses**, so a parser change never needs a new pull.
- **A new service.** If the API adds one, the page still renders it as a plain step. `npm run check` then names the service, the missing description and any sample transaction it breaks.
- **The plan behind this** is in [docs/api-integration/plan.md](docs/api-integration/plan.md).

## The bill log APIs

Two logs on `http://10.0.150.35:7774`, with the same entry shape. The server reads each on every load of its page (5 s timeout; the API also fails CORS, like the flow API).

| Log | Endpoint | Page | Base URL override | Fallback snapshot |
|---|---|---|---|---|
| Inquiries | `GET /api/v1/billInquirylist` | `/inquiries/` | `RSOP_INQUIRY_LOG_BASE` | `src/data/api/inquiry-log.snapshot.json` |
| Payments | `GET /api/v1/billPaymentlist` | `/payments/` | `RSOP_PAYMENT_LOG_BASE` | `src/data/api/payment-log.snapshot.json` |

- **Results.** Code `0` → "Bill returned" (inquiries) or "Paid" (payments); any other code → "Error reply" with the API's description; no reply recorded → "No reply".
- **Loader.** Each live screen (dashboard, Inquiries, Payments) arrives at once with a loader; its content is a server island (`server:defer`) that reads the logs and replaces the loader, waiting up to 15 s. As of 2026-10-22 `billPaymentlist` takes 5–7 s.
- **Fallback.** If a log can't be read, its page shows its snapshot; only the header pill turns amber ("unreachable · snapshot"), with the reason on hover. No banner. `npm run log:pull` refreshes both; `npm run log:pull payment` refreshes one.
- **Code.** `src/data/api/bill-log.ts` (each log's path and wording, fetch, header parsing, summary), `src/components/log/LogScreen.astro` and `EntryDetail.astro` (the screen and its drawer), `src/scripts/bill-log.ts`. `src/pages/inquiries.astro` and `payments.astro` only pick the log.

## Where things live

| What | File |
|---|---|
| The two flows: descriptions, YAML params, the doc's steps and sample transactions | `src/data/flows/inquiry.ts`, `src/data/flows/payment.ts` |
| The API snapshot, its endpoints, the service registry (labels, icons, families) and `buildFlow()` | `src/data/api/` |
| Reading a chain string | `src/lib/chain.ts` |
| Pulling or checking the snapshot | `tools/api-pull.ts` |
| Shared sample bills and references | `src/data/sample.ts` |
| Users, roles and permissions | `src/data/users.ts` |
| Flow types, lane and grid layout, graph checks, state at a timeline position | `src/lib/flow.ts` |
| Data → coloured YAML | `src/lib/yaml.ts` |
| The Designer (rail, canvas, timeline, inspector) | `src/components/designer/`, `src/scripts/designer.ts`, `src/styles/designer.css` |
| Dashboard figures (all from the logs), tiles and charts | `src/data/dashboard.ts`, `src/components/dashboard/`, `src/scripts/charts.ts`, `src/styles/dashboard.css` |
| Colour, type and glass tokens | `src/styles/global.css` |

## How the Designer works

- **Steps from the API.**
  - Each canvas draws the chains the API returns for that page load. Payment's two chains are two titled lanes.
  - An arrowhead at both ends marks a request and its reply. A hop's label is the message it carries ("pacs.008", "AUTH", "ACSP").
  - Start and End mark where a chain begins and ends; they take no transaction status.
  - The inspector shows where the API puts each step: its endpoint, key, position and neighbours.
- **Rendered at build time.** Every step, YAML block, transaction event and Debug entry is rendered when the site is built. The script only switches state. Without JavaScript, the page still lists the whole pipeline, every step's parameters and every transaction's events.
- **The layout.** It follows the sketch:
  - Left: flows, then the sample transaction, "FBR" (one per flow).
  - Middle: the canvas, with the timeline under it.
  - Right: the selected step's Params (YAML) and Debug tabs.
- **Picking a transaction** overlays it on the canvas. Each step shows passed, failed or waiting; steps not reached are dimmed; crossed edges are drawn solid, and the current event's step pulses.
- **The timeline** is a native range input laid over the event dots, so pointer, keyboard and screen-reader users share one control. Moving it selects the event's step, and the Debug tab shows only what had happened by then.
- **Deep links.** `/designer/inquiry/?txn=3&at=7&tab=debug#node-rest` opens a view exactly. Payment step ids carry their lane: `#node-auth-receive`, `#node-acsp-saf-consume`. `?txn=none` shows the bare design.
- **Zoom.** The canvas opens at "fit", never below 70%; below that it scrolls sideways within itself.

## Design

- **The family look.** RSOP demo's tokens, fonts (EB Garamond and Nunito, both under the SIL Open Font License) and theme toggle, so both demos read as one family. Dark is the default.
- **Denser than RSOP demo.** Smaller type and edge-to-edge panels; the serif is kept for page titles.
- **Step colours** follow RSOP demo's party colours:
  - Raast-facing: pink.
  - RSOP: violet.
  - Queues and the notification broker: orange.
  - Outbound calls: blue.
  - The store and the SAF dispatcher: grey.
  - The biller: green.
  - Refusal: red.

  A dashed outline marks a step added from the doc rather than returned by the API.
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
| Where each flow's steps come from | RSOP's flow API, fetched by the server on every Designer page load; the committed snapshot is the fallback |
| The API or the sketch, when they differ | The API decides the steps; the sketch names the ones it draws |
| Payment canvas | One page, two lanes, plus the doc's inquiry store and Rejected, tagged "From the doc" |
| The API's messages (`GET PACS008`) | Edge labels, shortened to "pacs.008", "AUTH" and "ACSP" |
| Raw service names (`fbr-biller-mock`) | Shown in mono under a neutral label |
| The "T…" box, the "Tim…" strip, "Dvb…" | Sample transactions (one per flow, "FBR"), a timeline, a Debug tab |
| "Billing" | The bill ledger, not fee invoicing |
| `NAUT` or `NAUTH` | `NAUT`, as in RSOP demo |
| Branding and hosting | Neutral, local only |

## When the API, the sketch or the doc changes

1. **The API.** Run `npm run api:pull` and read the change it prints. Then:
   - add any new service to `src/data/api/services.ts`;
   - describe its step in the flow file;
   - move the sample transactions onto the new steps.
2. **The sketch or the doc.** Edit the flow in `src/data/flows/`: descriptions, params, the doc's steps or the transactions.
3. **Check.** Run `npm run check`. A failing test names the service, step, edge or doc rule that broke.
4. **KJ's main line.** If it changes, update `SKETCH` in `tests/flows.test.ts` to match the new sketch.
