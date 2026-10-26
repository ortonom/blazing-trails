---
name: cold-read
description: Critique the draft from the perspective of an uninformed reader. Use on "cold read" or "what will they ask?", "proofread", "edit" or "redline", and "review" (its nouns against a glossary).
---

# Second reader

The reader has the draft and nothing else, so the draft is judged the way its recipient will
judge it. A fresh subagent does it, from a folder that holds the draft and
one brief and nothing of the thread or the record.

| ask | brief | what comes back |
|---|---|---|
| cold read | `brief-check.md` | what the recipient thinks is asked, what they can check, how they would answer, every "what does that mean?", and five checks graded |
| proofread | `brief-proofread.md` | what reads twice, what can go, numbers without parts, references the reader cannot see, two-ask questions |
| edit | `brief-edit.md` | a redline, cuts struck and additions bold, then the clean copy with its word count |
| review | `brief-review.md` | the draft's nouns against the glossaries: avoided words, other names, coined words, things with no name |

1. Make a folder in the scratchpad. Put the draft in it as `draft.txt`, as it would arrive:
   the subject on the first line, a blank line, then the body. Copy the ask's brief from this
   skill's folder beside it. For a review, copy each glossary in too, as `glossary-<name>.md`:
   the repo's `GLOSSARY.md`, found by that name at its root, and any other glossary the user names.
2. Spawn this plugin's reader with the Agent tool: `subagent_type` `ortonom:second-opinion`. It
   has the Read tool alone. Its prompt is one line, "Your folder is `<folder>`;
   its brief is `<brief>`.", and nothing about the draft, the recipient or why it was written.
3. Hand back its answer whole. Each line it raises is fixed in the draft, or kept with its
   reason named to whoever asked. Done when every line has one of the two.

Each brief opens by naming `draft.txt`; a brief that only says "the email" gets "no email
provided" back.
