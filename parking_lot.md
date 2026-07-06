# Parking lot: claude-code-config-validator

Ideas that came up during the build but are out of v1 scope. Not started.

- **MCP server.json validation tab.** A third tab validating MCP server config JSON, tying it to the round-1 MCP linter and the wider MCP-server-registry audience.
- **"Config doctor" writeup.** A free companion post mapping each cited GitHub issue to its fix in this tool, as its own piece of writing rather than inside this app.
- **Full matcher-charset enforcement.** The narrower exact-match character set that `FileChanged` and `StopFailure` use (letters, digits, `_`, `|` only, no hyphen/space/comma) is documented in the README but not separately enforced in `matchesMatcher`; the general charset is used everywhere for simplicity.
- **A shareable permalink** encoding the pasted config in the URL query string, still client-side only.
- **Broader event-specific matcher docs in the UI**, such as which JSON input field each event's matcher actually filters on, beyond the five tool-matching events already covered by the preview.

None of these are v1. If pulled forward later, treat each as its own small addition, not a rewrite.
