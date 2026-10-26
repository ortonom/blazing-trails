# blazing-trails

The `ortonom` plugin, in the public GitHub repo `ortonom/blazing-trails`.

The repo root is the plugin: `.claude-plugin/plugin.json` lists the skills that ship.

## Rules

- The repo is public. Every PR passes `bin/check-public` before it merges, and every added file is read before it is committed.
- A shipped skill sits in `skills/session/`, `skills/repo/` or `skills/silent-failure/`, and is listed in `plugin.json` and the README.
- A PR that changes what ships bumps `version` in `.claude-plugin/plugin.json`, so installs update; `bin/check-version` fails one that doesn't, and `release.yml` releases each new version that reaches `main`. Versions run `1.0.0-alpha.N`, then `1.0.0-beta.N`, then `1.0.0`.
- A PR's title is its line in the release notes, written for someone who installs the plugin. A PR that adds what a user can do carries the `enhancement` label and one that fixes what they hit carries `bug`; `.github/release.yml` groups the notes by them.
