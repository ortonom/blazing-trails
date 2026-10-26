---
name: silent-failure
description: Hunt for controls that fail without telling anyone. Use on "why is this so slow", "something is blocking me", "audit my hooks", "what's degrading Claude here", after a control was found wrong long after the fact, or before trusting any gate that sits between an actor and an effect. It audits guards, hooks, filters, config layers and CI checks whose errors surface as an agent being slow or stupid rather than as an error, and never fixes.
---

# Silent failure

A control that fails **loudly** gets fixed by whoever hits it. A control that
fails **silently** converts its error rate into capability loss: the agent
adapts, routes around, narrows what it reaches for, and the cost is paid
forever by everyone downstream.

This skill finds the second kind.

## The one diagnostic question

> **When this thing is wrong, who finds out?**

If the answer is "nobody — the actor just adapts", that is the class. Everything
below is machinery for answering that question with evidence instead of a guess.

## Iron rules

1. **Audit only. Fix nothing.** Not one line, not "while I was there". A fix
   during an audit is how a two-minute answer becomes an afternoon. Findings
   are the deliverable.
2. **No concrete input, no claim.** Every finding ships a real string a human
   can paste to reproduce it. A finding with no such string is deleted, not
   softened to "may".
3. **Rank by silence, not severity.** A loud severe bug is already someone's
   problem. A quiet moderate one is nobody's.
4. **Read-only.** Probe controls in isolation. Never trigger the effect a
   control guards in order to test the control.

---

## Phase 1 — Inventory the interposers

An interposer is anything sitting between an actor and an effect that
**inspects rather than performs**. It is the only place this bug class lives.

Sweep for all six, in whatever form the stack uses:

```
1. COMMAND GATES      hooks, wrappers, allow/deny lists, sudo policy,
                      pre-commit, pre-push, sandbox policy
2. TEXT FILTERS       secret scanners, redactors, linters, content checks,
                      output sanitizers, PII sweeps
3. CONFIG PRECEDENCE  layered settings, env overrides, profile merges,
                      local-beats-shared files
4. PATH MATCHERS      ignore files, glob rules, route tables, ACL paths,
                      workspace/monorepo scoping
5. PROTOCOL MIDDLEWARE proxies, serializers, auth checks, rate limiters,
                      request validators
6. GATES WITH ABSENT INPUT  CI checks, required statuses, health checks —
                      anything whose input may not exist where it runs
```

For each, record: what it guards, what it reads, where it runs, and what a
denial looks like to the caller.

## Phase 1b — Search each interposer's known quiet failures

Before classifying, look up what each interposer is already known to swallow: its
issue tracker, its docs' limits, the write-ups of people it failed. One question per
interposer, all of them at once.

Search with `WebSearch`, one call per interposer in parallel, each asking
`<tool> <version>: known cases where it fails or skips without an error`. Where a
`Search:` line at the end of this skill names another search, use it, and run a query
again with `WebSearch` when that search fails or hangs. Whichever runs, a search result
is a lead to probe in Phase 4, never a finding on its own.

## Phase 2 — Classify against the three archetypes

Every silent-failure bug seen so far is one of these. Name which, per interposer.

### A. Parser differential
The checker and the executor read the same input with different grammars, so
they disagree about what it means. The gap between them is the defect.

Signature: the checker uses regex, split, glob or string-match on a language
that has real syntax — shell, SQL, HTML, YAML, a path, a URL, HTTP framing.

> Regex cannot express context-sensitivity. If the input has quoting, nesting,
> escaping or precedence, a pattern-matcher will always disagree with the real
> parser somewhere. This is structural, not a bug to patch once.

Same root cause as HTTP request smuggling, XML signature wrapping, and the
Android Master Key bug.

### B. Invisible input
The check cannot see, or cannot run on, the thing it guards — so it is
structurally incapable of failing in the environment that matters.

Signature: the input is gitignored, environment-only, machine-local,
production-only, or absent from a fresh clone. The gate is green everywhere it
runs and red only where nothing runs it.

### C. Unannounced precedence
One layer silently overrides another, and nothing reports which won.

Signature: a merge or override with no provenance in its output. Local beats
shared, env beats file, later beats earlier, and the effective value is
printed nowhere.

## Phase 3 — Construct the two failing inputs

For every interposer, produce **both directions**. One is not enough: they have
different causes and different fixes.

| Direction | What it is | Cost |
|---|---|---|
| **Over-match** | Something SAFE that gets caught | Capability loss. The actor adapts and narrows |
| **Under-match** | Something DANGEROUS that passes | The control is decoration |

Give real strings, not descriptions. If you cannot construct one for a
direction, write "none found" for it — that absence says how tight the control
is in that direction.

## Phase 4 — Probe

Exercise the control **in isolation**, never by triggering what it guards.

Most interposers take structured input on stdin or argv and answer with an
exit code. Build the smallest harness that feeds one and reads the answer:

```bash
probe() { <feed the control "$1">; echo "exit $? : $1"; }
probe '<the safe string that should pass>'
probe '<the safe string you predict is wrongly caught>'
probe '<the dangerous string you predict wrongly passes>'
```

Run every constructed input through it. Mark each finding:

- **CONFIRMED** — probed, reproduced, exit code recorded
- **SUSPECTED** — read from the source, not run

Drop anything that survives neither.

For archetype B, the probe is different: the control cannot be made to fail
where it runs, so probe its **input's visibility** instead. Does the input
exist in a fresh clone? In CI? On another machine? A gate whose input is absent
in every environment that runs it is confirmed by that absence alone.

## Phase 5 — Rank and report

Sort by `silence x likelihood`. Silence dominates: a silent moderate finding
outranks a loud severe one, because the loud one already has a reporter.

```
FINDING <n>  <archetype A|B|C>  <CONFIRMED|SUSPECTED>  <SILENT|LOUD>
Where:       <file:line, or the layer>
Shape:       <one sentence>
Over-match:  <a real string, or "none found">
Under-match: <a real string, or "none found">
Who finds out: <the answer to the diagnostic question>
```

Close with the structural read: is this a defect to patch, or a property of the
approach? A regex over a real grammar is the second. Say which, and stop.

## What this skill will not do

- Fix anything. Offer, once, in one line, at the end.
- Trigger a guarded effect to test its guard.
- Report a finding it could not construct an input for.
- Grade a control it has not read.
