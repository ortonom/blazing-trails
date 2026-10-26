---
name: descatter
description: Consolidate duplicate ideas into a canonical location. Use when a meaning, process or policy is stated in several files or repos, on a diff that adds guidance, or to survey a group of repos for what has scattered.
---

# Descattering

A pod is a group of repos that share one setup: a start hook, a CLAUDE.md, a glossary. Where the user has none, the scope is a repo or "everywhere".

The scope is one of three:

| scope | what is given |
|---|---|
| a concern | in the user's words, with a pod, a repo or "everywhere" |
| `diff` | a PR or commit; none means this branch against its base |
| `survey` | a pod or "everywhere" |

A concern is one decision about how work is done here: how a change travels, where a secret lives, what a word means. Sessions meet it in layers, highest first: global (`~/.claude/CLAUDE.md`, `~/.claude/rules/`, and what every session on this machine runs under: the tools, hooks and settings of `~/.claude`, git's user config and ignore file), pod, repo, file. Each statement of a concern has one home: the place every session that acts on it reads it from. The agreed words are the home's and the glossary's.

## Inventory

Take each repo in scope at its origin default branch; a pod's repos are the ones its shared setup lists, or the ones the user names. Search tracked files for the concern's words and their relatives: synonyms, and the commands, paths, flags and setting keys that carry it out. Then read each repo's guidance whole (CLAUDE.md, AGENTS.md, README, glossary, deploy and design docs, `.claude/settings.json` and `.claude/rules/`, ignore files, hooks, checks) for the concern said without those words. One row per statement: repo, file:line, what it states in one clause. A setting or check that requires each repo to hold the decision is a statement of it in each. Rows that state the same thing form a group, whatever their words. Read the layers above the scope the same way; their rows join the groups and take verdicts too.

A sub-agent may read one repo and return its rows. Altitude and verdicts come once, from the reader holding every row.

Done when every search match is a row, every guidance file is read or named unread, and each repo has its count from `git grep -i -o -w -E '<words>' <ref> | wc -l`.

## Altitude

For each group, before any row in it is judged, ask where it belongs: would this read the same next door, in the next file, repo or pod? A statement that would belongs to the layer enclosing both. It rises to a layer when it holds for every repo beneath that layer, and stays with its repos when it holds for only some, because a line placed higher is read by every session beneath it. A tool, hook, setting or default outranks a line: it loads nothing and can act only where its condition holds, so it may rise where a line may not. The evidence is the list of repos where the statement holds and where it does not.

Done when each group names its home, its evidence, and whether the home already holds it.

## Verdicts

Each row gets one of three.

- **leave alone**: it is the group's home. Or it is its file's own, false or different next door, in the agreed words. Or it states nothing of the concern: code doing the work, an identifier, a quotation, a dated record, another sense of the word, an app's own name.
- **reword**: it carries its file's own fact in other words than the agreed ones, wrapped around a copy, or claimed for more repos than it holds in. The own fact stays, in the agreed words; name what goes.
- **delete**, on one named ground. *Unneeded*: nobody acts on it, or what it guarded is gone; name the reader you looked for. *Held*: its home already states or does it. *Risen*: its home is a layer up and lacks it, so one placement there frees every copy below.

Where only the user can settle a row (copies that disagree, a copy kept on purpose, a placement at global), give the verdict you would and their question beside it.

Done when every row has one verdict and every delete its ground.

## Return

The ledger, and stop: the user's questions first; each group with its home and evidence; each placement with its layer and the copies it frees; every row with its verdict; the count per repo.

## On the user's go

For each delete held or risen, in this order: place the line or the tool change at its home where the home lacks it; show reach; then delete the copies. Reach is shown per repo that held a copy, by naming the file, tool or hook output a fresh session there receives the statement through; a start hook's output over 10,000 characters arrives as a file path and its first 2,000. Where reach is not shown, the copy stays and the ledger says so. Rewords and unneeded deletes follow. A sub-agent working one repo deletes and rewords there, and returns what it would add as a proposed placement. What the audit learned goes in the commit messages; the placements are the only sentences it adds.

Done when the inventory, run again, returns only leave-alone rows, with the count per repo before and after.

## Scope `diff`

The rows are the statements the diff adds in guidance, settings, ignore files, hooks and checks; the concern is whatever they state. A line that rewords or corrects the line it replaces, saying the same or less, is no addition. Judge each addition as above against the layers as they stand, or as they stood when a past diff was made. The diff fails when an addition is held by a higher layer, alone or inside a reword, or requires repos to hold a statement; it fails too when it removes a copy whose statement then arrives from nowhere. Everything else passes and is returned as notes: what should rise, what is unneeded, what its own layer already holds, the copies below that it now contradicts, and the copies still standing in the files it touched. Return pass or fail, each finding with its line, ground and home, and the notes.

## Scope `survey`

Return candidates for an audit, most scattered first, each with its repos, its hits and one example line. Two probes: waves, one word in the commit subjects of four or more repos within two days, over the last sixty; and shared runs, the same twelve words in a row in the guidance of two or more repos, vendored skill bodies aside. Read each candidate to say whether it spread or consolidated.
