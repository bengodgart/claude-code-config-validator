// test.js, smoke test for core.js. Run: node test.js
// No test framework, hand-rolled asserts only. Exits 0 on pass, 1 on any failure.

var core = require('./core.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('PASS: ' + msg);
  } else {
    failed++;
    console.log('FAIL: ' + msg);
  }
}

function findingsWithIssue(findings, issue) {
  return findings.filter(function (f) { return f.issue === issue; });
}

// ---------------------------------------------------------------------------
// 1. Hooks: happy path. A well-formed hooks block produces zero errors.
// ---------------------------------------------------------------------------
var goodHooks = core.validateHooksConfig(core.EXAMPLE_HOOKS_GOOD_TEXT);
assert(goodHooks.ok === true, 'happy path: the valid hooks example produces zero errors');
assert(goodHooks.findings.filter(function (f) { return f.level === 'error'; }).length === 0, 'happy path: zero error-level findings on the valid hooks example');

// The Stop entry with no matcher key is valid, but still carries the #11544
// advisory (a warning, not an error).
var stopAdvisory = findingsWithIssue(goodHooks.findings, '11544');
assert(stopAdvisory.length === 1, 'edge case: the matcher-less Stop entry gets exactly one #11544 advisory, got ' + stopAdvisory.length);
assert(stopAdvisory[0].level === 'warn', 'edge case: the #11544 advisory is a warning, not an error, since the shape is schema-valid');

// ---------------------------------------------------------------------------
// 2. Hooks: the known-bad block (built on issue #31187's contradictory-
//    matcher case) is flagged, and every cited failure mode is present.
// ---------------------------------------------------------------------------
var brokenHooks = core.validateHooksConfig(core.EXAMPLE_HOOKS_BROKEN_TEXT);
assert(brokenHooks.ok === false, 'the known-bad hooks example (issue #31187 case) is flagged as invalid');

var issue31187Findings = findingsWithIssue(brokenHooks.findings, '31187');
assert(issue31187Findings.length >= 2, 'both #31187 failure modes are flagged: the flat missing-hooks-array shape and the object matcher, got ' + issue31187Findings.length);
assert(issue31187Findings.some(function (f) { return f.message.indexOf('no nested "hooks" array') !== -1; }), '#31187: the flat command-on-matcher-group shape (no nested hooks array) is caught');
assert(issue31187Findings.some(function (f) { return f.message.indexOf('must be a string') !== -1; }), '#31187: the object-shaped matcher is caught and reported as needing to be a string');

var missingTypeFindings = brokenHooks.findings.filter(function (f) { return f.message.indexOf('Missing required "type"') !== -1; });
assert(missingTypeFindings.length === 1, 'the hook handler missing its "type" field is caught');

var badEventFindings = brokenHooks.findings.filter(function (f) { return f.message.indexOf('PreToolUser') !== -1; });
assert(badEventFindings.length === 1, 'the typo\'d event name "PreToolUser" is caught as an unrecognized event');

var badTimeoutFindings = brokenHooks.findings.filter(function (f) { return f.path.indexOf('.timeout') !== -1; });
assert(badTimeoutFindings.length === 1, 'a quoted-string timeout ("30") is caught as not being a number');

// ---------------------------------------------------------------------------
// 3. Hooks: round-trip claim. generateHooksStub produces JSON that
//    validateHooksConfig then accepts with zero errors.
// ---------------------------------------------------------------------------
var stub = core.generateHooksStub({ event: 'PreToolUse', matcher: 'Bash', type: 'command', command: 'echo hi', timeout: 15 });
var stubResult = core.validateHooksConfig(stub);
assert(stubResult.ok === true, 'round-trip: a generated hooks stub validates with zero errors, ' + JSON.stringify(stubResult.findings));

var stopStub = core.generateHooksStub({ event: 'Stop', type: 'command', command: 'echo done' });
var stopStubResult = core.validateHooksConfig(stopStub);
assert(stopStubResult.ok === true || stopStubResult.findings.every(function (f) { return f.level !== 'error'; }), 'round-trip: a generated Stop-event stub (no matcher support) validates with zero errors');
assert(JSON.parse(stopStub).hooks.Stop[0].matcher === undefined, 'a generated stub for a matcher-less event omits the matcher key entirely');

// ---------------------------------------------------------------------------
// 4. Hooks: matcher matching and the "which hooks fire for tool X" preview.
// ---------------------------------------------------------------------------
assert(core.matchesMatcher(undefined, 'Bash') === true, 'matchesMatcher: an omitted matcher matches every tool');
assert(core.matchesMatcher('*', 'Bash') === true, 'matchesMatcher: "*" matches every tool');
assert(core.matchesMatcher('Edit|Write', 'Write') === true, 'matchesMatcher: an exact alternation matches one of its names');
assert(core.matchesMatcher('Edit|Write', 'Bash') === false, 'matchesMatcher: an exact alternation does not match a name outside the list');
assert(core.matchesMatcher('^Notebook', 'NotebookEdit') === true, 'matchesMatcher: a regex-shaped matcher is evaluated as a regular expression');

var preview = core.previewToolFire(goodHooks.hooksMap, 'Bash');
var preToolUsePreview = preview.filter(function (p) { return p.event === 'PreToolUse'; });
assert(preToolUsePreview.length === 1 && preToolUsePreview[0].fires === true, 'preview: the Bash matcher fires for tool "Bash" on PreToolUse');
var writePreview = core.previewToolFire(goodHooks.hooksMap, 'Write');
var postToolUsePreview = writePreview.filter(function (p) { return p.event === 'PostToolUse'; });
assert(postToolUsePreview.length === 1 && postToolUsePreview[0].fires === true, 'preview: the Edit|Write matcher fires for tool "Write" on PostToolUse');
var noMatchPreview = core.previewToolFire(goodHooks.hooksMap, 'Grep').filter(function (p) { return p.event === 'PreToolUse'; });
assert(noMatchPreview.length === 1 && noMatchPreview[0].fires === false, 'preview: the Bash matcher does not fire for tool "Grep"');

// ---------------------------------------------------------------------------
// 5. Frontmatter (agent mode): happy path.
// ---------------------------------------------------------------------------
var goodAgent = core.validateFrontmatter(core.EXAMPLE_FRONTMATTER_AGENT_GOOD_TEXT, 'agent');
assert(goodAgent.ok === true, 'happy path: the valid agent frontmatter example produces zero errors');
assert(goodAgent.frontmatter.name === 'code-reviewer', 'the valid agent example parses the name field correctly');
assert(goodAgent.frontmatter.tools === 'Read, Grep, Glob, Bash', 'the valid agent example parses the comma-separated tools field as a plain string');

// ---------------------------------------------------------------------------
// 6. Frontmatter (agent mode): the known-bad block (issue #6377's exact
//    case, missing "name" despite otherwise well-formed YAML) is caught.
// ---------------------------------------------------------------------------
var brokenAgent = core.validateFrontmatter(core.EXAMPLE_FRONTMATTER_AGENT_BROKEN_TEXT, 'agent');
assert(brokenAgent.ok === false, 'the known-bad agent frontmatter example is flagged as invalid');
var missingNameFindings = brokenAgent.findings.filter(function (f) { return f.path === 'name' && f.issue === '6377'; });
assert(missingNameFindings.length === 1, 'the missing required "name" field is caught and cites issue #6377');
var modelCaseFindings = brokenAgent.findings.filter(function (f) { return f.path === 'model'; });
assert(modelCaseFindings.length === 1, 'the wrong-case model value "Sonnet" is caught (model values are case-sensitive)');
var unknownFieldFindings = brokenAgent.findings.filter(function (f) { return f.path === 'temperature' && f.issue === '25380'; });
assert(unknownFieldFindings.length === 1, 'the unrecognized "temperature" field gets a soft warning citing issue #25380');
assert(unknownFieldFindings[0].level === 'warn', 'the unrecognized-field warning is a warning, not a hard error (per the #25380 lesson: do not reject unknown-but-real fields)');

// ---------------------------------------------------------------------------
// 7. Frontmatter round-trip: buildCorrectedFrontmatter on the broken agent
//    example produces a block that itself validates cleanly (aside from the
//    placeholder text a human still has to fill in).
// ---------------------------------------------------------------------------
var corrected = core.buildCorrectedFrontmatter(brokenAgent.frontmatter, 'agent');
var correctedResult = core.validateFrontmatter(corrected, 'agent');
assert(correctedResult.frontmatter.name === 'replace-with-a-name', 'the corrected block fills the missing name with a clearly marked placeholder, not an invented one');
assert(correctedResult.findings.filter(function (f) { return f.path === 'name'; }).length === 0, 'round-trip: the corrected block\'s placeholder name is itself a valid slug');
assert(correctedResult.findings.filter(function (f) { return f.path === 'model'; }).length === 0, 'round-trip: the corrected block fixes the model casing');

var stubFrontmatter = core.generateFrontmatterStub({ mode: 'agent', name: 'safe-researcher', description: 'Research agent with restricted capabilities', tools: 'Read, Grep, Glob', model: 'haiku' });
var stubFrontmatterResult = core.validateFrontmatter(stubFrontmatter, 'agent');
assert(stubFrontmatterResult.ok === true, 'round-trip: a generated agent frontmatter stub validates with zero errors, ' + JSON.stringify(stubFrontmatterResult.findings));

// ---------------------------------------------------------------------------
// 8. Frontmatter (skill mode): happy path, and the known-bad block (invalid
//    name slug, non-boolean disable-model-invocation).
// ---------------------------------------------------------------------------
var goodSkill = core.validateFrontmatter(core.EXAMPLE_FRONTMATTER_SKILL_GOOD_TEXT, 'skill');
assert(goodSkill.ok === true, 'happy path: the valid skill frontmatter example produces zero errors');

var brokenSkill = core.validateFrontmatter(core.EXAMPLE_FRONTMATTER_SKILL_BROKEN_TEXT, 'skill');
assert(brokenSkill.ok === false, 'the known-bad skill frontmatter example is flagged as invalid');
var skillSlugFindings = brokenSkill.findings.filter(function (f) { return f.path === 'name' && f.issue === '20931'; });
assert(skillSlugFindings.length === 1, 'the invalid skill name slug ("Run Tests!") is caught and cites issue #20931');
var skillBoolFindings = brokenSkill.findings.filter(function (f) { return f.path === 'disable-model-invocation'; });
assert(skillBoolFindings.length === 1, 'the non-boolean "disable-model-invocation: yes" is caught');
var skillDescriptionFindings = brokenSkill.findings.filter(function (f) { return f.path === 'description'; });
assert(skillDescriptionFindings.length === 1 && skillDescriptionFindings[0].level === 'warn', 'a missing description on a skill is a warning, not an error (description is recommended, not required, for SKILL.md)');

// ---------------------------------------------------------------------------
// 9. Frontmatter parser: quoted strings and inline lists, the subset this
//    hand-written parser is documented to support (not arbitrary YAML).
// ---------------------------------------------------------------------------
var quotedParse = core.parseFrontmatter('---\nname: "my-agent"\ndescription: \'Handles things: carefully\'\ntools: [Read, Write, Bash]\n---\nBody text.');
assert(quotedParse.frontmatter.name === 'my-agent', 'parser: a double-quoted scalar has its quotes stripped');
assert(quotedParse.frontmatter.description === 'Handles things: carefully', 'parser: a single-quoted value containing a colon is captured whole, not split on the colon');
assert(Array.isArray(quotedParse.frontmatter.tools) && quotedParse.frontmatter.tools.length === 3 && quotedParse.frontmatter.tools[1] === 'Write', 'parser: an inline [a, b, c] list is parsed into an array');
assert(quotedParse.body.trim() === 'Body text.', 'parser: the markdown body after the closing --- is captured separately from the frontmatter');

var blockListParse = core.parseFrontmatter('---\nname: my-agent\ntools:\n  - Read\n  - Write\n---\nBody.');
assert(Array.isArray(blockListParse.frontmatter.tools) && blockListParse.frontmatter.tools.length === 2, 'parser: a block "- item" list under an empty key is parsed into an array');

// Edge case: no closing --- at all is a clear structural error, not a crash.
var unclosedParse = core.parseFrontmatter('---\nname: my-agent\ndescription: no closing marker');
assert(unclosedParse.error !== null && unclosedParse.frontmatter === null, 'edge case: frontmatter with no closing "---" is reported as a structural error');

// Edge case: no opening --- at all.
var noFrontmatterParse = core.parseFrontmatter('Just a plain markdown file with no frontmatter.');
assert(noFrontmatterParse.error !== null, 'edge case: a file with no frontmatter block at all is reported as a structural error');

// ---------------------------------------------------------------------------
// 10. Copy pattern check: no em-dash anywhere in generated messages or
//     fixtures.
// ---------------------------------------------------------------------------
var EM_DASH = String.fromCharCode(8212);
var allMessages = brokenHooks.findings.concat(brokenAgent.findings).concat(brokenSkill.findings)
  .map(function (f) { return f.message; }).join(' ');
assert(allMessages.indexOf(EM_DASH) === -1, 'generated finding messages contain no em-dash');
assert(core.EXAMPLE_HOOKS_BROKEN_TEXT.indexOf(EM_DASH) === -1, 'the broken hooks fixture contains no em-dash');
assert(core.EXAMPLE_FRONTMATTER_AGENT_BROKEN_TEXT.indexOf(EM_DASH) === -1, 'the broken agent frontmatter fixture contains no em-dash');
assert(core.EXAMPLE_FRONTMATTER_SKILL_BROKEN_TEXT.indexOf(EM_DASH) === -1, 'the broken skill frontmatter fixture contains no em-dash');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
