// Result chips, search and the details drawer over a bill log. It starts once the log's server island
// has arrived; until then the page shows the loader.
import { whenReady } from '../lib/when-ready';

whenReady('[data-log]', (log) => {
  const drawer = document.querySelector<HTMLDialogElement>('[data-drawer]');
  if (!drawer) return;
  const rows = [...log.querySelectorAll<HTMLTableRowElement>('tr[data-row]')];
  const chips = [...log.querySelectorAll<HTMLButtonElement>('button[data-show]')];
  const search = log.querySelector<HTMLInputElement>('[data-search]')!;
  const empty = log.querySelector<HTMLElement>('[data-empty]')!;
  const status = log.querySelector<HTMLElement>('[data-log-status]')!;
  const pager = log.querySelector<HTMLElement>('[data-pager]')!;
  const pagerSum = log.querySelector<HTMLElement>('[data-pager-sum]')!;
  const pagerPages = log.querySelector<HTMLElement>('[data-pager-pages]')!;
  const [prevPage, nextPage] = [...log.querySelectorAll<HTMLButtonElement>('[data-page-step]')];
  /** Rows a page; the chips and search pick the rows, the pager splits them. */
  const PAGE = 10;
  let page = 0;
  let matching: HTMLTableRowElement[] = [];
  const body = drawer.querySelector<HTMLElement>('[data-drawer-body]')!;
  const copyStatus = drawer.querySelector<HTMLElement>('[data-copy-status]')!;
  const [newer, older] = [...drawer.querySelectorAll<HTMLButtonElement>('[data-step]')];
  const outcomes = chips.map((c) => c.dataset.show!);
  // The log's id prefix ("inq", "pay"), its noun and where this browser keeps its last-seen time.
  const { anchor = 'inq', many = 'entries', seenKey = 'rsop-inquiries-seen' } = log.dataset;
  let show = 'all';
  let openId: string | null = null;
  /** Where each card lives in the no-script list, so closing the drawer can put it back. */
  const homes = new Map<string, HTMLElement>();

  const card = (id: string) => document.getElementById(`${anchor}-${id}`);
  const rowOf = (id: string | null) => rows.find((r) => r.dataset.id === id);
  const shown = () => matching;
  const pageCount = () => Math.max(1, Math.ceil(matching.length / PAGE));

  const syncUrl = () => {
    const url = new URL(location.href);
    if (show === 'all') url.searchParams.delete('show');
    else url.searchParams.set('show', show);
    const q = search.value.trim();
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    if (page > 0) url.searchParams.set('page', String(page + 1));
    else url.searchParams.delete('page');
    url.hash = openId ? `${anchor}-${openId}` : '';
    history.replaceState(null, '', url);
  };

  /** Page numbers to offer: all of them when few, else the ends and the current page's neighbours. */
  const pageList = (n: number, cur: number): (number | null)[] => {
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const keep = [...new Set([0, cur - 1, cur, cur + 1, n - 1])].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
    return keep.flatMap((i, k) => (k && i - keep[k - 1]! > 1 ? [null, i] : [i]));
  };

  /** Shows the current page of the matching rows and redraws the pager. */
  const render = () => {
    page = Math.min(Math.max(0, page), pageCount() - 1);
    const from = page * PAGE;
    const onPage = new Set(matching.slice(from, from + PAGE));
    for (const r of rows) r.hidden = !onPage.has(r);
    empty.hidden = matching.length > 0;
    pager.hidden = matching.length <= PAGE;
    pagerSum.textContent = `Showing ${from + 1}–${Math.min(from + PAGE, matching.length)} of ${matching.length} ${many}`;
    pagerPages.replaceChildren(
      ...pageList(pageCount(), page).map((i) => {
        if (i === null) {
          const gap = document.createElement('span');
          gap.className = 'gap';
          gap.textContent = '…';
          return gap;
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pbtn';
        b.dataset.page = String(i);
        b.textContent = String(i + 1);
        b.setAttribute('aria-label', `Page ${i + 1}`);
        if (i === page) b.setAttribute('aria-current', 'page');
        return b;
      }),
    );
    prevPage.disabled = page === 0;
    nextPage.disabled = page >= pageCount() - 1;
    syncUrl();
  };

  /** Re-applies the chips and search; a new filter starts again from the first page. */
  const apply = (announce = true, keepPage = false) => {
    const q = search.value.trim().toLowerCase();
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.show === show)));
    matching = rows.filter((r) => (show === 'all' || r.dataset.show === show) && (!q || (r.dataset.text ?? '').includes(q)));
    if (!keepPage) page = 0;
    render();
    if (announce) status.textContent = `${matching.length} of ${rows.length} ${many} match`;
  };

  const goTo = (next: number) => {
    page = next;
    render();
    log.querySelector('.table-wrap')?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  pager.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const num = t.closest<HTMLButtonElement>('[data-page]');
    if (num) return goTo(Number(num.dataset.page));
    const step = t.closest<HTMLButtonElement>('[data-page-step]');
    if (step && !step.disabled) goTo(page + Number(step.dataset.pageStep));
  });

  const steps = () => {
    const list = shown();
    const i = list.findIndex((r) => r.dataset.id === openId);
    newer.disabled = i <= 0;
    older.disabled = i < 0 || i >= list.length - 1;
  };

  const open = (id: string) => {
    const next = card(id);
    if (!next) return;
    // A row on another page of the matching rows brings that page up behind the drawer.
    const at = matching.findIndex((r) => r.dataset.id === id);
    if (at >= 0 && Math.floor(at / PAGE) !== page) {
      page = Math.floor(at / PAGE);
      render();
    }
    if (openId && openId !== id) {
      const prev = card(openId);
      if (prev) homes.get(openId)?.append(prev);
    }
    if (!homes.has(id) && next.parentElement) homes.set(id, next.parentElement);
    body.replaceChildren(next);
    body.scrollTop = 0;
    drawer.setAttribute('aria-labelledby', `${anchor}-${id}-h`);
    rows.forEach((r) => r.toggleAttribute('data-current', r.dataset.id === id));
    openId = id;
    if (!drawer.open) drawer.showModal();
    steps();
    syncUrl();
  };

  drawer.addEventListener('close', () => {
    const id = openId;
    if (id) {
      const c = card(id);
      if (c) homes.get(id)?.append(c);
    }
    openId = null;
    rows.forEach((r) => r.removeAttribute('data-current'));
    syncUrl();
    rowOf(id)?.querySelector<HTMLElement>('[data-open]')?.focus();
  });

  // A click anywhere on a row opens it, unless the reader was selecting text in it.
  log.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLTableRowElement>('tr[data-row]');
    if (!row) return;
    const link = t.closest('[data-open]');
    if (!link && (t.closest('a, button') || getSelection()?.toString())) return;
    e.preventDefault();
    open(row.dataset.id!);
  });

  drawer.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t === drawer) return drawer.close();
    if (t.closest('[data-close]')) return drawer.close();
    const step = t.closest<HTMLButtonElement>('[data-step]');
    if (step) {
      const list = shown();
      const target = list[list.findIndex((r) => r.dataset.id === openId) + Number(step.dataset.step)];
      if (target) open(target.dataset.id!);
      return;
    }
    const copy = t.closest<HTMLButtonElement>('[data-copy]');
    if (copy) {
      const label = copy.dataset.copyLabel ?? 'Value';
      try {
        await navigator.clipboard.writeText(copy.dataset.copy ?? '');
        copy.dataset.done = '';
        copyStatus.textContent = `${label} copied`;
        setTimeout(() => delete copy.dataset.done, 1500);
      } catch {
        copyStatus.textContent = `Couldn't copy the ${label}; select it instead`;
      }
    }
  });

  chips.forEach((c) =>
    c.addEventListener('click', () => {
      show = c.dataset.show ?? 'all';
      apply();
    }),
  );
  search.addEventListener('input', () => apply());
  log.querySelector('[data-clear]')?.addEventListener('click', () => {
    show = 'all';
    search.value = '';
    apply();
    search.focus();
  });

  // The "Needs attention" tiles filter in place instead of reloading the page and the log.
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="?show="]');
    const wanted = a && new URL(a.href).searchParams.get('show');
    if (!wanted || !outcomes.includes(wanted)) return;
    e.preventDefault();
    show = wanted;
    search.value = '';
    apply();
    log.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  // Rows newer than the newest one seen on this browser's last visit get a "New" tag.
  try {
    const seen = Date.parse(localStorage.getItem(seenKey) ?? '');
    const newest = rows[0]?.dataset.at;
    if (!Number.isNaN(seen)) {
      const fresh = rows.filter((r) => Date.parse(r.dataset.at ?? '') > seen);
      fresh.forEach((r) => (r.querySelector<HTMLElement>('[data-new]')!.hidden = false));
      const note = log.querySelector<HTMLElement>('[data-new-note]')!;
      if (fresh.length) {
        note.textContent = `${fresh.length} new since your last visit`;
        note.hidden = false;
      }
    }
    if (newest) localStorage.setItem(seenKey, newest);
  } catch {}

  const params = new URLSearchParams(location.search);
  const wanted = params.get('show');
  if (wanted && outcomes.includes(wanted)) show = wanted;
  search.value = params.get('q') ?? '';
  page = Math.max(0, (Number(params.get('page')) || 1) - 1);
  const hashId = location.hash.match(new RegExp(`^#${anchor}-(\\d+)$`))?.[1];
  apply(false, true);
  if (hashId && card(hashId)) open(hashId);
});
