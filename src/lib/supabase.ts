import type { SupabaseClient } from '@supabase/supabase-js';

// The anon key is designed to be public: what it can do is limited by the database's row-level security
// (supabase/schema.sql). Never put the service-role key in this site.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: Promise<SupabaseClient> | null = null;

/** Loaded on demand so the public landing page doesn't pay for the database client. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!supabaseConfigured) return Promise.reject(new Error('Supabase is not configured'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jvj-portal-auth' },
    }),
  );
  return client;
}
