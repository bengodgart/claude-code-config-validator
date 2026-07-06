# Claude Code Config Validator

A free tool that checks a Claude Code settings.json hooks block, or an agent/SKILL.md YAML frontmatter block, against the documented schema and flags the specific failure modes reported in real Claude Code GitHub issues. Everything runs in your browser. No accounts, no backend, nothing you paste is uploaded.

## Demo

1. Open `index.html` (or the live link, once published).
2. On the **Hooks validator** tab, click **Load broken example**. This loads a hooks block built on issue #31187's exact contradictory-matcher case, plus a missing `type` field, a typo'd event name, and a string `timeout`.
3. See the result: a red "schema errors found" status, then a list of every finding with its path and a link to the GitHub issue it maps to.
4. Type `Bash` into the "Which hooks fire for tool X?" box to see the matcher-group preview.
5. Switch to the **Frontmatter validator** tab, click **Load broken example**. It loads an agent frontmatter block that is missing `name`, the exact case reported in issue #6377, along with a wrong-case `model` value and an unrecognized field.
6. See the checklist, then the auto-generated corrected frontmatter block underneath.

Real output from `node test.js`:

```
PASS: happy path: the valid hooks example produces zero errors
PASS: both #31187 failure modes are flagged: the flat missing-hooks-array shape and the object matcher, got 2
PASS: the missing required "name" field is caught and cites issue #6377
PASS: the invalid skill name slug ("Run Tests!") is caught and cites issue #20931
PASS: the unrecognized "temperature" field gets a soft warning citing issue #25380
PASS: round-trip: a generated hooks stub validates with zero errors, [...]
PASS: round-trip: a generated agent frontmatter stub validates with zero errors, []

50 passed, 0 failed
```

(The full run has 50 assertions; this is a representative slice. Run `node test.js` yourself to see all of them.)

## Quickstart

```bash
open index.html          # or: python -m http.server, then visit localhost
node test.js              # runs the test suite
```

## Why this exists

Claude Code config errors are a documented, recurring pain, and the error messages themselves are sometimes contradictory. Five open GitHub issues describe it directly: a hooks validation error whose own example contradicts its own rule (#31187), hooks that silently fail to load despite valid JSON (#11544), a "missing name field" error on frontmatter that looks correctly formatted (#6377), custom agents that never get discovered as Task subagent types (#20931), and a SKILL.md validator that rejected documented extended fields it did not yet recognize (#25380).

The fix people currently reach for is a blog post or a copy-paste hook collection. This tool instead lets you paste your actual config and see the exact rule it breaks, with a link to the issue that documents it, plus a corrected block or a stub generator so you have something valid to start from.

## What it checks / how it works

### Hooks (settings.json)

Paste a full `settings.json` or just the value of its top-level `"hooks"` key; the tool detects which one you pasted.

- **Event names** are checked against the full documented list (29 events, including `PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `SessionStart`, `PreCompact`, and others). An unrecognized name is usually a typo, since event names are case-sensitive.
- **Matcher shape**: each matcher group needs a nested `"hooks"` array. A flat shape with `command` sitting directly on the matcher group, with no nested array, is caught and cited as issue #31187, step one of its repro. A `matcher` given as an object instead of a string is caught and cited as the same issue's contradiction: the validator's own error message once showed an object-shaped example that did not match the real schema, which requires a plain string such as `"Edit|Write"`.
- **Matcher-less entries on Stop or Notification** are valid per the documented schema (an omitted matcher defaults to match-all), but this exact shape is reported as silently failing to load in some Claude Code versions (issue #11544). The tool flags it as an advisory, not an error, since it is schema-valid.
- **Hook handler shape**: every handler needs a `type` (`command`, `http`, `mcp_tool`, `prompt`, or `agent`) and the fields that type requires (`command` for `"command"`, `url` for `"http"`, `server`/`tool` for `"mcp_tool"`, `prompt` for `"prompt"`/`"agent"`).
- **`timeout`** must be a number of seconds. A quoted string like `"30"` is flagged, since it is not treated as a number.
- **Nested-field typos**: `matcher` placed on the handler instead of the group one level up, `Command`/`Type` instead of the lowercase field names, `timeoutMs`/`timeout_ms` instead of `timeout` (which is always seconds, never milliseconds).
- **Which hooks fire for tool X**: an optional preview for the events that filter on tool name (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`), following the documented matcher evaluation rules: `"*"`/empty/omitted matches everything, a value made only of letters, digits, `_`, `-`, spaces, `,`, and `|` is one or more exact names, and anything else is evaluated as an unanchored regular expression.

### Agent / SKILL.md frontmatter

The frontmatter parser is hand-written and covers the subset of YAML that Claude Code frontmatter actually uses, not the full YAML specification:

- `key: value` scalars, including values that themselves contain a colon (only the first colon on the line splits key from value).
- Single- and double-quoted string values.
- Booleans (`true`/`false`) and plain numbers.
- Inline lists, `tools: [Read, Write]`.
- Block lists, a `key:` line followed by `- item` lines.

It does **not** support nested maps, multiline block scalars (`|` or `>`), YAML anchors, or any other general-YAML feature. A line that is not one of the forms above is skipped with a warning rather than crashing the parser.

Validation rules, selectable per file type since the two dialects differ slightly:

- **Agent mode** (`.claude/agents/*.md`): `name` and `description` are required. A missing `name` on a file that otherwise looks correctly formatted is the exact bug reported in issue #6377.
- **Skill mode** (`SKILL.md`): `name` is optional (it defaults to the directory name); `description` is recommended, flagged as a warning rather than an error when absent.
- **`name` slug rules** (both modes): lowercase letters, digits, and hyphens only, and at most 64 characters for skills. A malformed name is a common reason custom agents fail to be discovered as Task subagent types, per issue #20931.
- **`model`**: checked against `opus`, `sonnet`, `haiku`, `inherit`, `fable`, or a full model id such as `claude-opus-4-8`. Values are case-sensitive.
- **`tools` / `allowed-tools`**: should be a comma-separated string or a YAML list.
- **Skill-only fields**: `disable-model-invocation` and `user-invocable` must be actual booleans, not the strings `"yes"`/`"no"`; `context` only accepts `"fork"`.
- **Unrecognized fields** get a soft warning, not a hard error, and cite issue #25380: Claude Code's own SKILL.md validator has shipped a bug that rejected valid, documented extended fields it did not yet recognize. This tool would rather under-flag than repeat that mistake.
- A **corrected frontmatter block** is generated from whatever parsed: mechanical fixes only (slugify a malformed name, fix model casing, coerce boolean-like strings). It never invents description text; a missing required field becomes a clearly bracketed placeholder such as `<Describe when Claude should delegate to this subagent. Required.>` for you to fill in.

### Generate a stub (both tabs)

Each tab has a reverse mode: fill in a few fields (event, matcher, handler type for hooks; name, description, tools, model for frontmatter) and get a schema-valid block back, so you have something that passes to start editing from instead of guessing at the shape.

## Tech notes

Single page, no backend, no build step, no dependencies. Three files carry all the logic and the page: `index.html`, `core.js`, `test.js`. `core.js` holds every pure function; it is loaded as a plain script in the browser and required directly by `test.js` in Node, so the same code that renders the page is the code the tests check.

Live version: `https://bengodgart.github.io/claude-code-config-validator/`

## Privacy

Everything runs in your browser. Nothing you paste is uploaded, stored, or sent anywhere; there is no server for it to go to.

## License

MIT, see [LICENSE](LICENSE).
