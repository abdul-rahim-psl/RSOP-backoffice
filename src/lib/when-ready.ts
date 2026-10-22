// Server islands arrive after the page's scripts run, so a script that needs their markup waits for it here.

/** Calls `init` with the first match of `selector`, now or as soon as it is added to the page; once only. */
export function whenReady<T extends HTMLElement = HTMLElement>(selector: string, init: (el: T) => void) {
  const found = document.querySelector<T>(selector);
  if (found) return init(found);
  const watch = new MutationObserver(() => {
    const el = document.querySelector<T>(selector);
    if (!el) return;
    watch.disconnect();
    init(el);
  });
  watch.observe(document.body, { childList: true, subtree: true });
}
