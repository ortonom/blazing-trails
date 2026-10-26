// A focus file with a plan file written, one read and one named in a command, each in its own place: focus-signal.test.tsx
// expects publish() to write it, and statusline.test.sh draws it from the line after `export default`, which is JSON.
export default
{
  "v": 1,
  "health": 9,
  "level": "goals",
  "plan": "",
  "rows": [
    [
      { "text": "HP", "color": "ansi256(3)", "bold": true },
      { "text": " " },
      { "text": "■■■■■■■■■■■■■■■■■■", "ascii": "##################", "color": "ansi256(11)" },
      { "text": "□□", "ascii": "--", "dim": true },
      { "text": " " },
      { "text": "9", "color": "ansi256(11)" },
      { "text": " · ", "ascii": " - ", "dim": true },
      { "text": "⬈ GOALS", "ascii": "GOALS", "color": "ansi256(6)" }
    ]
  ],
  "places": [
    { "path": "/w/docs/plans/a.md", "label": "w docs/plans/", "mark": "w" },
    { "path": "/home/w/.claude/plans/calm.md", "label": "plan", "mark": "r" },
    { "path": "/w/.sdlc/spec.md", "label": "w .sdlc/", "mark": "b" }
  ]
}
