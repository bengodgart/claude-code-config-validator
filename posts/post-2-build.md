# Post 2: The build

**Cadence:** 2-3 days after post 1

The part of this build I did not expect: the frontmatter parser.

Claude Code frontmatter is YAML, but only a small slice of it. Reaching for a full YAML library felt like the wrong tool for a page that promises nothing leaves your browser and has zero dependencies. So I hand-wrote a parser for exactly the subset that shows up in real agent and skill files: key-value lines, quoted strings, inline lists like `[Read, Write]`, and block lists with dashes. It is honest about what it does not do. No nested maps, no multiline blocks, no anchors. If you need real YAML, this is not your parser.

That constraint turned out to be the right one. One of the five bugs I was building against is a "missing name field" error on frontmatter that looks fine to a human. Once I had my own line-by-line parser, I could reproduce exactly the kind of formatting that trips a naive checker, and flag it directly instead of guessing.

The other interesting call: when the tool finds a field it does not recognize, it warns instead of failing. Claude Code's own SKILL.md validator has shipped that exact bug, rejecting real documented fields it did not know about yet. I would rather under-flag than repeat it.

Try it in under two minutes: load the broken example on either tab, see it flagged with links to the actual GitHub issues, then look at the corrected block underneath.

Link: github.com/bengodgart/claude-code-config-validator

#ClaudeCode #BuildInPublic #AI