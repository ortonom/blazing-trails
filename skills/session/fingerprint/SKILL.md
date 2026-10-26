---
name: fingerprint
description: Name the established concept behind a described but unnamed idea. Use when the user has the gist of a thing, problem or process but not its standard name, or before Claude coins a term that may already exist.
---

# Fingerprint

## 1. Capture the gist

Use the text after `/fingerprint` or `/ortonom:fingerprint`; with none, read back up to 10 turns until the problem is clear, else ask for the missing detail.

Write one plain line in the user's words, then 4–6 observable features: function, audience, failure, goal or measure. Then define what it does in one line, filling the blank: `a [thing] that [does what], for [whom]`.

Done when: the gist, features and definition are written before searching.

## 2. Search for names

Run one search per role below, all three in one message, each built from the gist and features alone, with `WebSearch`, or with the search a `Search:` line at the end of this skill names; a query whose search fails or hangs runs again with `WebSearch`. Read each source past its title for usage and meaning.

| Role | Question | Query wording |
|---|---|---|
| Problem | Do others have this problem, and what do they call it? | Plain problem + features |
| Name | What is this called? What is the goal, and does it have a name? | "typical industry terms used to describe [the step 1 definition]" |
| Practice | What is this process, and is it standard practice? | "practice / method / metric for…" + process and goal |

Plain-problem wording returns how-to articles; only Name and Practice wording return names. Keep the three queries distinct.

Done when: all three searches ran; each candidate has source usage and a feature fit, or is marked unsupported.

## 3. Ladder if needed

When no step 2 name is sourced and fits the gist and features, search up toward the goal, asking "why?", or across toward current alternatives, asking "what now?". Use name-seeking wording. Run at most 3 additional searches.

Done when: a sourced name explains the gist and features, or the extra-search budget is spent.

## 4. Check against the user's setup

When the gist concerns the user's own work, read the rules, repos or tools it touches (`~/.claude/CLAUDE.md`, `~/.claude/rules`, the repo's `CLAUDE.md` and `.claude/rules`, the app named) and set the found terms against them: what they already do under another name, and what the field covers that they lack.

Done when: each main term is marked already-here, partly-here or new, or the gist is outside their setup.

## 5. Return the words

Return in this order, in about 300 words, under these headings, exactly as written:

- **Gist**: the captured line, with its features.
- **Main terms**: 2–3 when supported, each with meaning and a linked source that uses it.
- **Nearby terms**: relevant alternatives and their differences.
- **Family**: the field's broader category.
- **Where ours differs**: features the terms leave uncovered, and the step 4 marks.
- **The line to use**: wording for a skill, prompt or search.
- **Next search**: one query using the discovered vocabulary.
- **Do now**: one action the user can take today with the name in hand — a command, an edit, a message.

Use "no name found" wherever evidence is insufficient; label any coined term as coined. Give a decision verdict only when requested.

Done when: every entry is filled or marked "no name found" and **Do now** names one concrete action.
