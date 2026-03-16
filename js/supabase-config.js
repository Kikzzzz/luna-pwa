// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
//
// ⚠️  IS IT SAFE TO COMMIT THESE TO GITHUB?
//
// YES — the anon key is DESIGNED to be public. It is not a
// secret. Every Supabase browser app exposes it. It only lets
// someone reach the database — Row Level Security (RLS) then
// enforces that each authenticated user can only ever read and
// write their OWN rows. An attacker with your anon key still
// cannot see any user's data.
//
// Your real protection layers (all set up in supabase-security.sql):
//   1. RLS policies    — every table locked to auth.uid() = user_id
//   2. Granular ops    — SELECT/INSERT/UPDATE/DELETE split separately
//   3. Date guards     — can't insert dates > 2 years ago or future
//   4. Field lengths   — mood <100 chars, notes <2000 chars, etc.
//   5. Rate limiting   — max 50 log inserts per user per hour
//   6. security_barrier view — prevents planner side-channel leaks
//
// ADDITIONAL STEPS IN SUPABASE DASHBOARD (highly recommended):
//
//   Authentication → Settings:
//     • "Site URL" = https://YOUR-USERNAME.github.io/YOUR-REPO
//     • "Redirect URLs" = same URL  ← blocks auth from other origins
//     • "Disable sign ups" = ON  ← if personal use only
//       (create your account first, THEN disable signups)
//     • "Enable email confirmations" = ON
//     • "JWT expiry" = 3600 (1 hour)
//     • "Refresh token reuse interval" = 10 seconds
//
//   API → Settings:
//     • NEVER expose your service_role key — that bypasses all RLS
//     • The anon key below is safe to commit
//
// ============================================================

const SUPABASE_URL = 'https://amasjpwgggotefdtehrn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtYXNqcHdnZ2dvdGVmZHRlaHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODI3NzEsImV4cCI6MjA4OTI1ODc3MX0.g9lyC443w9nXJ54nmMvc_Rx6MFldGDq-uR-9jYySox4';

// Initialise client
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ============================================================
// GLOBAL APP STATE
// ============================================================
window.AppState = {
  user: null,
  profile: null,
  dailyLogs: [],
  vaginalHealth: [],
  fastingLedger: [],
  fastingBalance: 0,
  realtimeSubs: [],
};
