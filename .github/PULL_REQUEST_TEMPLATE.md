<!--
  Branch name must follow:  <type>/<issue-number>-<short-description>
  Commit messages must follow Conventional Commits v1.0.0-beta.4
  Every commit must include a "Refs: #N" or "Closes: #N" footer.
  These are enforced by the CI validate job — fix them before requesting review.
-->

## Linked Issue

<!-- Every PR must be linked to an existing ticket. -->

Closes #<!-- issue number -->

---

## Type of Change

<!-- Check all that apply. -->

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — code change that neither fixes a bug nor adds a feature
- [ ] `perf` — performance improvement
- [ ] `test` — adding or updating tests
- [ ] `docs` — documentation only
- [ ] `chore` — build, config, dependency update
- [ ] `ci` — CI/CD pipeline change

---

## Summary

<!-- What does this PR do? Why? Keep it to 2–4 sentences. -->

---

## Changes

<!-- Bullet list of the concrete changes made. Be specific — reviewers read this first. -->

-
-

---

## How to Test

<!-- Step-by-step instructions for a reviewer to manually verify this works. -->

1.
2.
3.

---

## Screenshots / Recording

<!-- For any UI changes, attach before/after screenshots or a short screen recording. Delete this section if not applicable. -->

| Before | After |
| ------ | ----- |
|        |       |

---

## Checklist

<!-- All boxes must be checked before requesting review. -->

- [ ] Branch name follows `<type>/<issue-number>-<description>` convention
- [ ] All commits follow Conventional Commits format with `Refs: #N` or `Closes: #N` footer
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` succeeds
- [ ] Tests added or updated for new/changed behaviour
- [ ] Coverage thresholds pass locally (`pnpm test:ci`)
- [ ] No commented-out code left behind
- [ ] No `console.log` / debug statements left in production code
- [ ] Self-reviewed — read through every line of this diff before opening

---

## Notes for Reviewer

<!-- Anything the reviewer should pay special attention to, design decisions made, trade-offs, or follow-up tickets. Delete if not applicable. -->
