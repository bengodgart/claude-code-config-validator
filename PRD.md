# PRD, claude-code-config-validator

**One-liner:** A free single-page validator and generator for Claude Code config files. Paste a settings.json hooks block or an agent/SKILL.md frontmatter block and get a green/red schema check with the exact known failure modes flagged and a corrected block, all in your browser.

**Usefulness:** Claude Code config errors are a documented, recurring pain, and the error messages themselves are often contradictory or wrong. Five live GitHub issues describe it directly: "Hooks validation error message contradicts its own example" (#31187), "Hooks not loading from settings.json despite valid configuration" (#11544), "Frontmatter Parsing Error: Missing 'name' Field Despite Valid YAML" (#6377), "Custom Agents in ~/.claude/agents/ Not Loaded as Task Subagent Types" (#20931), and "SKILL.md validator only recognizes standard fields, rejects Claude Code extended frontmatter" (#25380). No free interactive builder/validator exists for this, only copy-paste hook collections and blog guides. Useful to any Claude Code user on day one: paste, see the exact error the docs will not give you.

## v1 scope (capped, as built)
1. Two tabs: (a) settings.json hooks validator/builder, (b) agent/SKILL.md frontmatter validator/generator, with a file-type toggle (agent vs. SKILL.md) since the two dialects require `name` differently.
2. Hooks: parses the JSON, validates event names against the full documented list, matcher shape, hook-handler `type` and its required fields, and that `timeout` is a number. Flags the exact failure modes: the flat pre-nested-hooks-array shape and the object-shaped matcher (both issue #31187), a matcher-less Stop/Notification entry (issue #11544 advisory), missing `type`, and nested-field typos. Includes an optional "which hooks fire for tool X" preview for the tool-matching events.
3. Frontmatter: a hand-written parser for the subset of YAML Claude Code frontmatter actually uses (key: value scalars, quoted strings, inline and block lists, not general YAML). Validates required `name`/`description` (agent mode) or optional `name`/recommended `description` (skill mode), the `tools`/`allowed-tools` field shape, the `model` enum, name-slug rules (citing issue #20931), and flags unrecognized fields as a soft warning citing issue #25380 rather than a hard error. Shows a green/red checklist and a mechanically corrected frontmatter block.
4. A reverse "generate a valid stub" mode for each tab.
5. Built-in "Load broken example" and "Load valid example" fixtures for each tab; the broken hooks fixture is built on issue #31187's contradictory-matcher case.

## Non-goals (not v1)
- Running Claude Code itself, or a VS Code/browser extension.
- Accounts, saved configs, any model call.
- Validating CLAUDE.md prose (that is a separate, already-built tool).
- A general-purpose YAML parser: the frontmatter parser covers only the documented subset Claude Code frontmatter uses.
- Full coverage of every hook event's matcher-charset nuance (for example the narrower exact-match character set on `FileChanged`/`StopFailure`); documented in prose, not separately enforced in the validator.

## Demo path (stranger sees value in under 2 minutes)
Open index.html, click Load broken example on the Hooks tab, see the #31187 contradiction and three other failure modes flagged at once with issue links. Switch to the Frontmatter tab, click Load broken example, see the missing `name` field (#6377) flagged and a corrected block generated underneath.

## Done when
- The page turns a broken hooks block into a flagged, corrected result in under two minutes (proven in test.js and in the UI demo).
- The known-bad sample built on issue #31187 is caught (both its failure modes).
- README links each validation rule to the source GitHub issue; copy passes the no-em-dash sweep.
- Posted links resolve; nothing requires sign-up; the Network tab shows zero requests.
