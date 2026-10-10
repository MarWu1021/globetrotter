# D2 manual checklist — no action authorized by this document

1. Approve reviewed SQL and the tombstone deletion policy. Confirm globetrotter-dev Free
   project, table-name availability and intended test-only data. Never execute resets or
   destructive fixes on preexisting tables. D1 SQL has not been run.
2. Google Auth Platform: create/select project, Branding and Audience (External unless all
   users belong to your Workspace), test audience and permitted tester accounts; Data Access
   only openid/email/profile; create Web application OAuth client. Add the exact Supabase
   Google-provider callback from Dashboard to Authorized redirect URIs. Follow Google UI's
   applicable web-origin/authorized-domain requirements for the chosen redirect flow.
   Testing/public publishing requirements must be rechecked before public use.
3. Enter Google Client ID/Secret ONLY in Supabase Dashboard > Authentication > Providers >
   Google. Do not send a secret in chat, GitHub, frontend code or screenshots. No paid API.
4. Supabase Authentication > URL Configuration: add only the approved deployment's exact
   HTTPS /auth/callback URL to Redirect URLs. No wildcard. Each new unique Preview URL
   needs approval/addition; no Production URL is changed. Site URL and explicit redirectTo
   must not accidentally bounce a Preview login to Production. Confirm exact project ref;
   do not substitute the display name globetrotter-dev for it.
5. Review/authorize/apply SQL separately to globetrotter-dev. Verify RLS is on for both
   tables. Using two real TEST accounts: own CRUD succeeds; other-user SELECT empty;
   spoofed ownership INSERT/UPDATE fails; moving an owner/primary key fails; anonymous
   CRUD fails; CAS conflict, parallel create, replay and tombstone retries behave correctly.
   Use authenticated clients/SQL role JWT simulation, not an admin connection as proof.
   Do not paste session tokens in chat. Tests can run with credentials entered securely.
6. Vercel Preview environment variables ONLY, after separate authorization:
   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
   Publishable key is designed for client use; effective RLS is required. Never add
   service_role, secret API keys, or Google Client Secret to NEXT_PUBLIC_* or this repo.
   Existing Production settings/aliases remain unchanged. A separately authorized new
   Preview deployment is necessary to consume new build-time values.
7. After deployment approval: add its exact callback to allowlist, then test Google login,
   cancellation, refresh, Safari background return, private mode, logout, account switching,
   second device sync and two-user isolation. No current local test trips are uploaded.
8. Before entering REAL data, confirm database lifecycle/Free quota and whether a separate
   Free production project will later be used; not created in D1/D2 by this checklist.

Read official docs again during D2: Supabase auth/social-login/auth-google,
auth/server-side/creating-a-client, auth/redirect-urls, database/postgres/row-level-security.
Do not depend on old Next middleware examples: this project uses Next.js 16 proxy.ts.
