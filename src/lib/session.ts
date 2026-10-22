// The draft's sign-in: no real accounts, only a session cookie that says someone signed in on this browser.
// It lasts until the browser closes; every screen but the sign-in page needs it.
import type { AstroCookies } from 'astro';

export const SESSION = 'rsop_session';

/** Paths anyone may open: the sign-in page and the two routes that start and end a session. */
export const isOpen = (path: string) => path === '/' || path === '/signin' || path === '/logout';

export const signedIn = (cookies: AstroCookies) => cookies.get(SESSION)?.value === '1';

/** Only a same-site path comes back from the sign-in form, never another origin. */
export const safeNext = (next: string | null | undefined) =>
  next && next.startsWith('/') && !next.startsWith('//') && !isOpen(next.split(/[?#]/)[0]) ? next : '/dashboard/';
