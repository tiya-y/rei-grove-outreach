import { neon } from '@neondatabase/serverless';

// Placeholder connection string satisfies neon()'s URL parsing at build time
// when DATABASE_URL isn't set (mirrors the old Supabase placeholder pattern).
const PLACEHOLDER_URL = 'postgresql://user:password@host.neon.tech/placeholder?sslmode=require';

// Tagged-template SQL client. Server-only — DATABASE_URL must never be
// prefixed with NEXT_PUBLIC_ or referenced from a client component.
export const sql = neon(process.env.DATABASE_URL || PLACEHOLDER_URL);
