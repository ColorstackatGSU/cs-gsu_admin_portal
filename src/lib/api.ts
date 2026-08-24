import { supabase } from './supabase';

/**
 * The one place we call the Spring API. Attaches the current Supabase access
 * token to every request as a Bearer, and throws a structured error on non-2xx
 * so callers can render it without parsing status codes by hand.
 *
 * Not using axios because the app only needs GET/POST/etc with a bearer, and a
 * tiny fetch wrapper avoids another dependency to keep patched.
 *
 * A 401 from Spring means the token is dead — usually a stale localStorage
 * session that survived a Supabase project rotation, or a refresh that failed
 * silently. The handler signs out and redirects, so the tab does not sit there
 * showing spinners against an API that will keep 401ing forever.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error('VITE_API_URL must be set. Copy .env.example to .env.local and fill it in.');
}

export class ApiError extends Error {
  // Explicit fields rather than parameter-property shorthand: tsconfig's
  // erasableSyntaxOnly refuses the shorthand because it emits runtime code that
  // cannot be stripped by a pure type-erasure step.
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Grab the token fresh each call rather than caching. Supabase auto-refreshes
  // the session on a timer, and reading from the client is O(1). Caching a token
  // means we hold a stale one across a refresh.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    // Read the body once, tolerate non-JSON error pages (Tomcat can 401 with HTML).
    let body: unknown = null;
    try {
      const text = await res.text();
      if (text) body = JSON.parse(text);
    } catch {
      // Keep body as null; we still have the status code.
    }
    if (res.status === 401 && session?.access_token) {
      // We sent a token and the server rejected it. Fire and forget the sign
      // out so we do not chain broken calls in this tab, and bounce to /login
      // with the current path so the sponsor lands back where they started.
      void handleUnauthorized();
    }
    throw new ApiError(res.status, body, `${res.status} ${res.statusText}`);
  }

  // 204 has no body; typing it as T is the caller's problem.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Signs out and navigates to /login, preserving where the user was so they
 * come back after re-authenticating. Guarded so multiple parallel 401s do not
 * queue multiple redirects.
 *
 * Uses window.location, not react-router, because api.ts is imported from
 * hooks that live outside the router context — we would need to plumb the
 * navigator through every hook to use it, and this is a rare error path.
 */
let redirecting = false;
async function handleUnauthorized(): Promise<void> {
  if (redirecting) return;
  redirecting = true;
  try {
    await supabase.auth.signOut();
  } catch {
    // signOut can fail if the network is dead; falling through to the redirect
    // still gets the user to a state where they can retry.
  }
  const here = window.location.pathname + window.location.search;
  const params = new URLSearchParams();
  if (here && here !== '/login') params.set('from', here);
  const query = params.toString();
  window.location.assign('/login' + (query ? `?${query}` : ''));
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body == null ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body == null ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /**
   * Multipart upload. Passes the File through as FormData under the given
   * field name; must NOT set Content-Type ourselves — fetch derives the
   * multipart boundary and sets it, and a manual value breaks parsing on
   * the server.
   */
  upload: <T>(path: string, field: string, file: File) => {
    const fd = new FormData();
    fd.append(field, file);
    return request<T>(path, { method: 'POST', body: fd });
  },
};
