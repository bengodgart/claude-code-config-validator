---
type: Playbook
title: Run claude-code-config-validator locally
description: 'How to open claude-code-config-validator and run its tests on a dev machine.'
generated:
  by: claude-opus-5
  at: '2026-07-29T04:00:00+00:00'
status: stable
---

# Steps

1. Clone the repo:
   `git clone https://github.com/bengodgart/claude-code-config-validator.git`
2. Open `index.html` in a browser, or serve the folder with `python -m http.server` and
   visit localhost.
3. On either tab, click **Load broken example** to see the validator fire on a real reported
   failure case.

## Available scripts

* `node test.js` runs the test suite, 50 assertions.

There is no build step and no dependencies.

## Common failures

* An unrecognised field produces a soft warning, not an error. That is deliberate: Claude
  Code's own SKILL.md validator once rejected valid documented fields, and this tool would
  rather under-flag than repeat that.
* A matcher-less entry on `Stop` or `Notification` is schema-valid and is reported as an
  advisory only, because it is documented as valid but reported as silently failing to load
  in some versions.
* `model` values and event names are case-sensitive. A wrong-case value is a real finding,
  not a false positive.

## Deploying

It is a static page, so GitHub Pages hosts it for $0.
