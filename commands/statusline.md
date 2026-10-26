---
description: Statusline — point your statusLine setting at Blazing Trails' status line, the copy the plugin keeps current; typed only.
disable-model-invocation: true
---

In the user settings file, `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`, set `statusLine` to `{"type": "command", "command": "${CLAUDE_PLUGIN_DATA}/statusline.sh", "refreshInterval": 5}`, written exactly so, keeping every other key as it is.

- Show the `statusLine` value before and after, the before as `none` when it was unset.
- Change nothing else in the file, and write no other file.

End with: the status line draws Blazing Trails' rows from its next refresh, and an update to the plugin reaches it at the next session start.
