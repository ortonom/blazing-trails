// The focus file both suites test against: focus-signal.test.tsx expects publish() to write it, and statusline.test.sh draws it
// from the line after `export default`, which is JSON.
export default
{
  "v": 1,
  "health": 5,
  "level": "regroup",
  "plan": "p.md",
  "rows": [
    [
      { "text": "HP", "color": "ansi256(3)", "bold": true },
      { "text": " " },
      { "text": "■■■■■■■■■■", "ascii": "##########", "color": "ansi256(3)" },
      { "text": "□□□□□□□□□□", "ascii": "----------", "dim": true },
      { "text": " " },
      { "text": "5 !", "color": "ansi256(3)" },
      { "text": " · ", "ascii": " - ", "dim": true },
      { "text": "↺ REGROUP", "ascii": "REGROUP", "color": "ansi256(1)" }
    ]
  ],
  "places": [
    { "path": "/w/docs/plans/p.md", "label": "w docs/plans/", "mark": "r" }
  ]
}
