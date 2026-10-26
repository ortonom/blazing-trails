---
description: Regroup — find the plans, handoffs and branches about this work, and name the one thing in them ready to ship; read only, typed only.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git branch --list:*), Bash(git worktree list:*), Bash(gh pr list:*), Bash(gh pr view:*)
---

Find the plans, handoffs and branches about this work, and name the one thing in them ready to ship.

- Read only: change, move and delete nothing.
- Whose a plan is stays unknown unless the file or a transcript shows it; another conversation's plan is evidence, never ours to change.

End with the thing to ship and where it lives, or "nothing ready" and what blocks it.
