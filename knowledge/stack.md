---
type: Tech Stack
title: claude-code-config-validator stack
description: 'Frameworks, storage and services claude-code-config-validator runs on.'
runtime: Browser
framework: 'None. Plain HTML, CSS and JavaScript.'
build: 'None. No build step and no dependencies.'
storage: 'None. Nothing you paste is uploaded, stored or sent anywhere.'
hosting: GitHub Pages
tests: 'node test.js, 50 assertions'
generated:
  by: claude-opus-5
  at: '2026-07-29T04:00:00+00:00'
status: stable
---

# Stack

* **Runtime**: the browser. There is no server for pasted config to go to.
* **Framework**: none. Plain HTML, CSS and JavaScript.
* **Build**: none. Single page, no build step, no dependencies.
* **Files that carry the logic**: three files carry everything, `index.html` for the page,
  `core.js` for every pure function, `test.js` for the suite.
* **YAML parsing**: hand-written, covering only the frontmatter subset Claude Code uses. No
  YAML library.
* **Hosting**: GitHub Pages.
* **Tests**: `node test.js`, 50 assertions including round trips that confirm a generated
  stub validates clean.

## Notes

`core.js` is loaded as a plain script in the browser and required directly by `test.js` in
Node, so the code that renders the page is the code the tests check.
