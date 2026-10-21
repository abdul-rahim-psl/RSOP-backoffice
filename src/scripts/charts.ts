// One tooltip for every chart mark: shown on hover and on keyboard focus, built with textContent only.

interface TipData {
  title: string;
  rows: { value: string; label: string; key?: string }[];
}

const marks = [...document.querySelectorAll<HTMLElement>('[data-tip]')];

if (marks.length) {
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  document.body.append(tip);

  const show = (el: HTMLElement) => {
    const data = JSON.parse(el.dataset.tip ?? '{}') as TipData;
    const title = document.createElement('p');
    title.className = 'tip-title';
    title.textContent = data.title;
    const rows = data.rows.map((r) => {
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('span');
      key.className = 'tip-key';
      if (r.key) key.style.setProperty('--key', r.key);
      else key.style.visibility = 'hidden';
      const value = document.createElement('b');
      value.className = 'tip-val';
      value.textContent = r.value;
      const label = document.createElement('span');
      label.className = 'tip-label';
      label.textContent = r.label;
      row.append(key, value, label);
      return row;
    });
    tip.replaceChildren(title, ...rows);
    tip.hidden = false;

    // Above the mark when there is room, otherwise below it; always inside the viewport.
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const above = r.top - h - 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${above > 8 ? above : r.bottom + 10}px`;
  };
  const hide = () => (tip.hidden = true);

  for (const el of marks) {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', () => show(el));
    el.addEventListener('blur', hide);
  }
  addEventListener('scroll', hide, { passive: true });
}
