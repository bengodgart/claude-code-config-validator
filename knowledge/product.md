---
type: Product
title: claude-code-config-validator
description: 'Check a Claude Code settings.json hooks block, or an agent and SKILL.md YAML frontmatter block, against the documented schema, and see the specific failure modes reported in real Claude Code GitHub issues. Runs entirely in the browser.'
domain: Developer Tools
users: 'Claude Code users writing hooks or custom agent and skill frontmatter who hit a config error the message does not explain.'
lifecycle: shipped
live_url: https://bengodgart.github.io/claude-code-config-validator/
pricing: 'Free. MIT licensed, no accounts.'
generated:
  by: claude-opus-5
  at: '2026-07-29T04:24:12+00:00'
status: stable
resource: https://github.com/bengodgart/claude-code-config-validator.git
---

# claude-code-config-validator

Check a Claude Code `settings.json` hooks block, or an agent and SKILL.md YAML frontmatter
block, against the documented schema, and see the specific failure modes reported in real
Claude Code GitHub issues. Runs entirely in the browser.

## Who it is for

Claude Code users writing hooks or custom agent and skill frontmatter who hit a config error
the message does not explain.

## What problem it solves

Claude Code config errors are a documented, recurring pain, and the error messages
themselves are sometimes contradictory. Five open GitHub issues describe it directly: a
hooks validation error whose own example contradicts its own rule (#31187), hooks that
silently fail to load despite valid JSON (#11544), a missing name field error on frontmatter
that looks correctly formatted (#6377), custom agents never discovered as Task subagent
types (#20931), and a SKILL.md validator that rejected documented extended fields it did not
recognise (#25380).

The usual fix is a blog post or a copy-paste hook collection. This lets you paste your actual
config and see the exact rule it breaks with a link to the issue that documents it, plus a
corrected block or a stub generator so you have something valid to start from.

Two deliberate design calls: schema-valid shapes that are only reported as flaky get flagged
as advisories rather than errors, and unrecognised fields get a soft warning rather than a
hard rejection, so the tool does not repeat the #25380 mistake it was built to catch.

## Current state

Shipped and public on GitHub Pages. The frontmatter parser covers the subset of YAML that
Claude Code frontmatter actually uses, not the full specification: it does not support nested
maps, multiline block scalars, or YAML anchors, and a line it does not recognise is skipped
with a warning rather than crashing.
