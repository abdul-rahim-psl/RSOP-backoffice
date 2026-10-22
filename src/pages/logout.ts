import type { APIRoute } from 'astro';
import { SESSION } from '../lib/session';

export const prerender = false;

const out: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION, { path: '/' });
  return redirect('/', 303);
};

export const POST = out;
export const GET = out;
