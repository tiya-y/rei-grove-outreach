import { createClient } from '@supabase/supabase-js';

// Placeholder URL satisfies Supabase's URL validator at build time when env vars aren't set
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder';

// Client-side Supabase client (anon key — respects RLS)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY
);

// Server-side Supabase client (service role — bypasses RLS). Use only inside
// API routes / server code, never expose SUPABASE_SERVICE_ROLE_KEY to the client.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || PLACEHOLDER_KEY,
    { auth: { persistSession: false } }
  );
}
