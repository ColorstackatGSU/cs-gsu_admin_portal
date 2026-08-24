import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * The one Supabase client for the app. Auth only: we use it to obtain and refresh
 * a session, never to query data. Data goes through the Spring API (see api.ts),
 * which validates the same JWT and does its queries as a non-superuser role
 * scoped by RLS.
 *
 * The URL and anon key are per-environment. Locally they point at the Supabase
 * stack in ../cs-gsu_backend on the 544xx port band. In production they point at
 * the cloud project. A missing value is caught in main.tsx (see lib/env.ts) and
 * shown as a setup screen; throwing here would blank the page instead.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage so a refresh keeps the officer signed in.
    persistSession: true,
    // Refresh the JWT in the background before it expires. Without this a
    // long-lived tab starts getting 401s from the API when the token ages out.
    autoRefreshToken: true,
    // Detect and consume the session encoded in the URL hash after email link
    // callbacks. Harmless when there is no hash to consume.
    detectSessionInUrl: true,
  },
});
