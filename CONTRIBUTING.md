# Contributing

Open an issue before a pull request, so we can agree the change is in scope. `SCOPE.md` says what this repo publishes and what it never does. Every issue is labelled `needs-triage` when it opens and stays open until a maintainer decides it: fixed, or closed as not planned with the reason.

A pull request:

- passes `bin/check-public` and `npm test`, which runs `claude plugin validate --strict .`, the plugin's TypeScript tests and every `tests/*.test.sh`, and needs `claude`, `gitleaks` and `rsync`
- type-checks with `npx -p typescript tsc -p .`, against the types Claude Code writes to `.claude-plugin/types/` (gitignored) when an interactive `claude --plugin-dir .` starts in the checkout
- puts a new skill in a bucket under `skills/` and lists it in `.claude-plugin/plugin.json` and the README
- bumps `version` in `.claude-plugin/plugin.json` when it changes what the plugin ships, which `bin/check-version` checks; a new version on `main` is released by `release.yml`

By contributing you agree your work is released under the MIT licence in `LICENSE`.
