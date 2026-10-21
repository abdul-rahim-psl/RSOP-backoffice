# Flow API integration plan

## Contents

- [1. Summary](#1-summary)
- [2. The two endpoints](#2-the-two-endpoints)
  - [2.1 Responses](#21-responses)
  - [2.2 Reading a chain](#22-reading-a-chain)
  - [2.3 Access from the browser](#23-access-from-the-browser)
- [3. The API against the draft](#3-the-api-against-the-draft)
  - [3.1 Bill inquiry](#31-bill-inquiry)
  - [3.2 Bill payment](#32-bill-payment)
  - [3.3 What the API does not give](#33-what-the-api-does-not-give)
- [4. Approach](#4-approach)
  - [4.1 Where the fetch happens](#41-where-the-fetch-happens)
  - [4.2 Which source wins](#42-which-source-wins)
  - [4.3 Data path](#43-data-path)
- [5. Changes](#5-changes)
  - [5.1 Pull script and snapshot](#51-pull-script-and-snapshot)
  - [5.2 Chain parser](#52-chain-parser)
  - [5.3 Service registry](#53-service-registry)
  - [5.4 Flow model and layout](#54-flow-model-and-layout)
  - [5.5 The two flows](#55-the-two-flows)
  - [5.6 Canvas, inspector and legend](#56-canvas-inspector-and-legend)
  - [5.7 Tests](#57-tests)
  - [5.8 Docs and harness](#58-docs-and-harness)
- [6. Delivery steps](#6-delivery-steps)
- [7. Risks](#7-risks)
- [8. Open questions](#8-open-questions)

## 1. Summary

The RSOP Designer's two canvases take their steps from RSOP's flow API instead of hand-written node lists. Step parameters, sample transactions, the dashboard and the users screen stay mock data.

| | Today | After |
|---|---|---|
| Where the pipeline comes from | Hand-written in `src/data/flows/`, from KJ's sketch | The API's chains, read from a committed snapshot |
| Inquiry canvas | 6 steps | 8 steps: adds the Raast API Gateway and an End |
| Payment canvas | One line: KJ's blocks plus the doc's Validate, Await ACSP and Rejected | Two lanes: pacs.008 → AUTH, then ACSP → bill marking through store-and-forward |
| How it refreshes | Edit the data files | `npm run api:pull`, then `npm run build` |
| Browser calls to the API | None | None: the page stays static |

- **Fetch at build time, not in the browser.** The API sends no CORS headers, and Chrome blocks a fetch from the Designer page. Tunnel viewers can't reach the API's private address either.
- **The API decides each flow's steps and order.** The sketch still decides the screens. The doc still decides the behaviour the API doesn't show.
- **Payment changes shape.** In the API, WSI → queue → REST carries pacs.002 AUTH back to Raast. The biller is reached through `saf-dispatcher` and `saf-consumer`. The four payment samples are rewritten to match.

Claims are tagged by source:

- **live**: checked against the API or in Chrome on 2026-10-21.
- **doc**: the Open Connect doc.
- **sketch**: KJ's HLD.
- **inferred**: worked out from the above; not confirmed.
- **draft**: a choice this plan makes; see [§8](#8-open-questions).

## 2. The two endpoints

### 2.1 Responses

Both endpoints are `GET` with no auth. Both return `200` with `Content-Type: application/json` (live, 21 Oct 2026, 23:20 PKT). The base URL is `http://192.168.9.15:9991`.

`GET /api/v1/billInquiryFlow`:

```json
{"billInquiryFlow":"Start<-->raast-api-gateway<-->mpg-incoming-billing-service<-->web-service-interface<-->queue-processor<-->rest-handler<-->fbr-biller-mock-->End"}
```

`GET /api/v1/billPaymentFlow` (the response is one line; it is split here for reading):

```json
{"billPaymentFlow1":"Start-->raast-->GET PACS008-->notification-service-->notification-broker-service-->receiving-service<-->Post PACS002 AUTH<-->web-service-interface<-->queue-processor<-->rest-handler<-->raast-->END",
 "billPaymentFlow2":"Start-->raast-->GET PACS002 ACSP-->notification-service-->notification-broker-service-->receiving-service-->saf-dispatcher<-->saf-consumer<-->fbr-biller-mock-->END"}
```

Each value is one chain. Inquiry returns one chain; payment returns two.

### 2.2 Reading a chain

- **Arrows.** `<-->` and `-->` separate the tokens.
  - `<-->` is read as a request and its reply, which comes back the same way.
  - `-->` is read as one way.
  - This reading is inferred. The inquiry is all `<-->`, and the doc makes it a synchronous round trip. Raast's notifications are `-->`.
- **Tokens.** There are three kinds:
  - Terminals: `Start`, and `End` or `END`. The case differs between the two responses.
  - Services: lower case and hyphenated, such as `receiving-service`.
  - Messages: contain a space, such as `GET PACS008`, `Post PACS002 AUTH` and `GET PACS002 ACSP`. A message sits between the two services it travels between.
- **Repeats.** One chain can name a service twice. `raast` opens and closes `billPaymentFlow1`.
- **Keys.** The key names the flow. `billPaymentFlow1` and `billPaymentFlow2` are the two parts of the payment flow.

### 2.3 Access from the browser

All verified live on 2026-10-21:

- **Fetch from the page.** A `fetch` from `http://127.0.0.1:4392/designer/inquiry/` fails in Chrome. The error: "No 'Access-Control-Allow-Origin' header is present on the requested resource".
- **Preflight.** The CORS preflight (`OPTIONS`) returns `403 Invalid CORS request`.
- **Tunnel viewers.** The API's address is private (192.168.9.15), so a tunnel viewer's browser can't reach it. An `https` tunnel page calling `http` would also be blocked as mixed content (inferred).

## 3. The API against the draft

### 3.1 Bill inquiry

| # | API token | Hop to next | Draft step | Sketch block | Change |
|---|---|---|---|---|---|
| 1 | `Start` | `<-->` | `start`, sub line "Raast API Gateway" | Green start | Sub line no longer names the gateway |
| 2 | `raast-api-gateway` | `<-->` | Start's sub line | None | New step |
| 3 | `mpg-incoming-billing-service` | `<-->` | `incoming` | Incoming Bill | Same step |
| 4 | `web-service-interface` | `<-->` | `wsi` | WSI | Same step |
| 5 | `queue-processor` | `<-->` | `queue` | RabbitMQ | Same step (inferred: it processes the queue) |
| 6 | `rest-handler` | `<-->` | `rest` | REST | Same step |
| 7 | `fbr-biller-mock` | `-->` | `biller`, drawn as the end | Gov | Becomes a box |
| 8 | `End` | | None | None | New end terminal |

The API and the sketch agree on the order (live + sketch). The doc's inquiry store has no API step, so it stays a dashed doc step attached to WSI, as now (draft).

### 3.2 Bill payment

The payment flow has two lanes:

- **Lane 1** (`billPaymentFlow1`): Raast forwards a pacs.008, and RSOP answers with a pacs.002 AUTH.
- **Lane 2** (`billPaymentFlow2`): Raast sends a pacs.002 ACSP, and RSOP marks the bill.

Each lane's chain, with messages folded into the hops (⟷ marks `<-->`):

| Lane | Chain |
|---|---|
| 1 | Start → `raast` –pacs.008→ `notification-service` → `notification-broker-service` → `receiving-service` ⟷pacs.002 AUTH⟷ `web-service-interface` ⟷ `queue-processor` ⟷ `rest-handler` ⟷ `raast` → END |
| 2 | Start → `raast` –pacs.002 ACSP→ `notification-service` → `notification-broker-service` → `receiving-service` → `saf-dispatcher` ⟷ `saf-consumer` ⟷ `fbr-biller-mock` → END |

Where the draft differs:

| Draft step | In the API | Plan |
|---|---|---|
| Incoming Bill (pacs.008) | `notification-service` → `notification-broker-service` → `receiving-service` | Replaced by the three services |
| WSI → RabbitMQ → REST → biller | WSI → `queue-processor` → `rest-handler` → **Raast**, carrying AUTH | Follow the API: this chain answers Raast |
| Validate (doc) | No step; `receiving-service` posts AUTH | Validation happens in `receiving-service` (inferred) |
| Inquiry store (doc) | No step | Dashed doc step attached to lane 1's `receiving-service` |
| Await ACSP (doc) | The gap between lane 1 and lane 2 | No step; lane 1's End reads "Awaiting ACSP" (doc: status `AWAITING_ACSP`) |
| NAUT branch (doc) | Not shown | Same path as AUTH with a different code (inferred). Shown in the inspector, not drawn |
| Rejected, RJCT (doc) | Not shown | Dashed doc branch off lane 2's `receiving-service`, labelled RJCT (inferred: RJCT arrives the way ACSP does) |
| Bill marking via RabbitMQ and REST | `saf-dispatcher` ⟷ `saf-consumer` ⟷ biller | Follow the API. Store-and-forward fits the doc's durable Bill Marking task and its retry (doc + inferred) |

KJ's sketch draws one pipeline, and the draft applied it to payment. For payment, the API replaces that inference. The test that holds the sketch's blocks to the payment main line goes; see [§5.7](#57-tests).

### 3.3 What the API does not give

The API does not give:

- labels, parameters (YAML) or descriptions;
- sample transactions;
- the NAUT and RJCT paths;
- the inquiry store;
- any live status.

These stay in local data, keyed by service name.

## 4. Approach

### 4.1 Where the fetch happens

| Option | On this laptop | Through the tunnel | Needs | Verdict |
|---|---|---|---|---|
| Browser `fetch` | Blocked by CORS (live) | Unreachable; mixed content | CORS on the API and a public HTTPS URL | No |
| Same-origin proxy: an Astro endpoint that calls the API | Works | Works | The `@astrojs/node` adapter, server output and a running Node server | Later, if the canvas must update without a rebuild |
| Pull into a committed snapshot; build from it | Works | Works: the page is static HTML | Nothing new | **Recommended** |

The snapshot fits how the app is already built: content is rendered at build time, and scripts only switch state.

- **The build never calls the network.** `npm run api:pull` does that, so builds still work offline and come out the same every time.
- **Tests and the page read the same snapshot**, so they always agree.
- **The sample transactions** are written against a known topology.

### 4.2 Which source wins

| Question | Authority |
|---|---|
| Which steps a flow has, their order, and which hops go both ways | The API |
| Screens, layout, and the names of the steps the sketch draws | The sketch |
| Behaviour the API doesn't show: validation, NAUT and RJCT, `AWAITING_ACSP`, the store, retries | The doc |

On the canvas, API steps are drawn solid and doc-only steps dashed. The legend entry "On KJ's sketch" becomes "From the RSOP API".

### 4.3 Data path

```text
RSOP API ── npm run api:pull ──▶ src/data/api/snapshot.json
                                 (committed: raw responses + fetchedAt)
                                          │
                             parseChain() │  src/lib/chain.ts
                                          ▼
  service registry ──────▶ buildFlow() ◀────── doc overlays + sample transactions
  src/data/api/services.ts      │              src/data/flows/{inquiry,payment}.ts
                                ▼
                    Flow ──▶ Designer components (same contract, plus lanes)
```

## 5. Changes

### 5.1 Pull script and snapshot

- **New `tools/api-pull.ts`.** Node runs it directly, as it already runs the TypeScript tests. It adds no dependency. It:
  - reads `RSOP_API_BASE`, default `http://192.168.9.15:9991`;
  - `GET`s both endpoints with a 5 s timeout;
  - parses every chain with `parseChain()` before writing, so it never saves a snapshot the app can't read;
  - writes `src/data/api/snapshot.json`;
  - prints what changed in each chain since the last snapshot.

  With `--check`, it writes nothing. It exits 1 if the API differs from the snapshot or can't be reached.
- **New scripts in `package.json`.**
  - `"api:pull": "node tools/api-pull.ts"`
  - `"api:check": "node tools/api-pull.ts --check"`

  `api:check` stays out of `npm run check`, which must pass offline.
- **Snapshot shape.** The raw responses are kept verbatim, so a parser change never needs a fresh pull:

  ```json
  {
    "baseUrl": "http://192.168.9.15:9991",
    "fetchedAt": "2026-10-21T15:46:28Z",
    "responses": {
      "/api/v1/billInquiryFlow": { "billInquiryFlow": "Start<-->…-->End" },
      "/api/v1/billPaymentFlow": { "billPaymentFlow1": "…", "billPaymentFlow2": "…" }
    }
  }
  ```

### 5.2 Chain parser

The parser goes in a new file, `src/lib/chain.ts`. It is pure and has no browser code:

```ts
export interface ChainStep { kind: 'start' | 'end' | 'service'; name: string; occurrence: number }
export interface Message { verb: string; text: string; raw: string }
export interface Hop { from: number; to: number; dir: 'one' | 'both'; message?: Message }
export interface Chain { steps: ChainStep[]; hops: Hop[] }
export function parseChain(chain: string): Chain;
```

- **Messages.** A message token folds into the hop between its two neighbours. The hop is `both` when both of its arrows are `<-->`.
- **Spelling.** Display text uses the house spelling: `PACS008` becomes `pacs.008`, and `PACS002 AUTH` becomes `pacs.002 AUTH`. The raw token is kept for the inspector.
- **Terminals.** `End` and `END` are the same terminal.
- **Errors.** The parser throws, naming the token, on:
  - an unknown arrow;
  - a missing Start or End;
  - two arrows, or two messages, in a row;
  - a message whose two arrows differ.

  None of these occur today. Being strict makes a changed API fail `api:pull` loudly instead of drawing the wrong flow.

### 5.3 Service registry

The registry is a new file, `src/data/api/services.ts`, keyed by the API's service name. Each entry holds:

- the step's short `id`;
- its label and sub line;
- its kind and family;
- a description;
- placeholder parameters;
- the sketch block it matches, if any.

| Service | id | Label | Family | Sketch block |
|---|---|---|---|---|
| `raast-api-gateway` | `gateway` | Raast API Gateway | raast | None |
| `mpg-incoming-billing-service` | `incoming` | Incoming Bill | raast | Incoming Bill |
| `web-service-interface` | `wsi` | WSI | rsop | WSI |
| `queue-processor` | `queue` | RabbitMQ | queue | RabbitMQ |
| `rest-handler` | `rest` | REST | outbound | REST |
| `fbr-biller-mock` | `biller` | Government biller | biller | Gov |
| `raast` | `raast` | Raast | raast | None |
| `notification-service` | `notify` | Notification | rsop | None |
| `notification-broker-service` | `broker` | Notification broker | queue | None |
| `receiving-service` | `receive` | Receiving | rsop | None |
| `saf-dispatcher` | `saf-dispatch` | SAF dispatcher | store | None |
| `saf-consumer` | `saf-consume` | SAF consumer | outbound | None |

- **New services.** Their labels are draft, and their families are inferred from their names: a broker, and a store-and-forward pair.
- **Colours.** Only the seven existing families are used, so no colours are added.
- **Sub line.** It shows the API's service name in mono. Long names wrap at hyphens with `<wbr>`, since `notification-broker-service` is wider than a column.
- **Ids and deep links.**
  - Inquiry keeps its ids (`incoming`, `wsi`, `queue`, `rest`, `biller`), so its deep links still work.
  - Payment ids take a lane prefix, `auth-` or `acsp-`. A service's second appearance in a lane adds `-2`, as in `auth-raast-2`.
  - Payment deep links change, because the flow's shape changes.
- **Unknown services.** A service missing from the registry still renders, as a plain RSOP step labelled with its name. `npm run check` fails and names it.

### 5.4 Flow model and layout

All in `src/lib/flow.ts`:

- **`FlowNode`:**
  - `origin` becomes `'api' | 'doc'`.
  - New fields: `service?` (the API name), `sketch?` (the sketch block) and `lane`.
  - `col` comes from the step's position in its chain.
  - `row` keeps its meaning within a lane: −1 for the store, 1 for a branch.
- **`FlowEdge`:**
  - New field `dir: 'one' | 'both'`.
  - New kind `handoff`, which joins lane 1's last Raast step to lane 2's first. It isn't drawn, but it lets a transaction cross lanes. Start and End only mark where a chain begins and ends: no transaction event sits on them, and they take no status.
- **`Flow`.** New fields `lanes: { key: string; title: string }[]` and `source: { baseUrl: string; fetchedAt: string }`.
- **`layout()`.** Stacks lanes top to bottom. Each lane has its own store and branch rows and a title above it. The canvas width is that of the longest lane:

  | Canvas | Columns | Width now | Width after |
  |---|---|---|---|
  | Inquiry | 6 → 8 | 740 px | 972 px |
  | Payment (lane 1) | 8 → 10 | 972 px | 1,204 px |

  The canvas already fits to the view, never below 70%. Below that it scrolls sideways within itself.
- **`problems()` and `mainLine()`:**
  - each lane has one Start;
  - a transaction may move only along an edge or a handoff;
  - `mainLine()` works per lane.

### 5.5 The two flows

`src/data/flows/inquiry.ts` and `payment.ts` stop listing nodes and edges. Instead they call a new `buildFlow(chainKeys, registry, overlays)`. The doc overlays and the transactions stay in these files.

**Inquiry.** The transactions gain the gateway hop on the way in. Every hop is `<-->`, so a successful answer now returns WSI → Incoming Bill → gateway and ends at the gateway, not at WSI. Outcomes are unchanged.

**Payment.** The four transactions keep their stories and move onto the two lanes:

| # | Story | Path |
|---|---|---|
| 1 | Settled, bill marked | All of lane 1, ending in AUTH → handoff → all of lane 2 |
| 2 | Refused with NAUT | Lane 1: `receiving-service` fails validation, and NAUT goes back along the AUTH path → handoff → lane 2: RJCT arrives → Rejected (doc). It never reaches SAF or the biller |
| 3 | Settled, bill marked on retry | As 1, except the biller times out and `saf-consumer` retries. The payment stays DONE |
| 4 | Awaiting ACSP | All of lane 1. It ends waiting at lane 1's last Raast step, after AUTH |

### 5.6 Canvas, inspector and legend

- **Lanes.** The Payment canvas titles each lane: "1 · pacs.008 → AUTH" and "2 · ACSP → bill marking".
- **Arrows.** A `both` hop gets an arrowhead at each end. A `one` hop gets a single arrowhead.
- **Edge labels.** These stay short (`pacs.008`, `AUTH`, `ACSP`) to fit the 52 px gap between boxes. The full message, such as `POST pacs.002 AUTH`, appears in the inspector and in screen-reader text. Screenshots confirm the fit.
- **Inspector Params.** An API step gets a `source` block above its placeholder parameters. The block gives:
  - the endpoint and key;
  - the service name;
  - the position ("3 of 8");
  - the step's neighbours in the API's own notation, messages included.
- **Toolbar.** A pill beside the version reads "RSOP API · 21 Oct, 20:46". Its tooltip gives the base URL and says it is a snapshot.
- **Legend.**
  - Solid outline: "From the RSOP API". Dashed outline: "Added from the Open Connect doc".
  - Arrows: "Request and reply" and "One way".

### 5.7 Tests

- **New `tests/chain.test.ts`:**
  - parses the three live chains;
  - checks step counts, message folding, `dir` and the house spelling;
  - checks that each malformed case throws.
- **`tests/flows.test.ts`:**
  - The **sketch test** changes from "the inquiry main line equals `SKETCH`" to "the sketch's blocks appear in the API's inquiry line, in the sketch's order". Only the gateway and End may sit between them.
  - The **payment sketch-order test** goes. "Each lane's steps equal its API chain" replaces it.
  - The **origin test** changes from "every step not on the sketch is tagged doc" to "every step is from the API or listed as a doc overlay".
  - The **doc checks** stay, retargeted to the new ids:
    - the inquiry ID comes back unchanged;
    - a refused payment never reaches SAF or the biller;
    - bill marking only follows ACSP;
    - a retry doesn't reverse the payment;
    - no bill is marked twice.
  - **New:** every service in the snapshot has a registry entry.
- **Snapshot age** is not tested. `npm run api:check` covers drift from the live API.

### 5.8 Docs and harness

- **README.md:**
  - The Overview says the Designer's steps come from the API snapshot and everything else is mock.
  - A new "The flow API" section covers pulling, checking, the snapshot and `RSOP_API_BASE`.
  - "Where things live" and "Decisions applied" gain rows.
- **details.md:**
  - §2.1 adds the API as a source.
  - §6.2 and §6.3 describe the new flows.
  - §12 adds this plan's open questions.
- **Harness.**
  - `walk.mjs` and `remote.mjs` use the payment ids `validate`, `rejected`, `queue`, `rest` and `biller`, and the deep link `/designer/payment/?txn=3&at=12&tab=debug#node-rest`. These move to the new ids.
  - The inquiry checks need no change.

## 6. Delivery steps

Each step is verified live as soon as it lands, before the next starts.

| # | Step | Checked by |
|---|---|---|
| 1 | Chain parser and its tests | `npm run check:data` on the live strings |
| 2 | Pull script and the first snapshot | `api:pull` writes the snapshot; `api:check` exits 0; an unreachable `RSOP_API_BASE` exits 1 with a clear message |
| 3 | Registry, and Inquiry built from the API | `npm run check`; build; screenshots of `/designer/inquiry/` in both themes; the inquiry walk checks; the deep link `?txn=3&at=12&tab=debug#node-rest` |
| 4 | Lanes in `layout()`, Payment built from the API, transactions rewritten | `npm run check`; screenshots; no overflow at 360, 390, 768, 1280 and 1440 px |
| 5 | Inspector source block, toolbar pill and legend | axe in both themes; the full walk |
| 6 | README, details.md and the harness ids | Every anchor resolves; the walk passes; the tunnel link works |

Review stops come after step 3 (Inquiry on the preview) and after step 5 (Payment on the preview and through the tunnel).

## 7. Risks

- **The API changes.**
  - `api:pull` prints the difference.
  - `npm run check` names any service missing from the registry and any sample transaction that no longer follows the flow.
  - The page still renders, showing unknown services as plain steps.
- **The samples are hand-written against a snapshot.** A topology change means rewriting them. The failing test names the broken hop.
- **Branding.** The service names include `fbr` and `mpg`. The labels stay neutral, but the sub lines show the names; see question 5.
- **Width.** Payment lane 1 is the widest canvas yet. Check it at 360 px.
- **Reading the arrows.** What `<-->` and `-->` mean is inferred; see question 8.

## 8. Open questions

| # | Question | Default until answered |
|---|---|---|
| 1 | Must the canvas update live? The browser cannot call the API (no CORS, private address) | Yes: the Designer renders on the server per request, through `@astrojs/node`; the snapshot is the fallback |
| 2 | Does the API outrank the sketch on which steps a flow has? | Yes |
| 3 | Payment as one page with two lanes, or as two flows in the rail? | One page, since every sample payment crosses both lanes |
| 4 | Messages such as `GET PACS008`: edge labels, or boxes of their own? | Edge labels, as the sketch labels "WS" on an edge |
| 5 | Show the raw service names (`fbr-biller-mock`, `mpg-incoming-billing-service`) in the UI? | Yes, in the sub line under a neutral label |
| 6 | Which service validates the pacs.008 and reads the inquiry store? | `receiving-service` |
| 7 | Does NAUT take the AUTH path, and RJCT the ACSP path? | Yes |
| 8 | Do `<-->` and `-->` mean "request and reply" and "one way"? | Yes |
| 9 | Which inquiry service stores the biller's answer? | WSI, as now |
| 10 | Will more endpoints follow, such as step config, transactions or status? | No: parameters and transactions stay mock |
| 11 | Will the base URL change, or need auth, outside this network? | `RSOP_API_BASE`, with no auth |
