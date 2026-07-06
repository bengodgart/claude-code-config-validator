# Post 3: Where this could go

**Cadence:** about a week after post 2

This tool checks two things on purpose: settings.json hooks, and agent/SKILL.md frontmatter. Not MCP server configs, not CLAUDE.md prose, not a general YAML linter. Each of those is a different shape of problem, and I would rather ship two things done honestly than one thing done vaguely.

The most obvious next step is a third tab for MCP server.json, since malformed MCP config is its own recurring source of quiet failures, and it would connect to a separate MCP linter I already built.

I would also like a short writeup mapping each GitHub issue this tool cites to its actual fix, as its own piece of writing rather than something baked into the app itself. That is more useful to read on its own than buried in a tooltip.

Neither of those is built. If you have hit a Claude Code config error this tool does not catch, I would genuinely rather hear the specific shape of it than guess at what to add next. The tool is live and open source if you want to see how it works.

github.com/bengodgart/claude-code-config-validator

#ClaudeCode #DevTools #AI