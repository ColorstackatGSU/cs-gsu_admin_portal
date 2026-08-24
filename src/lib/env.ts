/**
 * The three VITE_ vars the app cannot run without, read in one place.
 *
 * Nothing in here throws. A module-level throw kills the whole import graph
 * before main.tsx can render anything, so a missing var shows up as a blank
 * white page with an error only in the devtools console. That is the worst
 * possible way to report a setup problem: the person who hit it is looking at
 * the page, not the console.
 *
 * main.tsx checks `missingEnv` and renders the setup screen instead of the app.
 * Same pattern as the sponsor portal.
 *
 * Vite exposes any VITE_* var to the browser bundle. None of these is a secret:
 * the anon key is a public identifier gated by RLS, and the API host is the URL
 * of an authenticated API.
 */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const API_URL = import.meta.env.VITE_API_URL ?? '';

export interface EnvVar {
  name: string;
  value: string;
  hint: string;
}

export const ENV_VARS: EnvVar[] = [
  {
    name: 'VITE_SUPABASE_URL',
    value: SUPABASE_URL,
    hint: 'Supabase Auth endpoint the browser signs in against. Locally, the 544xx port band from the backend repo.',
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    value: SUPABASE_ANON_KEY,
    hint: 'Public anon key. Locally, whatever `supabase status` prints in the backend repo.',
  },
  {
    name: 'VITE_API_URL',
    value: API_URL,
    hint: 'Where the Spring service (portal-api) lives. Locally, http://localhost:8080.',
  },
];

/** Names of the vars that are not set. Empty means the app can boot. */
export const missingEnv: string[] = ENV_VARS.filter((v) => !v.value).map((v) => v.name);
