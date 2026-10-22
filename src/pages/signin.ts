import type { APIRoute } from 'astro';
import { SESSION, safeNext } from '../lib/session';

export const prerender = false;

// Any username and password will do; the form sends neither, only where to go next.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData().catch(() => null);
  cookies.set(SESSION, '1', { path: '/', httpOnly: true, sameSite: 'lax' });
  return redirect(safeNext(form?.get('next')?.toString()), 303);
};
