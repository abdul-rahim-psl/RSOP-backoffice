// Search and role filter over the users table, and the invite/edit dialog, which never sends anything.

const root = document.querySelector<HTMLElement>('[data-users]');
const rows = [...document.querySelectorAll<HTMLTableRowElement>('tr[data-user]')];

if (root && rows.length) {
  const search = root.querySelector<HTMLInputElement>('[data-search]')!;
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-role]')];
  const empty = document.querySelector<HTMLElement>('[data-empty]')!;
  const status = document.querySelector<HTMLElement>('[data-user-status]')!;
  let role = 'all';

  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const row of rows) {
      const on = (role === 'all' || row.dataset.role === role) && (!q || (row.dataset.text ?? '').includes(q));
      row.hidden = !on;
      if (on) shown++;
    }
    empty.hidden = shown > 0;
    status.textContent = `Showing ${shown} of ${rows.length} users`;
  };

  search.addEventListener('input', apply);
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      role = c.dataset.role ?? 'all';
      chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
      apply();
    }),
  );
}

const dialog = document.querySelector<HTMLDialogElement>('[data-dialog]');

if (dialog) {
  const form = dialog.querySelector<HTMLFormElement>('[data-dialog-form]')!;
  const title = dialog.querySelector<HTMLElement>('[data-dialog-title]')!;
  const note = dialog.querySelector<HTMLElement>('[data-dialog-note]')!;
  const noteText = dialog.querySelector<HTMLElement>('[data-dialog-note-text]')!;
  let mode: 'invite' | 'edit' = 'invite';
  const submit = dialog.querySelector<HTMLButtonElement>('[data-dialog-submit]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-dialog-close]')!;
  const field = (f: string) => dialog.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-f="${f}"]`)!;

  const open = (as: 'invite' | 'edit', user?: { name: string; email: string; role: string }) => {
    mode = as;
    title.textContent = mode === 'invite' ? 'Invite user' : `Edit ${user?.name ?? 'user'}`;
    submit.textContent = mode === 'invite' ? 'Send invite' : 'Save changes';
    submit.hidden = false;
    close.textContent = 'Cancel';
    note.hidden = true;
    field('name').value = user?.name ?? '';
    field('email').value = user?.email ?? '';
    field('role').value = user?.role ?? 'Viewer';
    dialog.showModal();
  };

  document.querySelector('[data-invite]')?.addEventListener('click', () => open('invite'));
  document.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) =>
    b.addEventListener('click', () =>
      open('edit', { name: b.dataset.name ?? '', email: b.dataset.email ?? '', role: b.dataset.role ?? 'Viewer' }),
    ),
  );
  close.addEventListener('click', () => dialog.close());

  // The form validates as a real one would, then confirms the invite or the change.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    noteText.textContent = mode === 'invite' ? `Invitation sent to ${field('email').value.trim()}.` : 'Changes saved.';
    note.hidden = false;
    submit.hidden = true;
    close.textContent = 'Close';
    close.focus();
  });
}
