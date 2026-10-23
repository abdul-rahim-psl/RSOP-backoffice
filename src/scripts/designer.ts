import { crossedAt, statesAt, type FlowEdge, type NodeState, type Tone } from '../lib/flow';
import { since } from '../lib/format';

interface ClientEvent {
  at: number;
  node: string;
  tone: Tone;
  title: string;
  text: string;
}

interface ClientTxn {
  n: number;
  events: ClientEvent[];
}

interface ClientFlow {
  id: string;
  nodes: { id: string; label: string }[];
  edges: FlowEdge[];
  txns: ClientTxn[];
}

const PLAY_MS = 1100;
const ZOOMS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const ZOOM_MIN = ZOOMS[0];
const ZOOM_MAX = ZOOMS[ZOOMS.length - 1];
/** Below this the labels get too small to read, so the canvas scrolls instead. */
const FIT_MIN = 0.7;
const FIT_MAX = 1.1;
const wide = matchMedia('(min-width: 1180px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const stateWord: Record<NodeState, string> = {
  ok: 'passed',
  fail: 'failed',
  wait: 'waiting',
  info: 'passed',
  todo: 'not reached',
};

const root = document.querySelector<HTMLElement>('[data-designer]');
if (root) init(root);

function init(root: HTMLElement) {
  const flow = JSON.parse(root.querySelector('[data-flow]')?.textContent ?? '{}') as ClientFlow;
  const label = new Map(flow.nodes.map((n) => [n.id, n.label]));
  const one = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const all = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];

  const nodes = all<HTMLButtonElement>('.node');
  const edges = [...root.querySelectorAll<SVGGElement>('.edge')];
  const range = one<HTMLInputElement>('[data-tl-range]');
  const caption = one('[data-tl-caption]');
  const count = one('[data-tl-count]');
  const viewport = one('[data-viewport]');
  const stage = one('[data-stage]');
  const zoomLabel = one('[data-zoom-label]');
  const act = (name: string) => one<HTMLButtonElement>(`[data-act="${name}"]`);

  const state = {
    txn: null as ClientTxn | null,
    at: 0,
    node: root.dataset.defaultNode ?? 'start',
    zoom: 'fit' as number | 'fit',
    timer: 0,
  };

  // A deep link picks the transaction, the event (1-based) and the step: ?txn=3&at=12#node-rest
  const q = new URLSearchParams(location.search);
  const wanted = q.get('txn') ?? root.dataset.defaultTxn ?? 'none';
  state.txn = flow.txns.find((t) => String(t.n) === wanted) ?? null;
  if (state.txn) {
    const at = Number(q.get('at'));
    state.at = at >= 1 && at <= state.txn.events.length ? at - 1 : state.txn.events.length - 1;
  }
  const fromHash = location.hash.match(/^#node-([\w-]+)$/)?.[1];
  if (fromHash && label.has(fromHash)) state.node = fromHash;

  // ── Rendering ───────────────────────────────────────────────────────────

  const isTxn = (el: HTMLElement, t: ClientTxn | null) => !!t && Number(el.dataset.txn) === t.n;

  function renderNode() {
    nodes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.node === state.node)));
    all('.insp-head, .insp-sec').forEach((el) => el.toggleAttribute('data-on', el.dataset.node === state.node));
  }

  function renderTxn() {
    const t = state.txn;
    root.toggleAttribute('data-has-txn', !!t);
    all('.tl-which, .tl-track').forEach((el) => el.toggleAttribute('data-on', isTxn(el, t)));
    one('[data-tl-empty]').hidden = !!t;
    ['first', 'prev', 'play', 'next', 'last'].forEach((a) => (act(a).disabled = !t));
    range.disabled = !t;

    if (!t) {
      stop();
      nodes.forEach((b) => {
        delete b.dataset.state;
        b.removeAttribute('data-current');
        b.setAttribute('aria-label', b.dataset.name ?? '');
      });
      edges.forEach((g) => {
        g.removeAttribute('data-crossed');
        g.removeAttribute('data-active');
      });
      caption.replaceChildren();
      count.textContent = '';
      range.max = '0';
      range.value = '0';
      return;
    }

    const last = t.events.length - 1;
    const ev = t.events[state.at];
    const states = statesAt(flow, t, state.at);
    nodes.forEach((b) => {
      // Start and End only mark where an API chain begins and ends; no transaction stops there.
      if (b.hasAttribute('data-terminal')) return;
      const id = b.dataset.node!;
      b.dataset.state = states[id];
      b.toggleAttribute('data-current', id === ev.node);
      b.setAttribute('aria-label', `${b.dataset.name}, ${stateWord[states[id]]}`);
    });

    const crossed = crossedAt(flow, t, state.at);
    const prev = state.at > 0 ? t.events[state.at - 1].node : null;
    edges.forEach((g) => {
      const key = g.dataset.key ?? '';
      const [a, b] = key.split('>');
      g.toggleAttribute('data-crossed', crossed.has(key));
      g.toggleAttribute('data-active', !!prev && prev !== ev.node && [a, b].includes(prev) && [a, b].includes(ev.node));
    });

    const track = one(`.tl-track[data-txn="${t.n}"]`);
    track.style.setProperty('--frac', String(last ? state.at / last : 0));
    track.querySelectorAll<HTMLElement>('.stop').forEach((s) => {
      const i = Number(s.dataset.i);
      s.dataset.state = i < state.at ? 'past' : i === state.at ? 'current' : 'next';
    });

    const name = label.get(ev.node) ?? ev.node;
    range.max = String(last);
    range.value = String(state.at);
    range.setAttribute('aria-valuetext', `Event ${state.at + 1} of ${last + 1}: ${name}, ${ev.title}`);
    count.textContent = `${state.at + 1} / ${last + 1}`;
    act('first').disabled = act('prev').disabled = state.at === 0;
    act('next').disabled = act('last').disabled = state.at === last;
    writeCaption(t, ev, name);
  }

  // Built with textContent: captions come from data, never from markup.
  function writeCaption(t: ClientTxn, ev: ClientEvent, name: string) {
    const dot = document.createElement('span');
    dot.className = 'cap-dot';
    dot.dataset.tone = ev.tone;
    const icon = root.querySelector(`.tl-track[data-txn="${t.n}"] .stop[data-i="${state.at}"] .tone-icon`);
    if (icon) dot.append(icon.cloneNode(true));
    const head = document.createElement('b');
    head.textContent = `${name} · ${ev.title}`;
    const time = document.createElement('span');
    time.className = 'cap-time mono';
    time.textContent = since(ev.at);
    const text = document.createElement('span');
    text.className = 'cap-text';
    text.textContent = ev.text;
    caption.replaceChildren(dot, head, time, text);
  }

  // ── State changes ───────────────────────────────────────────────────────

  function syncUrl() {
    const p = new URLSearchParams();
    p.set('txn', state.txn ? String(state.txn.n) : 'none');
    if (state.txn) p.set('at', String(state.at + 1));
    const url = `${location.pathname}?${p}#node-${state.node}`;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  }

  /** Moves the timeline; the step that event happened at becomes the selected one. */
  function go(at: number) {
    if (!state.txn) return;
    state.at = Math.max(0, Math.min(state.txn.events.length - 1, at));
    state.node = state.txn.events[state.at].node;
    renderTxn();
    renderNode();
    syncUrl();
    reveal(state.node);
  }

  function stop() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = 0;
    root.removeAttribute('data-playing');
    act('play').setAttribute('aria-label', 'Play');
  }

  function play() {
    const t = state.txn;
    if (!t) return;
    if (state.timer) return stop();
    if (state.at === t.events.length - 1) go(0);
    root.setAttribute('data-playing', '');
    act('play').setAttribute('aria-label', 'Pause');
    state.timer = window.setInterval(() => {
      if (!state.txn || state.at >= state.txn.events.length - 1) return stop();
      go(state.at + 1);
    }, PLAY_MS);
  }

  // ── Zoom ────────────────────────────────────────────────────────────────

  const sceneW = Number(stage.dataset.w);
  const sceneH = Number(stage.dataset.h);

  function fit() {
    const w = viewport.clientWidth - 24;
    // Only the three-column layout gives the canvas a fixed height to fit into.
    const h = wide.matches ? viewport.clientHeight - 24 : Infinity;
    return Math.max(FIT_MIN, Math.min(FIT_MAX, w / sceneW, h / sceneH));
  }

  const zoomNow = () => (state.zoom === 'fit' ? fit() : state.zoom);

  function applyZoom() {
    const z = zoomNow();
    stage.style.setProperty('--z', z.toFixed(3));
    zoomLabel.textContent = `${state.zoom === 'fit' ? 'Fit · ' : ''}${Math.round(z * 100)}%`;
  }

  function zoomBy(dir: 1 | -1) {
    const z = zoomNow();
    const next = dir > 0 ? ZOOMS.find((v) => v > z + 0.001) : [...ZOOMS].reverse().find((v) => v < z - 0.001);
    if (next) {
      state.zoom = next;
      applyZoom();
    }
  }

  /** Zooms to `z`, keeping the scene point under (x, y) under the pointer. */
  function zoomAt(z: number, x: number, y: number) {
    const before = zoomNow();
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (Math.abs(next - before) < 0.001) return;
    const r0 = stage.getBoundingClientRect();
    const sx = (x - r0.left) / before;
    const sy = (y - r0.top) / before;
    state.zoom = next;
    applyZoom();
    // Measured after the resize, because the stage re-centres when it is smaller than the canvas.
    const r1 = stage.getBoundingClientRect();
    viewport.scrollLeft += r1.left + sx * next - x;
    viewport.scrollTop += r1.top + sy * next - y;
  }

  /** Keeps a step in view by scrolling the canvas only, never the page. */
  function reveal(id: string) {
    const b = nodes.find((x) => x.dataset.node === id);
    if (!b || viewport.scrollWidth <= viewport.clientWidth) return;
    const center = (b.offsetLeft + b.offsetWidth / 2) * zoomNow();
    const left = viewport.scrollLeft;
    if (center < left + 60 || center > left + viewport.clientWidth - 60) {
      viewport.scrollTo({ left: center - viewport.clientWidth / 2, behavior: reduced.matches ? 'auto' : 'smooth' });
    }
  }

  // ── Wiring ──────────────────────────────────────────────────────────────

  nodes.forEach((b) =>
    b.addEventListener('click', () => {
      state.node = b.dataset.node!;
      renderNode();
      syncUrl();
    }),
  );

  range.addEventListener('input', () => {
    stop();
    go(Number(range.value));
  });
  act('first').addEventListener('click', () => (stop(), go(0)));
  act('prev').addEventListener('click', () => (stop(), go(state.at - 1)));
  act('next').addEventListener('click', () => (stop(), go(state.at + 1)));
  act('last').addEventListener('click', () => (stop(), go(Number.MAX_SAFE_INTEGER)));
  act('play').addEventListener('click', play);

  all<HTMLButtonElement>('[data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.zoom === 'fit') {
        state.zoom = 'fit';
        applyZoom();
      } else zoomBy(b.dataset.zoom === 'in' ? 1 : -1);
    }),
  );
  new ResizeObserver(() => state.zoom === 'fit' && applyZoom()).observe(viewport);

  // Pinch and Ctrl/⌘ + wheel zoom the canvas instead of the page; a plain wheel still scrolls.
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Clamped so a mouse-wheel notch and a trackpad pinch both move at a usable speed.
      const dy = Math.max(-25, Math.min(25, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
      zoomAt(zoomNow() * Math.exp(-dy * 0.01), e.clientX, e.clientY);
    },
    { passive: false },
  );

  all<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const text = b.querySelector('[data-copy-label]');
      try {
        await navigator.clipboard.writeText(b.dataset.copy ?? '');
        if (text) text.textContent = 'Copied';
      } catch {
        if (text) text.textContent = 'Copy blocked';
      }
      window.setTimeout(() => text && (text.textContent = 'Copy'), 1600);
    }),
  );

  applyZoom();
  renderTxn();
  renderNode();
  reveal(state.node);
}
