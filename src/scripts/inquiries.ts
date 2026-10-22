// Result chips, search and the details drawer over the inquiry log. Without it the page still works:
// each row's Details link jumps to that inquiry's card below the table.

const log = document.querySelector<HTMLElement>('[data-log]');
const drawer = document.querySelector<HTMLDialogElement>('[data-drawer]');

if (log && drawer) {
  const rows = [...log.querySelectorAll<HTMLTableRowElement>('tr[data-row]')];
  const chips = [...log.querySelectorAll<HTMLButtonElement>('button[data-show]')];
  const search = log.querySelector<HTMLInputElement>('[data-search]')!;
  const empty = log.querySelector<HTMLElement>('[data-empty]')!;
  const status = log.querySelector<HTMLElement>('[data-log-status]')!;
  const body = drawer.querySelector<HTMLElement>('[data-drawer-body]')!;
  const copyStatus = drawer.querySelector<HTMLElement>('[data-copy-status]')!;
  const [newer, older] = [...drawer.querySelectorAll<HTMLButtonElement>('[data-step]')];
  const outcomes = chips.map((c) => c.dataset.show!);
  let show = 'all';
  let openId: string | null = null;
  /** Where each card lives in the no-script list, so closing the drawer can put it back. */
  const homes = new Map<string, HTMLElement>();

  const card = (id: string) => document.getElementById(`inq-${id}`);
  const rowOf = (id: string | null) => rows.find((r) => r.dataset.id === id);
  const shown = () => rows.filter((r) => !r.hidden);

  const syncUrl = () => {
    const url = new URL(location.href);
    if (show === 'all') url.searchParams.delete('show');
    else url.searchParams.set('show', show);
    const q = search.value.trim();
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    url.hash = openId ? `inq-${openId}` : '';
    history.replaceState(null, '', url);
  };

  const apply = (announce = true) => {
    const q = search.value.trim().toLowerCase();
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.show === show)));
    let n = 0;
    for (const r of rows) {
      const on = (show === 'all' || r.dataset.show === show) && (!q || (r.dataset.text ?? '').includes(q));
      r.hidden = !on;
      if (on) n++;
    }
    empty.hidden = n > 0;
    if (announce) status.textContent = `Showing ${n} of ${rows.length} inquiries`;
    syncUrl();
  };

  const steps = () => {
    const list = shown();
    const i = list.findIndex((r) => r.dataset.id === openId);
    newer.disabled = i <= 0;
    older.disabled = i < 0 || i >= list.length - 1;
  };

  const open = (id: string) => {
    const next = card(id);
    if (!next) return;
    if (openId && openId !== id) {
      const prev = card(openId);
      if (prev) homes.get(openId)?.append(prev);
    }
    if (!homes.has(id) && next.parentElement) homes.set(id, next.parentElement);
    body.replaceChildren(next);
    body.scrollTop = 0;
    drawer.setAttribute('aria-labelledby', `inq-${id}-h`);
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
    const KEY = 'rsop-inquiries-seen';
    const seen = Date.parse(localStorage.getItem(KEY) ?? '');
    const newest = rows[0]?.dataset.at;
    if (!Number.isNaN(seen)) {
      const fresh = rows.filter((r) => Date.parse(r.dataset.at ?? '') > seen);
      fresh.forEach((r) => (r.querySelector<HTMLElement>('[data-new]')!.hidden = false));
      const note = log.querySelector<HTMLElement>('[data-new-note]')!;
      if (fresh.length) {
        note.textContent = `${fresh.length} new since your last visit.`;
        note.hidden = false;
      }
    }
    if (newest) localStorage.setItem(KEY, newest);
  } catch {}

  const params = new URLSearchParams(location.search);
  const wanted = params.get('show');
  if (wanted && outcomes.includes(wanted)) show = wanted;
  search.value = params.get('q') ?? '';
  const hashId = location.hash.match(/^#inq-(\d+)$/)?.[1];
  apply(false);
  if (hashId && card(hashId)) open(hashId);
}
