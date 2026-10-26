---
description: Native Q&A — put the open decisions in a conversation or plan to the user as AskUserQuestion dialogs, costliest-to-leave-open first, and end on the decided task list; typed only.
argument-hint: "[plan file | path | issue | mail | blank for this conversation]"
disable-model-invocation: true
---

The user has decisions waiting and wants them in the native Q&A dialog, the `AskUserQuestion`
tool. Gather them, check them, ask them, and end on the list of what was decided. The run
carries out none of the decisions; it ends by asking whether to proceed.

Source: $ARGUMENTS. Blank means this conversation, and any plan file it names.

## 1. Gather

List every open decision in the source: a question put to the user and not answered, a choice
a plan leaves open, an option offered and never taken up. One line each, in the source's words.

Done when every open question in the source is on the list.

## 2. Check each against the current state

Read what each decision is about as it stands now: the file, the branch, the record, a later
turn. A decision the current state already settles is closed; note what closed it.

Done when each line is marked open or closed, and each closed one names its evidence.

## 3. Shape

Each open decision becomes one question, or goes on the set-aside list.

- **Set aside** a decision that picking an option cannot honestly answer: one that needs a
  diagnosis, a reading file by file, or a design written freely. Note why.
- **question**: stands alone for a reader who has not seen the source. Say what the thing is
  and what is being decided, and end on `?`.
- **header**: the decision's noun, 12 characters or fewer.
- **options**: 2 to 4 real alternatives. Each label is 1 to 5 words; each description is what
  follows if it is picked. The recommended option comes first, its label ending in
  ` (Recommended)`. The tool adds its own free-text choice, so the list holds only alternatives.
- **multiSelect**: set it for a list the user picks several from.

Done when every open decision is a question or a set-aside line with its reason.

## 4. Ask

Order the questions by what staying open costs: first what changes behaviour unasked or
overrides something silently, cosmetic items last. Ask at most 4 per `AskUserQuestion` call,
one batch after another, each sent once the last is answered.

A free-text answer is an answer: act on what it says. When one is garbled or reads two ways,
put a short clarifying question at the head of the next batch.

Done when every question has an answer the user gave, clarified where it needed to be.

## 5. Set aside

After the last batch, take the set-aside items in the reply, one at a time: what each needs
before it can be decided, and what you would look at first.

## 6. Close

Write the answers into the plan file when there is one. Reply with the task list, then ask
whether to proceed.

```
Decided
- [ ] Rename the flag to --dry-run: update the CLI and its README
- [ ] Keep the old config key as an alias for one release

Set aside
- Slow startup: needs a profile before there is a choice to make

Closed
- Default port: already 3000 on main
```

Done when every gathered decision appears once: decided, set aside or closed.
