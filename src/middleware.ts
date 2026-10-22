// Every screen starts from signing in: a request without a session goes to the sign-in page, which brings it back after.
import { defineMiddleware } from 'astro:middleware';
import { isOpen, signedIn } from './lib/session';

export const onRequest = defineMiddleware((ctx, next) => {
  const { pathname, search } = ctx.url;
  if (isOpen(pathname) || signedIn(ctx.cookies)) return next();
  // An island's request is fetched into the page, so a redirect would put the sign-in page inside it.
  if (pathname.startsWith('/_server-islands/')) return new Response(null, { status: 401 });
  return ctx.redirect(`/?next=${encodeURIComponent(pathname + search)}`, 303);
});
