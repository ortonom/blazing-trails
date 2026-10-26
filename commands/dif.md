---
description: Show a change as a diff and nothing else — the structured style's diff rule as a command. Runs when the user types /dif, with or without a target.
argument-hint: "[path | ref | record | blank for the change just discussed]"
---

Answer with the diff of the change, drawn as a redline: the removed and added text itself, so
the user reads the change instead of a description of it.

Target: $ARGUMENTS. Blank means the most recent change discussed; when two are in play, ask which.

## 1. Find the before and the after

Read both sides off their source. Every `-` and `+` line is copied from what a tool printed.

| the change | before and after come from |
|---|---|
| a file in a repo, made or uncommitted | `git diff -U1 -M` (add `--cached`, a ref or a range as the target needs) |
| a file proposed and not yet written | the file as it stands, and the proposal written to a scratch directory; `diff -U1 <file> <proposal>` |
| text with no file, such as a message draft or a rule quoted in chat | both versions written to a scratch directory; `diff -U1` |
| a record in a live app: a field, a workflow step, a setting | the record read now, and its earlier value from the app's history or this conversation; diff the fields that differ as `field: value` lines |
| behaviour: what happens now that didn't before | one Unicode `before → after` line in place of a diff block |

Done when both sides are in hand from a source. A side no source holds: show the side you
have, and one line naming the side that's missing.

## 2. Cut it to the change

- **Changed lines only, each one whole.** Keep one line of context where it's needed to find
  the spot.
- **Five or more hunks.** Put the `git diff --stat` line first, then the hunks that change meaning.
  Count the rest of the hunks in one line, such as `+ 4 hunks of formatting in the same file`.
- **Moves and renames.** A file that moved is a rename line. A reshaped folder is a pair of
  before-and-after trees.

Done when every changed hunk is either shown or counted.

## 3. Lay it out

````
`path/to/file`
```diff
- the whole line as it was
+ the whole line as it is
```
````

- One fenced `diff` block for each file or record, with its path or record name in
  backticks on the line above.
- Order the blocks by what the user needs to see first: the change that alters behaviour, then
  the ones that follow from it.
- The reply holds only the blocks. If the reason for a change can't be read off its diff,
  give the reason one line under that block. A reply that holds more than that is a draft.
  Cut it back to the blocks.

Done when each `-` and `+` line comes from step 1's output and every hunk is shown or
counted. Done also means the reply has no sentence that says in words what a block already
shows.
