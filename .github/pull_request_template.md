## What and why

<!-- What changed, and why. Plain words: Sahan reads this. -->

## Checks

- [ ] `npm run lint && npm test && npm run build` pass
- [ ] If SQL changed: the suites in `supabase/tests/` pass (CI runs them), and `docs/SCHEMA.md` is updated

## Database (read before merging)

Merging deploys the website at once, but migrations are pushed by hand. If this PR adds a file
in `supabase/migrations/`:

- [ ] Pushed to DEV and checked there
- [ ] **Pushed to PROD before merging** (`npx supabase link --project-ref <PROD ref>`, then
      `npx supabase db push`), so the live site never calls a function PROD does not have yet
- [ ] **Linked back to DEV straight away** (`npx supabase link --project-ref ipidpetdbordqugmkdio`)

No migration in this PR: tick nothing in this section.
