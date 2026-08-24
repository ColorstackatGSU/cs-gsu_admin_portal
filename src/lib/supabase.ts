import { createClient } from '@supabase/supabase-js';

/**
 * The one Supabase client for the app. Auth only: we use it to obtain and refresh
 * a session, never to query data. Data goes through the Spring API (see api.ts),
 * which validates the same JWT and does its queries as a non-superuser role
 * scoped by RLS.
 *
 * The URL and anon key are per-environment. Locally they point at the Supabase
 * stack in ../cs-gsu_backend on the 544xx port band. In production they point at
 * the cloud project. If either is missing at load time we throw here rather than
 * later at the first sign-in attempt, so a bad env is visible on page load.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.local and fill them in.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Persist session in localStorage so a refresh keeps the sponsor signed in.
    persistSession: true,
    // Refresh the JWT in the background before it expires. Without this a
    // long-lived tab starts getting 401s from the API when the token ages out.
    autoRefreshToken: true,
    // Detect and consume the session encoded in the URL hash after email link
    // callbacks. Harmless when there is no hash to consume.
    detectSessionInUrl: true,
  },
});
