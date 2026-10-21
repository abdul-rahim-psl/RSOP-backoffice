// Filter chips over the billing table. ?status=refused (from a "Needs attention" tile) picks a chip on load.

const section = document.querySelector<HTMLElement>('[data-billing]');

if (section) {
  const chips = [...section.querySelectorAll<HTMLButtonElement>('button[data-filter]')];
  const rows = [...section.querySelectorAll<HTMLTableRowElement>('tbody tr[data-filter]')];
  const empty = section.querySelector<HTMLElement>('[data-empty]')!;
  const status = section.querySelector<HTMLElement>('[data-bill-status]')!;

  const apply = (id: string, announce = true) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === id)));
    let shown = 0;
    for (const row of rows) {
      const on = id === 'all' || row.dataset.filter === id;
      row.hidden = !on;
      if (on) shown++;
    }
    empty.hidden = shown > 0;
    if (announce) status.textContent = `Showing ${shown} of ${rows.length} bills`;
  };

  chips.forEach((c) => c.addEventListener('click', () => apply(c.dataset.filter ?? 'all')));

  const wanted = new URLSearchParams(location.search).get('status');
  if (wanted && chips.some((c) => c.dataset.filter === wanted)) apply(wanted, false);
}
