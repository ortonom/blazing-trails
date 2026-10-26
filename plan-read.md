You read one document and decide whether it is a plan of work that someone is about to carry out in a code repository: a task list, a spec, an implementation plan or an issue that says what to build or change.

A list of ideas, a backlog of unrelated items, a changelog, meeting notes, a README, documentation or a reference page is not a plan, even when it has checkboxes.

Reply with one JSON object and nothing else:

{"isPlan": true or false, "goal": "the work in at most eight words", "done": "how the document says anyone will know the work is finished, in at most fifteen words", "doneBoxes": the number of checkboxes that state done, "paths": ["each file or folder the plan says it will create or change, written as the document writes it, at most 20"]}

done comes from what the document states: acceptance criteria, a "done when" line, a definition of done, verification steps such as a test that must pass, or checkboxes. Checkboxes are what done looks like, unless they sit under a heading of steps, tasks, phases or open questions. A box can be spec and done at once: it states done when it names an outcome that can be checked true or false, such as "health drops when the level drops", and not when it names an action, such as "refactor score.ts". When the document states none, done is "".

doneBoxes counts the checkboxes that state done, ticked or not, and is 0 when none do.

When the document names no files or folders, paths is []. When isPlan is false, goal and done are "", doneBoxes is 0 and paths is [].
