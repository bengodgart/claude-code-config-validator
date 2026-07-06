# Post 1: The selection

**Cadence:** at publish

I went looking for why my Claude Code hooks kept silently not firing, and found five separate open GitHub issues about the exact same class of problem.

One of them is almost funny: a hooks validation error tells you your matcher is the wrong shape, then shows you a corrected example that is a different wrong shape than what the schema actually wants. Another is a "missing name field" error on a frontmatter file that looks completely correctly formatted. Another is custom agents that just never get discovered, no error at all.

The fix people reach for right now is a blog post explaining the gotcha, or a copy-paste collection of known-good hook snippets. Nobody had built something you could paste your actual config into and get the specific rule it breaks.

So I built that. Paste a hooks block or an agent/SKILL.md frontmatter block, and it checks the shape against the documented schema, flags the exact failure modes from those five issues with a link to each one, and generates a corrected block or a fresh stub.

It lives entirely inside the Claude Code ecosystem, which is where I already post weekly.

#ClaudeCode #DevTools #AI