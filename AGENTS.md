## Feature Development

Check out CLAUDE.md for additional context on project file structure and general feature development.

## Backend Development

**Read the [Backend Code Quality Guide](backend/CODE_QUALITY.md) for any change under `backend/`, and check your work against it before reporting the task done.** Features, refactors, bug fixes, and reviews all count.

It is a short, deliberately non-exhaustive floor: error messages users can understand (and no pointless 500s), validation on every API input, correct pagination when calling third-party APIs, no deadlock conditions on a small connection pool, and REST-aligned API interfaces.

Treat that list as a summary of the guide's current contents, not as a condition for reading it. A change that does not look like any of those topics still gets checked, because the guide grows and because the items apply in places they are not obviously about (a bug fix that adds a query inside an existing transaction, a refactor that moves a third-party list call).

Some of it needs judgment rather than a mechanical check. The deadlock rules cannot be caught by testing one request at a time. And a design that breaks REST should be raised with the author, with the conforming alternative proposed, rather than implemented silently or quietly "fixed" (some deviations are deliberate).

## Issue Guidelines

- Never create a GitHub issue.
