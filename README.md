# SigEP Krillion

Play at https://xwesty1.github.io/sigep-krillion/.

GitHub Pages hosts `index.html`. The game loads its published pack from the
Supabase `shared-game` Edge Function. **Anyone can open the editor and click
Save for everyone to publish changes without an account.** Unsaved changes
remain a browser-local draft. Imports and new games must also be saved to publish.

New visits fetch the latest published game. The home screen refreshes every
30 seconds and on window focus, and has a manual Refresh shared game button.
An ongoing dive or editor draft is never replaced in the background.

Concurrent saves use a revision number. If another editor saves first, the
stale save is rejected and the draft remains available to export. Return Home
to load the latest version, then apply the desired edits again.
Network failures preserve the draft and show a failure message.

Downloaded HTML copies opened with `file://` use local browser storage and
never publish to the shared game.

## Backend

Supabase project: `vxizqupmvtaxdnwvzmyd` (`sigep-krillion`).
Function source: `supabase/functions/shared-game/index.ts`.
Schema source: `supabase/schema.sql` (already applied to the hosted project).

The function intentionally accepts unauthenticated GET and POST requests.
POST validates the same pack format as the editor and conditionally updates
the singleton `main` row only if its revision still matches.
The service-role key is read exclusively from the function environment.
No privileged credential is present in the page or repository.
Both tables have RLS enabled and public table access revoked; only the function
can publish. The no-policy RLS advisory is intentional: these tables are private.

Every successful update archives the previous pack in `public.game_history`.
For owner recovery, inspect revisions in the Supabase SQL editor, then restore
a chosen pack into `shared_games` using its current revision plus one. The
trigger also archives the version being replaced during recovery.

If redeploying the function, preserve `verify_jwt = false` in the function
configuration so anonymous community editing continues to work. Changing
access to require sign-in requires corresponding frontend changes.

## Verification

Run `node test-shared.cjs` for shared transport, fresh-session persistence,
concurrent-edit rejection, network-failure behavior, validation and HTML syntax.
Run `node test-api.cjs` for the deployed endpoint. This integration check
re-saves the identical live pack, incrementing its revision without changing
the game content.

