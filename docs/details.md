# RSOP Back Office: Detailed Plan

## Contents

- [1. Goal and audience](#1-goal-and-audience)
- [2. Sources and accuracy rules](#2-sources-and-accuracy-rules)
  - [2.1 Sources](#21-sources)
  - [2.2 Content rules](#22-content-rules)
- [3. Reading the sketch](#3-reading-the-sketch)
  - [3.1 Layout](#31-layout)
  - [3.2 The pipeline](#32-the-pipeline)
  - [3.3 Notes along the top](#33-notes-along-the-top)
  - [3.4 Labels still unread](#34-labels-still-unread)
- [4. Screens](#4-screens)
  - [4.1 Sign in](#41-sign-in)
  - [4.2 Dashboard](#42-dashboard)
  - [4.3 RSOP Designer](#43-rsop-designer)
  - [4.4 Users](#44-users)
- [5. The Designer in detail](#5-the-designer-in-detail)
  - [5.1 Layout](#51-layout)
  - [5.2 Canvas](#52-canvas)
  - [5.3 Transactions and timeline](#53-transactions-and-timeline)
  - [5.4 Inspector](#54-inspector)
  - [5.5 Deep links and keyboard](#55-deep-links-and-keyboard)
  - [5.6 Smaller screens](#56-smaller-screens)
  - [5.7 Without JavaScript](#57-without-javascript)
- [6. Data](#6-data)
  - [6.1 Types](#61-types)
  - [6.2 Inquiry flow](#62-inquiry-flow)
  - [6.3 Payment flow](#63-payment-flow)
  - [6.4 Sample transactions](#64-sample-transactions)
  - [6.5 Dashboard figures](#65-dashboard-figures)
  - [6.6 Users and roles](#66-users-and-roles)
- [7. Tech stack and project layout](#7-tech-stack-and-project-layout)
  - [7.1 Stack](#71-stack)
  - [7.2 Project layout](#72-project-layout)
  - [7.3 Implementation notes](#73-implementation-notes)
- [8. Visual design](#8-visual-design)
  - [8.1 Chart colours](#81-chart-colours)
- [9. Accessibility and motion](#9-accessibility-and-motion)
- [10. Quality checks](#10-quality-checks)
- [11. Delivery plan](#11-delivery-plan)
- [12. Open questions](#12-open-questions)

The short version is in [executive-summary.md](executive-summary.md).

## 1. Goal and audience

- **Goal.** A first-draft, clickable UI for the RSOP back office, built from KJ's HLD sketch, so the team can agree on screens and behaviour before any backend work.
- **Audience.** KJ, who drew the sketch; the developers who will build the real thing; and anyone reviewing the Open Connect RSOP demo.
- **Out of scope for now.** A backend, real sign-in, real RabbitMQ or biller connections, saving YAML, and drag-and-drop editing.
- **Built to grow.** The Designer takes a flow as plain data (nodes, edges and transactions), so a later version can feed it real flow definitions and real transaction logs.

## 2. Sources and accuracy rules

### 2.1 Sources

| Source | Used for | Where |
|---|---|---|
| KJ's HLD sketch, photographed 2026-10-21 | The four screens, the Designer's layout and the main line of the pipeline | [pics/KJ architecture for RSOP.jpeg](../pics/KJ%20architecture%20for%20RSOP.jpeg), upright copy [sketch-upright.jpg](sketch-upright.jpg) |
| Open Connect RAAST Orchestration Demo (Paysys Labs, 20 Oct 2026), "the doc" | How the flows behave: inquiry first, validation of the inquiry ID and amount pair, AUTH or NAUT, bill marking only after ACSP, retries and duplicates | [RSOP demo/docs/](../../RSOP%20demo/docs/Open_Connect_RAAST_Inquiry_and_Bill_Payment.docx) |
| RSOP demo (built 2026-10-21) | The procedure, stack, tokens, fonts, theme toggle and sample bill | [RSOP demo/](../../RSOP%20demo/) |
| The dataviz method (colour validator, mark specs) | Chart forms, chart colours and the table view behind every chart | Section [8.1](#81-chart-colours) |

### 2.2 Content rules

1. **The sketch is the authority for screens and the pipeline's main line.** The Designer keeps KJ's blocks in KJ's order. Steps added from the doc are drawn in the same style but carry a "From the doc" tag in the inspector, so additions are visible at a glance.
2. **The doc is the authority for behaviour.** Sample transactions follow the doc's agreed behaviour and its demo checks (section [10](#10-quality-checks)). Where the doc is silent, as for an inquiry the biller cannot find, the draft says it is draft behaviour.
3. **Configuration values are placeholders.** Queue names, endpoints, timeouts and header maps are invented to make the YAML panel realistic. The panel says so above every YAML block.
4. **Open mappings stay open.** The doc leaves open the pacs.008 element that carries the inquiry ID, the correlation fields, the mock API schemas, the rejection reason mapping and the inquiry expiry. The YAML shows `TBC` with a comment for these. Reasons are plain language: "Amount does not match", "Unknown inquiry", "Inquiry not eligible".
5. **Fictional data only.** People, banks, institutions, bills and amounts are invented. Email addresses use the reserved `.example` domain. No real logos or branding appear.
6. **Spelling.** "Raast", as SBP writes it (the doc writes "RAAST"). Message names in ISO lower case: "pacs.008". The refusal status is `NAUT` (open question 9).

## 3. Reading the sketch

### 3.1 Layout

The photo is rotated 90°; read upright, the sketch is a three-column IDE layout with a strip along the bottom:

| Region | On the sketch | Reading applied |
|---|---|---|
| Title | "RSOP Designer" | The Designer screen's title |
| Left, top | "Transaction Flows", ☐ Inquiry, ☐ Payment | The flow list; picking one shows that flow |
| Left, bottom | A box titled "T…" with items 1–4 | The transactions list, numbered 1–4 (open question 5) |
| Centre | The pipeline (section [3.2](#32-the-pipeline)) | The canvas |
| Right | "YML Param…" over key–value lines | The selected step's parameters, shown as YAML |
| Under the right panel | "Dvb…" | A Debug tab beside the parameters (open question 7) |
| Bottom | "Tim…" with a small box on a line | A timeline of the selected transaction, with a scrubber (open question 6) |

### 3.2 The pipeline

`(●) → Incoming Bill → WSI → RabbitMQ → REST ──WS──▶ (◉)`

| Node | On the sketch | Reading applied |
|---|---|---|
| Start ● | A circle labelled "Green" | A green start node, as in BPMN |
| Incoming Bill | "Incoming Bill" | The request arriving from Raast |
| WSI | Arrow to "YML T…" | The web-service interface step, whose mapping comes from a YAML template |
| RabbitMQ | "RABBITMQ" | A queue between the incoming side and the outgoing call |
| REST | "Header Conv…" under it | A REST connector that converts headers |
| Edge into the end node | "WS" | The web-service call to the biller |
| End ◉ | Heavily inked, "Gov…" | The government biller's mock web services (Bill Inquiry, Bill Marking) |

The Open Connect doc treats RSOP as one box between Raast and the biller; this canvas opens that box. The doc mentions none of WSI, RabbitMQ, YAML or REST.

### 3.3 Notes along the top

- "creds" → login → back-office dashboard, which branches to "billing" and "bill pay stats".
- "User management".
- "4 screen static", followed by a list that stops after "login, dashboard".

The draft reads these as the back office around the Designer: four screens on mock data (open question 1).

### 3.4 Labels still unread

The start node's label ("Green"?), the "T…" box title, the "Tim…" strip, "Dvb…", and the word under REST ("Header Conv…"?) are best guesses. KJ can settle them in a minute.

## 4. Screens

| Route | Screen | Data |
|---|---|---|
| `/` | Sign in | None |
| `/dashboard/` | Dashboard | `src/data/dashboard.ts`, `src/data/bills.ts` |
| `/designer/` | Redirects to `/designer/inquiry/` | |
| `/designer/inquiry/` | RSOP Designer, Inquiry flow | `src/data/flows/inquiry.ts` |
| `/designer/payment/` | RSOP Designer, Payment flow | `src/data/flows/payment.ts` |
| `/users/` | Users | `src/data/users.ts` |

Every app screen shares one header: the RSOP mark, links to Dashboard, Designer and Users, a "Mock data" marker, the theme toggle, and the signed-in user's menu with "Sign out".

### 4.1 Sign in

- A sign-in card on the dark canvas: username, password and a "Sign in" button, under the serif headline "Sign in." with the red full stop from RSOP demo.
- "Forgot password?" is shown but inactive, and the card says the draft has no sign-in, so any details work.
- The inputs carry no `name`, so nothing typed ever reaches a URL. Submitting goes to `/dashboard/`.

### 4.2 Dashboard

The "BOffice dashb" of the sketch, with its two branches:

- **Bill-pay stats** (top), for "today, 21 Oct 2026, as of 16:00 PKT":
  - A hero figure: PKR collected today, with settled payments and the change against the same time yesterday.
  - Stat tiles: inquiries, payments, success rate, each with a delta and an hourly sparkline.
  - "Needs attention" tiles: refused (NAUT), awaiting ACSP and bill marking retrying. Each links to the billing table, filtered.
  - Payments per hour: stacked columns, settled and refused.
  - From inquiry to marked bill: a funnel of inquiries → payments → AUTH → ACSP → bill marked, with the conversion between stages.
  - Collected by bill type: horizontal bars.
- **Billing** (below): the bill ledger. It lists each bill with its time, type, reference, institution, inquiry ID, amount, payment status and bill-marking status. Filter chips narrow it by status. Rows that match a sample transaction link to its trace in the Designer.

There is no date-range filter in this draft; the period is stated in the page header (open question 10).

### 4.3 RSOP Designer

See section [5](#5-the-designer-in-detail).

### 4.4 Users

- A table of users: name and email, role, status (Active, Invited, Disabled) and last active.
- Search by name or email, and filter chips by role.
- Roles and permissions: a matrix of the four roles against six permissions. The roles are placeholders for KJ to confirm (open question 11).
- "Invite user" opens a dialog with name, email and role, and each row's "Edit" opens the same dialog filled in. The form validates like a real one, then says that the draft sent or saved nothing.

## 5. The Designer in detail

### 5.1 Layout

On a desktop the layout follows the sketch:

```
┌──────────────┬──────────────────────────────────────────────┬─────────────────────┐
│ FLOWS        │ Designer / Bill payment   v0.1 draft  [-][fit][+] │ ◆ WSI           SKETCH │
│ ▸ Inquiry    │                                              │ [ Params ] [ Debug ] │
│ ▸ Payment    │        (●)→[Incoming]→[WSI]→<Validate>→ …    │ name: wsi-payment   │
│              │                                              │ template: …         │
│ TRANSACTIONS │                                              │ map:                │
│ 1 ✓ Settled  │                                              │   inquiryId: TBC    │
│ 2 ✗ Refused  ├──────────────────────────────────────────────┤                     │
│ 3 ↻ Retried  │ TIMELINE  #3 PAY-…231   [⏮][◀][▶][▶][⏭]      │                     │
│ 4 ◷ Awaiting │ ●───●───●───●───●───●───●───●                │                     │
└──────────────┴──────────────────────────────────────────────┴─────────────────────┘
```

- **Left rail.** The flow list (Inquiry, Payment) on top. The transactions list below it, numbered 1–4 as on the sketch, each with a status chip.
- **Canvas.** The selected flow's pipeline, with a toolbar for zoom (out, fit, in) and a legend.
- **Timeline.** Under the canvas, as on the sketch.
- **Inspector.** On the right: the selected step, with Params and Debug tabs.

### 5.2 Canvas

- Nodes sit on a grid: one row for the main line, one above for the inquiry store and one below for the refusal branch. Columns follow the main line from left to right.
- **Node shapes.**
  - Start: a green ring.
  - End: a thick ring in the destination's colour, the government biller's green or the refusal red.
  - Every other step: a card with an icon chip, a name and a one-line subtitle.
  - The WSI card carries its template file name, for the sketch's "YML T…".
- **Edges.** A solid arrow for the flow, labelled where the sketch or doc labels it ("WS", "valid · AUTH", "invalid · NAUT", "ACSP"). A dotted line, without an arrowhead, links the inquiry store.
- **Colour by family**, using RSOP demo's party colours:
  - Raast-facing steps: pink.
  - RSOP's own processing: violet.
  - The queue: orange.
  - The outbound REST call: blue.
  - The store: grey.
  - The biller: green.
  - The refusal: red.
- **Transaction overlay.** With a transaction selected, each node shows where the transaction stood at the timeline's position, as a status badge with an icon:
  - ✓ passed
  - ✗ failed
  - ◷ waiting
  - Not reached: dimmed

  Edges the transaction has crossed are drawn solid. The node of the current event pulses.
- **Zoom.** The canvas opens at "fit", but never smaller than 70%. Below that it scrolls sideways. The out and in buttons step between 50% and 125%, and the middle button returns to fit.

### 5.3 Transactions and timeline

- Each flow has four sample transactions (section [6.4](#64-sample-transactions)). Picking one draws the overlay and loads its events into the timeline at the last event.
- **The timeline track.** Each event is a stop on the track, spaced evenly rather than by time, because the gaps run from milliseconds to seconds. Each stop shows its time offset ("+19 ms") and the step's name.
- **Controls.** First, previous, play or pause, next and last, plus "Event 5 of 8".
- **The scrubber.** A native range input, so keyboard and screen-reader users get the same control as pointer users.
- The current event's sentence sits under the track, in a polite live region.
- Moving the timeline selects the event's step in the inspector.

### 5.4 Inspector

- **Header.** The step's icon, name and subtitle, and a tag: "From the sketch" or "From the doc".
- **Params tab.** A short plain-language "What this step does", then the YAML parameters, read-only with syntax colouring and a Copy button. A line above the YAML says the values are draft placeholders.
- **Debug tab.** The selected transaction's events at this step, up to the timeline's position. Each event shows its time, status, sentence and payload, as YAML. If the transaction never reached the step, the tab says so. With no transaction selected, it says to pick one.

### 5.5 Deep links and keyboard

- `?txn=3` selects transaction 3, `&at=4` moves the timeline to its fourth event, and `&tab=debug` opens the Debug tab. The selected step is kept in the hash (`#node-wsi`), and `?txn=none` shows the design with no transaction.
- With no parameters, a flow opens on transaction 1 at its last event, with the WSI selected. The URL changes only once someone interacts; from then on the script keeps it in step with history.replaceState, so any view can be shared.
- With the timeline focused, ← and → step through events, and Home and End jump to the first and last.
- On the canvas, nodes are buttons in reading order; Enter selects one.

### 5.6 Smaller screens

- **Below 1180px.** The inspector moves under the canvas and timeline.
- **Below 860px.** The left rail becomes a flow switcher and a horizontal row of transaction chips. The canvas keeps its own horizontal scroll inside the page, and the page itself never scrolls sideways.
- The Designer is made for desktops; on a phone it stays readable and usable, not comfortable.

### 5.7 Without JavaScript

Each flow page is complete HTML. The canvas shows the design. Every step's parameters are listed in the inspector area. Every transaction's events are listed as an ordered list. The script only switches what is visible and sets state attributes.

## 6. Data

### 6.1 Types

```ts
type Family = 'raast' | 'rsop' | 'queue' | 'outbound' | 'store' | 'biller' | 'reject';
type NodeKind = 'start' | 'inbound' | 'wsi' | 'decision' | 'wait' | 'queue' | 'rest' | 'store' | 'end';
type Tone = 'ok' | 'fail' | 'wait' | 'info';

interface FlowNode {
  id: string;
  kind: NodeKind;
  family: Family;
  label: string;          // "Incoming Bill"
  sub: string;            // one line under the label
  origin: 'sketch' | 'doc';
  col: number;            // grid column on the main line
  row: -1 | 0 | 1;        // store above, main line, refusal branch below
  template?: string;      // the WSI's YAML template file
  about: string;          // what the step does, in plain words
  params: Yaml;           // shown as YAML in the inspector
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;         // "WS", "valid · AUTH", …
  kind: 'flow' | 'ok' | 'fail' | 'link';
}

interface TxnEvent {
  at: number;             // ms since the transaction started
  node: string;
  tone: Tone;
  title: string;          // short, for the timeline stop
  text: string;           // one sentence, for the caption and Debug tab
  data?: Yaml;            // the payload shown in Debug
}

interface Txn {
  n: 1 | 2 | 3 | 4;       // numbered as on the sketch
  ref: string;            // correlation ID or payment reference
  title: string;          // "Property tax"
  detail: string;         // the bill reference for an inquiry, the amount for a payment
  outcome: string;        // "Settled · bill marked"
  tone: Tone;
  started: string;        // "15:39:02"
  events: TxnEvent[];
}
```

`Yaml` is a plain JSON-like value. `src/lib/yaml.ts` turns it into syntax-coloured YAML at build time. A string ending in `# …` becomes a YAML comment, for `TBC` values.

### 6.2 Inquiry flow

| Col | Node | Family | Origin | Subtitle |
|---|---|---|---|---|
| 0 | Start | raast | sketch | Raast API Gateway |
| 1 | Incoming Bill | raast | sketch | Bill inquiry request |
| 2 | WSI | rsop | sketch | Maps with `bill-inquiry.yml` |
| 2 (above) | Inquiry store | store | doc | Keeps ID + amount |
| 3 | RabbitMQ | queue | sketch | `rsop.inquiry` |
| 4 | REST | outbound | sketch | Header conversion |
| 5 | Government biller | biller | sketch | Bill Inquiry web service (mock) |

The edges run in a line from Start to the biller, with "WS" on the last edge. A dotted link joins the WSI and the store. The reply leg (biller → REST → RabbitMQ → WSI → gateway) is not drawn as extra edges. Calls are request and response, and the timeline narrates the reply.

### 6.3 Payment flow

| Col | Node | Family | Origin | Subtitle |
|---|---|---|---|---|
| 0 | Start | raast | sketch | Raast |
| 1 | Incoming Bill | raast | sketch | Bill payment · pacs.008 |
| 2 | WSI | rsop | sketch | Maps with `bill-payment.yml` |
| 3 | Validate | rsop | doc | Inquiry ID + amount |
| 3 (above) | Inquiry store | store | doc | Reads and reserves |
| 3 (below) | Rejected | reject | doc | RJCT from Raast |
| 4 | Await ACSP | raast | doc | pacs.002 from Raast |
| 5 | RabbitMQ | queue | sketch | `rsop.billmarking` |
| 6 | REST | outbound | sketch | Header conversion |
| 7 | Government biller | biller | sketch | Bill Marking web service (mock) |

- **Edges.** Validate → Await ACSP is labelled "valid · AUTH", and Validate → Rejected "invalid · NAUT". Await ACSP → RabbitMQ is labelled "ACSP", and REST → biller "WS".
- **Why RabbitMQ sits after Await ACSP.** The doc wants a durable bill-marking task after ACSP, retried without reversing the payment. In this flow, the queue holds that task.

### 6.4 Sample transactions

The sample bill from RSOP demo carries over: Property tax 2026, PT-2026-004512, PKR 4,350.00, inquiry ID INQ-8F2C41.

| Flow | # | Bill | What happens | Overall |
|---|---|---|---|---|
| Inquiry | 1 | Property tax, PT-2026-004512 | Biller returns PKR 4,350.00 and INQ-8F2C41; RSOP stores it as OPEN and returns it unchanged | ✓ OPEN |
| Inquiry | 2 | Water bill, WB-2026-118840 | Biller returns PKR 1,280.00 and INQ-2D7A90; stored as OPEN | ✓ OPEN |
| Inquiry | 3 | Vehicle tax, VT-2026-000031 | Biller finds no such bill; nothing stored; error returned (draft behaviour, the doc is silent) | ✗ Not found |
| Inquiry | 4 | Court fee, CF-2026-007719 | Still waiting on the biller's reply | ◷ In flight |
| Payment | 1 | Property tax, INQ-8F2C41, PKR 4,350.00 | Valid → AUTH → ACSP → bill marked | ✓ Settled, bill marked |
| Payment | 2 | Water bill, INQ-2D7A90, PKR 1,200.00 | Amount does not match → NAUT → RJCT → attempt REJECTED, no bill marking | ✗ Refused |
| Payment | 3 | Property tax, INQ-77E0D3, PKR 7,120.00 | Valid → AUTH → ACSP → bill marking times out → retried with the same payment reference → marked | ✓ Settled, marked on retry |
| Payment | 4 | Water bill, INQ-5B19AF, PKR 960.00 | Valid → AUTH, waiting for ACSP | ◷ Awaiting ACSP |

### 6.5 Dashboard figures

The figures are consistent with each other; the tests check every sum below.

| Figure | Today (to 16:00) | Same time yesterday |
|---|---|---|
| Inquiries | 1,248 | 1,176 |
| Payments (pacs.008) | 913 | 861 |
| Authorised (AUTH) | 884 | |
| Refused (NAUT) | 29 | |
| Settled (ACSP) | 879 | |
| Awaiting ACSP | 5 | |
| Bill marked | 871 | |
| Bill marking retrying | 8 | |
| Collected | PKR 3,937,800.00 | PKR 3,712,450.00 |
| Success rate (settled ÷ payments) | 96.3% | 95.8% |

- **Per hour, 08:00 to 15:00.** Settled payments are 52, 98, 131, 142, 121, 104, 126 and 105. Refused payments are 1, 3, 5, 6, 3, 2, 5 and 4. Inquiries are 72, 138, 181, 197, 166, 142, 175 and 177. The 5 payments awaiting ACSP all fall in the 15:00 hour.
- **By bill type (settled).**

  | Bill type | Payments | Collected |
  |---|---|---|
  | Property tax | 312 | PKR 2,184,600.00 |
  | Vehicle tax | 187 | PKR 1,084,600.00 |
  | Water bill | 268 | PKR 388,600.00 |
  | Court fee | 112 | PKR 280,000.00 |

### 6.6 Users and roles

- Eight fictional users across four roles: Admin, Operator, Designer and Viewer. The signed-in user is Hina Malik, Admin.
- The permissions are: view dashboard and billing, view flows and parameters, trace transactions, edit flow parameters, retry bill marking, and manage users.
- All of these are placeholders.

## 7. Tech stack and project layout

### 7.1 Stack

| Concern | Choice | Same as RSOP demo |
|---|---|---|
| Framework | Astro 7.3 (`astro@^7.3.5`), static output | Yes |
| Language | TypeScript, extending `astro/tsconfigs/strict` | Yes |
| Styling | Hand-written CSS: tokens in `src/styles/global.css`, one stylesheet for the Designer, scoped styles per component | Yes |
| Interactivity | Vanilla TypeScript in Astro `<script>` tags; no UI framework | Yes |
| Theme | Dark by default; the toggle switches to light and remembers the choice | Yes |
| Fonts | EB Garamond (titles) and Nunito (everything else), self-hosted | Yes |
| Charts | Hand-drawn SVG at build time; no chart library | New |
| Checks | `npm run check`: `astro check` plus `node --test` | Yes |
| Node | 22.12 or newer (22.21.1 installed) | Yes |

Not used: React, React Flow, Tailwind, Mermaid, chart libraries and analytics.

### 7.2 Project layout

```
RSOP demo 2/
├── docs/                       # this plan and the upright sketch
├── pics/                       # KJ's photo, unchanged
├── public/                     # favicon, fonts
├── src/
│   ├── layouts/                # Base (head, pre-paint theme), App (header + page)
│   ├── components/             # header, icons, status pill, theme toggle
│   │   ├── dashboard/          # stat tiles, charts, bills table
│   │   ├── designer/           # rail, canvas, timeline, inspector, YAML
│   │   └── users/              # users table, roles matrix, invite dialog
│   ├── data/
│   │   ├── flows/              # inquiry.ts, payment.ts
│   │   ├── dashboard.ts, bills.ts, users.ts, sample.ts
│   ├── lib/                    # flow types and layout, YAML, formatting
│   ├── pages/                  # index (sign in), dashboard, designer/[flow], users
│   ├── scripts/                # designer, charts, users, sign-in
│   └── styles/                 # global.css, designer.css, dashboard.css
├── tests/                      # flows, YAML, dashboard
└── README.md
```

### 7.3 Implementation notes

- **One page per flow.** `src/pages/designer/[flow].astro` builds `/designer/inquiry/` and `/designer/payment/` from the data. The flow list is plain links, so switching flows works without JavaScript.
- **No client-side templating.** Nodes, YAML panels, events and Debug entries are all rendered at build time. The script sets `data-*` state and `hidden`.
- **Layout from the grid.** `layout(flow)` turns columns and rows into pixel positions and edge paths. The same function feeds the build and the tests.
- **Tests run without a build step**, as in RSOP demo. `src/data` and `src/lib` use only syntax Node can strip, and imports carry `.ts` extensions.
- **Charts are SVG from data**, with a `<details>` table view under each chart and one shared tooltip script for hover and focus.

## 8. Visual design

- **Base.** RSOP demo's tokens: a near-black canvas with a soft glow, glass panels, EB Garamond titles ending on a red full stop, and Nunito for everything else. The light theme is RSOP demo's cream.
- **Denser than the demo.** This is a work tool, so type runs smaller, panels sit edge to edge, and serif type is kept for page titles.
- **The canvas.** A faint dot grid, with glass cards for steps. The selected step gets a blue outline; red is kept for failure.
- **Status.** Always an icon and a word as well as a colour: ✓ ok, ✗ fail, ◷ waiting, ● info.
- **Mock data.** A "Mock data" pill sits in the header of every app screen.

### 8.1 Chart colours

The chart colours were checked with the dataviz validator on this UI's own surfaces, dark `#0f121d` and light `#fffdf9`.

| Use | Dark | Light | Result |
|---|---|---|---|
| Settled and refused, stacked | `#299236`, `#f0555b` | `#146720`, `#e76767` | All checks pass; colour-vision ΔE 8.2 dark, 13.0 light |
| Funnel stages, ordinal blue | `#9ec5f4` → `#184f95` | `#104281` → `#86b6ef` | All ordinal checks pass |
| Single series (bill types) | `#3987e5` | `#2a78d6` | Contrast 5.1 and 4.4 against the surface |

- **Why the third stack colour was dropped.** The status trio of settled, refused and awaiting failed in light mode: awaiting and refused were too close for deuteranopes, at ΔE 3.4. The chart therefore stacks settled and refused only, and awaiting ACSP gets its own tile.
- **The rule from the method.** Stat-tile and hero values use Nunito with proportional figures, never the serif.

## 9. Accessibility and motion

- **Keyboard.** Every control is a button, link or native input, focus rings are visible, and the timeline and dialog follow their keyboard conventions.
- **Screen readers.**
  - The canvas nodes are buttons with full names, such as "WSI, Maps with bill-payment.yml, passed".
  - The timeline caption is a polite live region.
  - Charts have table views, and chart marks carry their values as labels.
- **Colour is never the only signal.** Statuses carry icons and words, and edges differ by style and label.
- **Reduced motion.** No pulsing and no animated transitions; play still steps through events.
- **Contrast.** Text meets 4.5:1 and graphics 3:1 in both themes.
- **Width.** Every page works at 360px wide without sideways page scroll.

## 10. Quality checks

| Check | How | When |
|---|---|---|
| Builds cleanly | `npm run build`, strict TypeScript | Every change |
| Flows are sound graphs | `npm run check`. It checks that node IDs are unique, that every edge joins real nodes, and that there is exactly one start. Every node must be reachable from the start, and ends have no outgoing edges | Every change |
| Faithful to the sketch | The Inquiry main line is exactly Start → Incoming Bill → WSI → RabbitMQ → REST → biller, with "WS" on the last edge. The Payment flow keeps those blocks in that order | Every change |
| Faithful to the doc | The doc's demo checks, run on the sample transactions (see the list after this table) | Every change |
| Transactions are well formed | Times rise, every event names a node in its flow, and consecutive events sit on the same or adjacent nodes. Four transactions per flow | Every change |
| Dashboard adds up | The hourly series sum to the totals, the funnel never grows, and the bill types sum to settled payments and the amount collected | Every change |
| Looks right | Screenshots at 390, 768 and 1440px, in dark and light, of every screen and several Designer states | Each checkpoint |
| Accessibility | axe-core on every screen in both themes; a keyboard-only walk through the Designer | Each checkpoint |

The doc's demo checks, as the tests run them on the sample transactions:

- A successful inquiry returns the biller's inquiry ID unchanged.
- A refused payment never reaches bill marking.
- Bill marking happens only after ACSP.
- A bill-marking failure is retried without reversing a completed payment.

## 11. Delivery plan

1. **Scaffold.** The Astro project, tokens, fonts, theme toggle, app header and empty pages. *Check:* `npm run dev` runs in both themes.
2. **Data and checks.** Both flows, their transactions, dashboard figures, users and the tests. *Check:* `npm run check` passes.
3. **Designer.** Canvas, rail, inspector and timeline, then the overlay, deep links and the smaller layouts. *Check:* every transaction walks end to end.
4. **Dashboard, Users and Sign in.** *Check:* figures match the data and filters work.
5. **Verify.** Screenshots in both themes at three widths, axe, keyboard walk, then the README. **Review with you.**
6. **Review with KJ.** Answer the open questions, then iterate.

## 12. Open questions

| # | Question | Why it matters | Default until answered |
|---|---|---|---|
| 1 | Which are the "4 screen static"? The sketch's list stops after "login, dashboard" | Sets the scope | Sign in, Dashboard, Designer, Users |
| 2 | Is the Designer an editor (drag, connect, save YAML) or a viewer? | An editor needs a canvas library and a save path | Viewer; YAML read-only |
| 3 | Stack for the real build | The draft's stack may or may not carry over | Astro, as in RSOP demo; React with React Flow if 2 becomes "editor" |
| 4 | Should the Payment canvas show the doc's Validate, Await ACSP and Rejected steps? | The sketch draws one pipeline without them | Shown, tagged "From the doc" |
| 5 | What is the "T…" box with 1–4? | Left rail content | Transactions, numbered 1–4 |
| 6 | What is the "Tim…" strip? | Bottom panel content | A timeline with a scrubber |
| 7 | What is "Dvb…"? | Right panel content | Debug, as a tab beside the parameters |
| 8 | Does "billing" mean the bill ledger or RSOP's fee invoicing? | Dashboard content | The bill ledger |
| 9 | `NAUT` or the doc's `NAUTH`? | The code shown everywhere | `NAUT`, as in RSOP demo |
| 10 | Should the dashboard have a date-range filter? | Charts and table scope | No; "today" only |
| 11 | What roles and permissions does the back office need? | Users screen | Admin, Operator, Designer, Viewer (placeholders) |
| 12 | What does RSOP return when the biller cannot find a bill? | Inquiry transaction 3 | An error to the gateway, nothing stored |
