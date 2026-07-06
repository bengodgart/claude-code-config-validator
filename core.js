// core.js, pure logic for the Claude Code Config Validator. No dependencies.
// Runs unmodified in the browser (as global functions loaded via <script src="core.js">)
// and in Node (via the module.exports footer at the bottom), so the same code that
// renders the page is the code the tests check.
//
// Two jobs, in this file:
//   1. A settings.json hooks validator/builder: checks the event/matcher/handler
//      shape against the documented schema and flags the specific failure modes
//      reported in five real Claude Code GitHub issues.
//   2. An agent / SKILL.md YAML frontmatter validator/builder: a hand-written
//      parser for the SUBSET of YAML that Claude Code frontmatter actually uses
//      (key: value scalars, quoted strings, inline [a, b] lists, and block
//      "- item" lists). This is not a general YAML parser; see README.md.
//
// Grounded against the live docs at code.claude.com/docs/en/hooks,
// /en/sub-agents, and /en/skills, and against these open GitHub issues:
//   #31187  Hooks validation error message contradicts its own example
//   #11544  Hooks not loading from settings.json despite valid configuration
//   #6377   Frontmatter parsing error: missing 'name' field despite valid YAML
//   #20931  Custom agents in ~/.claude/agents/ not loaded as Task subagent types
//   #25380  SKILL.md validator only recognizes standard fields, rejects extended frontmatter

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function typeOfValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

var ISSUE_URLS = {
  '31187': 'https://github.com/anthropics/claude-code/issues/31187',
  '11544': 'https://github.com/anthropics/claude-code/issues/11544',
  '6377': 'https://github.com/anthropics/claude-code/issues/6377',
  '20931': 'https://github.com/anthropics/claude-code/issues/20931',
  '25380': 'https://github.com/anthropics/claude-code/issues/25380',
};

// ---------------------------------------------------------------------------
// 1. Hooks validator (settings.json "hooks" block)
// ---------------------------------------------------------------------------

// Every hook event name documented at code.claude.com/docs/en/hooks. Used to
// catch typos in event names (a nested-field-typo failure mode).
var KNOWN_EVENTS = [
  'SessionStart', 'Setup', 'UserPromptSubmit', 'UserPromptExpansion', 'PreToolUse',
  'PermissionRequest', 'PermissionDenied', 'PostToolUse', 'PostToolUseFailure',
  'PostToolBatch', 'Notification', 'MessageDisplay', 'SubagentStart', 'SubagentStop',
  'TaskCreated', 'TaskCompleted', 'Stop', 'StopFailure', 'TeammateIdle',
  'InstructionsLoaded', 'ConfigChange', 'CwdChanged', 'FileChanged', 'WorktreeCreate',
  'WorktreeRemove', 'PreCompact', 'PostCompact', 'Elicitation', 'ElicitationResult',
  'SessionEnd',
];

// Events that do not support a matcher at all; a matcher on these is silently
// ignored per the docs, so it is not worth flagging as an error.
var EVENTS_WITHOUT_MATCHER = [
  'UserPromptSubmit', 'PostToolBatch', 'Stop', 'TeammateIdle', 'TaskCreated',
  'TaskCompleted', 'WorktreeCreate', 'WorktreeRemove', 'MessageDisplay', 'CwdChanged',
];

// Events whose matcher filters on tool_name, the only ones "which hooks fire
// for tool X" can honestly answer. Other events match on different fields
// (session source, agent type, notification type, and so on).
var TOOL_MATCHER_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied'];

var HOOK_HANDLER_TYPES = ['command', 'http', 'mcp_tool', 'prompt', 'agent'];

var HANDLER_REQUIRED_FIELDS = {
  command: ['command'],
  http: ['url'],
  mcp_tool: ['server', 'tool'],
  prompt: ['prompt'],
  agent: ['prompt'],
};

// Common misspelled/misplaced field names seen on hook handler objects.
var COMMON_HANDLER_TYPO_FIELDS = [
  { wrong: 'Command', right: 'command' },
  { wrong: 'Type', right: 'type' },
  { wrong: 'cmd', right: 'command' },
  { wrong: 'timeoutMs', right: 'timeout (in seconds, not milliseconds)' },
  { wrong: 'timeout_ms', right: 'timeout (in seconds, not milliseconds)' },
];

// Finds the hooks event map inside whatever the user pasted: a full
// settings.json (has a top-level "hooks" object), or just the hooks object
// itself (keys are event names directly, e.g. {"PreToolUse": [...]}).
function extractHooksBlock(parsed) {
  if (!isPlainObject(parsed)) {
    return { hooksMap: null, error: 'Expected a JSON object at the top level (either a full settings.json or just the hooks block).' };
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'hooks')) {
    if (isPlainObject(parsed.hooks)) {
      return { hooksMap: parsed.hooks, note: 'Detected a full settings.json. Validating the "hooks" block inside it.' };
    }
    return { hooksMap: null, error: '"hooks" was found but is not an object. Expected {"EventName": [...]}.' };
  }
  var keys = Object.keys(parsed);
  if (keys.length === 0) {
    return { hooksMap: null, error: 'Empty object: nothing to validate. Paste a hooks block or a full settings.json.' };
  }
  var looksLikeEventMap = keys.some(function (k) { return KNOWN_EVENTS.indexOf(k) !== -1; });
  if (looksLikeEventMap) {
    return { hooksMap: parsed, note: null };
  }
  return { hooksMap: null, error: 'Could not find a hooks block. Paste either a full settings.json (with a top-level "hooks" key) or just the hooks object, for example {"PreToolUse": [...]}.' };
}

// Matches a hook matcher value against a tool name, following the documented
// evaluation rules: "*", "", or omitted matches everything; a value made up
// only of letters, digits, "_", "-", spaces, "," and "|" is one or more exact
// names separated by "|" or ","; anything else is an unanchored JS regular
// expression tested against the value.
function matchesMatcher(matcher, value) {
  if (matcher === undefined || matcher === null || matcher === '' || matcher === '*') return true;
  if (typeof matcher !== 'string') return false;
  if (/^[A-Za-z0-9_\- ,|]*$/.test(matcher)) {
    var parts = matcher.split(/[|,]/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    return parts.indexOf(value) !== -1;
  }
  try {
    return new RegExp(matcher).test(value);
  } catch (e) {
    return false;
  }
}

// Walks a hooks event map and returns every finding: [{level, path, message,
// issue}], collecting all of them in one pass rather than stopping at the
// first problem. level is 'error', 'warn', or 'info'. issue is a GitHub issue
// number string (see ISSUE_URLS) or null when a finding is not tied to one of
// the five cited issues.
function validateHooksConfig(rawText) {
  var parseResult = tryParseJson(rawText);
  if (!parseResult.ok) {
    return { ok: false, findings: [{ level: 'error', path: '(root)', message: 'Not valid JSON: ' + parseResult.error, issue: null }], hooksMap: null };
  }
  var extraction = extractHooksBlock(parseResult.value);
  if (!extraction.hooksMap) {
    return { ok: false, findings: [{ level: 'error', path: '(root)', message: extraction.error, issue: null }], hooksMap: null };
  }

  var hooksMap = extraction.hooksMap;
  var findings = [];
  if (extraction.note) findings.push({ level: 'info', path: '(root)', message: extraction.note, issue: null });

  Object.keys(hooksMap).forEach(function (eventName) {
    var path = 'hooks.' + eventName;
    if (KNOWN_EVENTS.indexOf(eventName) === -1) {
      findings.push({ level: 'error', path: path, message: '"' + eventName + '" is not a recognized hook event name. Event names are case-sensitive; check for a typo.', issue: null });
    }
    var groups = hooksMap[eventName];
    if (!Array.isArray(groups)) {
      findings.push({ level: 'error', path: path, message: 'Expected an array of matcher groups for this event, got ' + typeOfValue(groups) + '.', issue: null });
      return;
    }
    groups.forEach(function (group, gi) {
      var gpath = path + '[' + gi + ']';
      if (!isPlainObject(group)) {
        findings.push({ level: 'error', path: gpath, message: 'Expected an object with a "hooks" array (and optionally "matcher"), got ' + typeOfValue(group) + '.', issue: null });
        return;
      }

      if (Object.prototype.hasOwnProperty.call(group, 'matcher')) {
        var m = group.matcher;
        if (typeof m !== 'string') {
          findings.push({
            level: 'error',
            path: gpath + '.matcher',
            message: '"matcher" must be a string (for example "Edit|Write"), not ' + typeOfValue(m) + '. Issue #31187 documents this exact contradiction: an old validation error message showed an object-shaped matcher example that does not match the real schema, which requires a plain string.',
            issue: '31187',
          });
        }
      } else if (eventName === 'Stop' || eventName === 'Notification') {
        findings.push({
          level: 'warn',
          path: gpath,
          message: 'No "matcher" key at all on this ' + eventName + ' entry. That is valid per the documented schema (an omitted matcher defaults to match-all), but issue #11544 reports hooks in exactly this shape silently failing to load in some Claude Code versions. If this hook does not fire, try adding "matcher": "" explicitly.',
          issue: '11544',
        });
      }

      if (!Object.prototype.hasOwnProperty.call(group, 'hooks')) {
        if (Object.prototype.hasOwnProperty.call(group, 'command') || Object.prototype.hasOwnProperty.call(group, 'type')) {
          findings.push({
            level: 'error',
            path: gpath,
            message: 'This entry has "command" or "type" directly on the matcher group, with no nested "hooks" array. Claude Code requires hook handlers nested under a "hooks" array inside each matcher group. This flat shape is exactly the first step of issue #31187.',
            issue: '31187',
          });
        } else {
          findings.push({ level: 'error', path: gpath, message: 'Missing required "hooks" array (the list of hook handlers to run).', issue: null });
        }
        return;
      }

      var handlers = group.hooks;
      if (!Array.isArray(handlers)) {
        findings.push({ level: 'error', path: gpath + '.hooks', message: '"hooks" must be an array, got ' + typeOfValue(handlers) + '.', issue: null });
        return;
      }

      handlers.forEach(function (handler, hi) {
        var hpath = gpath + '.hooks[' + hi + ']';
        if (!isPlainObject(handler)) {
          findings.push({ level: 'error', path: hpath, message: 'Expected a hook handler object, got ' + typeOfValue(handler) + '.', issue: null });
          return;
        }

        if (Object.prototype.hasOwnProperty.call(handler, 'matcher')) {
          findings.push({ level: 'warn', path: hpath + '.matcher', message: '"matcher" belongs on the matcher group one level up, not on the hook handler. This is a common nested-field typo.', issue: null });
        }

        if (!Object.prototype.hasOwnProperty.call(handler, 'type')) {
          findings.push({ level: 'error', path: hpath, message: 'Missing required "type" field (for example "command"). Every hook handler must declare its type.', issue: null });
        } else if (HOOK_HANDLER_TYPES.indexOf(handler.type) === -1) {
          findings.push({ level: 'error', path: hpath + '.type', message: '"' + handler.type + '" is not a recognized handler type. Expected one of: ' + HOOK_HANDLER_TYPES.join(', ') + '.', issue: null });
        } else {
          (HANDLER_REQUIRED_FIELDS[handler.type] || []).forEach(function (f) {
            if (!Object.prototype.hasOwnProperty.call(handler, f)) {
              findings.push({ level: 'error', path: hpath, message: 'A "' + handler.type + '" hook handler is missing its required "' + f + '" field.', issue: null });
            }
          });
        }

        if (Object.prototype.hasOwnProperty.call(handler, 'timeout') && typeof handler.timeout !== 'number') {
          findings.push({ level: 'error', path: hpath + '.timeout', message: '"timeout" must be a number of seconds, got ' + typeOfValue(handler.timeout) + ' (' + JSON.stringify(handler.timeout) + '). A quoted string like "30" is not treated as a number.', issue: null });
        }

        COMMON_HANDLER_TYPO_FIELDS.forEach(function (typo) {
          if (Object.prototype.hasOwnProperty.call(handler, typo.wrong)) {
            findings.push({ level: 'warn', path: hpath + '.' + typo.wrong, message: '"' + typo.wrong + '" is not a recognized field. Did you mean "' + typo.right + '"?', issue: null });
          }
        });
      });
    });
  });

  var errorCount = findings.filter(function (f) { return f.level === 'error'; }).length;
  return { ok: errorCount === 0, findings: findings, hooksMap: hooksMap };
}

// Reports, for every matcher group on a tool-matching event (PreToolUse,
// PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied),
// whether it would fire for the given tool name.
function previewToolFire(hooksMap, toolName) {
  var results = [];
  if (!hooksMap) return results;
  TOOL_MATCHER_EVENTS.forEach(function (eventName) {
    if (!Object.prototype.hasOwnProperty.call(hooksMap, eventName)) return;
    var groups = hooksMap[eventName];
    if (!Array.isArray(groups)) return;
    groups.forEach(function (group, gi) {
      if (!isPlainObject(group)) return;
      var hasMatcher = Object.prototype.hasOwnProperty.call(group, 'matcher');
      results.push({
        event: eventName,
        index: gi,
        matcher: hasMatcher ? group.matcher : null,
        fires: matchesMatcher(hasMatcher ? group.matcher : undefined, toolName),
        handlerCount: Array.isArray(group.hooks) ? group.hooks.length : 0,
      });
    });
  });
  return results;
}

// Builds a schema-valid settings.json "hooks" snippet from a handful of
// options, for the reverse "generate a valid stub" mode.
function generateHooksStub(opts) {
  opts = opts || {};
  var event = opts.event || 'PreToolUse';
  var type = HOOK_HANDLER_TYPES.indexOf(opts.type) !== -1 ? opts.type : 'command';
  var handler = { type: type };
  if (type === 'command') handler.command = opts.command || 'echo hello';
  else if (type === 'http') handler.url = opts.url || 'https://example.com/hook';
  else if (type === 'mcp_tool') { handler.server = opts.server || 'my_server'; handler.tool = opts.tool || 'my_tool'; }
  else handler.prompt = opts.prompt || 'Describe what to check.';

  if (opts.timeout !== undefined && opts.timeout !== null && opts.timeout !== '') {
    var n = Number(opts.timeout);
    if (!isNaN(n)) handler.timeout = n;
  }

  var group = { hooks: [handler] };
  if (EVENTS_WITHOUT_MATCHER.indexOf(event) === -1) {
    group.matcher = (opts.matcher === undefined || opts.matcher === null || opts.matcher === '') ? '*' : opts.matcher;
  }

  var out = { hooks: {} };
  out.hooks[event] = [group];
  return JSON.stringify(out, null, 2);
}

// ---------------------------------------------------------------------------
// 2. Frontmatter validator (agent .md and SKILL.md files)
// ---------------------------------------------------------------------------

var KNOWN_MODEL_ALIASES = ['opus', 'sonnet', 'haiku', 'inherit', 'fable'];

// Documented frontmatter fields, per mode, so unrecognized-but-real fields
// (the #25380 failure mode) get a soft warning instead of a hard error.
var KNOWN_AGENT_FIELDS = [
  'name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode',
  'mcpServers', 'skills', 'memory', 'effort', 'hooks', 'color', 'background',
  'isolation', 'maxTurns', 'prompt', 'initialPrompt',
];
var KNOWN_SKILL_FIELDS = [
  'name', 'description', 'when_to_use', 'argument-hint', 'arguments',
  'disable-model-invocation', 'user-invocable', 'allowed-tools', 'disallowed-tools',
  'model', 'effort', 'context', 'agent',
];

function unquote(s) {
  if (s.length >= 2) {
    if (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') return s.slice(1, -1).replace(/\\"/g, '"');
    if (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function isValidSlug(name, maxLen) {
  return typeof name === 'string' && name.length > 0 && (!maxLen || name.length <= maxLen) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

function slugify(s) {
  var slug = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (slug.slice(0, 64)) || 'unnamed';
}

// Hand-written parser for the SUBSET of YAML frontmatter Claude Code actually
// uses: "key: value" scalars, single/double-quoted strings, booleans,
// numbers, inline "[a, b]" lists, and block "- item" lists. It does not
// support nested maps, multiline block scalars (| or >), anchors, or any
// other general-YAML feature. See README.md.
function parseFrontmatter(text) {
  var result = { frontmatter: null, order: [], body: '', error: null, warnings: [] };
  if (typeof text !== 'string') { result.error = 'No text provided.'; return result; }

  var lines = text.replace(/\r\n/g, '\n').split('\n');
  var startIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    if (lines[i].trim() === '---') startIdx = i;
    break;
  }
  if (startIdx === -1) {
    result.error = 'No frontmatter block found. The file must start with a line containing only "---" (optionally after leading blank lines).';
    return result;
  }
  if (startIdx > 0) {
    result.warnings.push('There are ' + startIdx + ' blank line(s) before the opening "---". Some parsers only recognize frontmatter starting on line 1; this kind of hidden-formatting issue is behind issue #6377 ("missing name field despite valid YAML").');
  }

  var endIdx = -1;
  for (var j = startIdx + 1; j < lines.length; j++) {
    if (lines[j].trim() === '---') { endIdx = j; break; }
  }
  if (endIdx === -1) {
    result.error = 'Frontmatter block is not closed: no second "---" line found.';
    return result;
  }

  var fm = {};
  var order = [];
  var currentListKey = null;
  for (var k = startIdx + 1; k < endIdx; k++) {
    var rawLine = lines[k];
    if (rawLine.trim() === '' || rawLine.trim().charAt(0) === '#') continue;

    var listItemMatch = rawLine.match(/^\s*-\s+(.*)$/);
    if (listItemMatch && currentListKey) {
      fm[currentListKey].push(unquote(listItemMatch[1].trim()));
      continue;
    }

    var kvMatch = rawLine.match(/^([A-Za-z0-9_.-]+):(.*)$/);
    if (!kvMatch) {
      result.warnings.push('Line ' + (k + 1) + ' ("' + rawLine.trim() + '") is not a recognized "key: value" line or list item; it was skipped.');
      currentListKey = null;
      continue;
    }

    var key = kvMatch[1];
    var rest = kvMatch[2].trim();
    order.push(key);

    if (rest === '') {
      currentListKey = key;
      fm[key] = [];
      continue;
    }
    currentListKey = null;

    if (rest.charAt(0) === '[' && rest.charAt(rest.length - 1) === ']') {
      var inner = rest.slice(1, -1).trim();
      fm[key] = inner === '' ? [] : inner.split(',').map(function (s) { return unquote(s.trim()); });
    } else if (rest === 'true' || rest === 'false') {
      fm[key] = rest === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(rest)) {
      fm[key] = Number(rest);
    } else {
      fm[key] = unquote(rest);
    }
  }

  result.frontmatter = fm;
  result.order = order;
  result.body = lines.slice(endIdx + 1).join('\n');
  return result;
}

function fixModelValue(model) {
  if (model === undefined || model === null || model === '') return null;
  if (typeof model === 'string') {
    if (KNOWN_MODEL_ALIASES.indexOf(model) !== -1 || /^claude-/.test(model)) return model;
    if (KNOWN_MODEL_ALIASES.indexOf(model.toLowerCase()) !== -1) return model.toLowerCase();
  }
  return 'inherit';
}

function fixBoolean(v) {
  if (typeof v === 'boolean') return v;
  var s = String(v).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === '1' || s === 'true';
}

// Validates parsed frontmatter against the agent or skill dialect. mode is
// 'agent' (name and description required, per issue #6377's exact case) or
// 'skill' (name optional/defaults to the directory name, description only
// recommended, several extra documented fields allowed).
function validateFrontmatter(text, mode) {
  mode = mode === 'skill' ? 'skill' : 'agent';
  var parsed = parseFrontmatter(text);
  var findings = [];

  parsed.warnings.forEach(function (w) {
    findings.push({ level: 'warn', path: '(frontmatter)', message: w, issue: w.indexOf('#6377') !== -1 ? '6377' : null });
  });

  if (parsed.error) {
    findings.push({ level: 'error', path: '(frontmatter)', message: parsed.error, issue: null });
    return { ok: false, findings: findings, frontmatter: null, body: parsed.body, mode: mode };
  }

  var fm = parsed.frontmatter;
  var knownFields = mode === 'skill' ? KNOWN_SKILL_FIELDS : KNOWN_AGENT_FIELDS;

  var hasName = Object.prototype.hasOwnProperty.call(fm, 'name') && fm.name !== '' && fm.name !== null;
  if (mode === 'agent' && !hasName) {
    findings.push({
      level: 'error',
      path: 'name',
      message: 'Missing required "name" field. This is the exact failure in issue #6377 ("missing name field despite valid YAML"): the file can look correctly formatted and still be rejected if name is absent.',
      issue: '6377',
    });
  }
  if (hasName && (typeof fm.name !== 'string' || !isValidSlug(fm.name, mode === 'skill' ? 64 : null))) {
    findings.push({
      level: 'error',
      path: 'name',
      message: '"' + fm.name + '" is not a valid slug. Names use lowercase letters, digits, and hyphens only' + (mode === 'skill' ? ' (max 64 characters)' : '') + '. A malformed name is a common reason custom agents fail to be discovered as Task subagent types, as reported in issue #20931.',
      issue: '20931',
    });
  }

  var hasDescription = Object.prototype.hasOwnProperty.call(fm, 'description') && fm.description !== '' && fm.description !== null;
  if (!hasDescription) {
    findings.push({
      level: mode === 'agent' ? 'error' : 'warn',
      path: 'description',
      message: mode === 'agent'
        ? 'Missing required "description" field. Claude uses this to decide when to delegate to the subagent.'
        : '"description" is missing. It is not strictly required, but Claude uses it to decide when to load the skill; without it, only the first paragraph of the body is used instead.',
      issue: null,
    });
  }

  if (Object.prototype.hasOwnProperty.call(fm, 'model')) {
    var modelVal = fm.model;
    var isKnownAlias = typeof modelVal === 'string' && KNOWN_MODEL_ALIASES.indexOf(modelVal) !== -1;
    var looksLikeFullId = typeof modelVal === 'string' && /^claude-/.test(modelVal);
    if (!isKnownAlias && !looksLikeFullId) {
      findings.push({
        level: 'error',
        path: 'model',
        message: '"' + modelVal + '" is not a recognized model value. Expected one of: ' + KNOWN_MODEL_ALIASES.join(', ') + ', or a full model id such as "claude-opus-4-8". Values are case-sensitive.',
        issue: null,
      });
    }
  }

  var toolsFields = mode === 'agent' ? ['tools', 'disallowedTools'] : ['allowed-tools', 'disallowed-tools'];
  toolsFields.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(fm, f)) {
      var v = fm[f];
      if (typeof v !== 'string' && !Array.isArray(v)) {
        findings.push({ level: 'error', path: f, message: '"' + f + '" should be a comma-separated string or a YAML list of tool names, got ' + typeOfValue(v) + '.', issue: null });
      }
    }
  });

  if (mode === 'skill') {
    ['disable-model-invocation', 'user-invocable'].forEach(function (f) {
      if (Object.prototype.hasOwnProperty.call(fm, f) && typeof fm[f] !== 'boolean') {
        findings.push({ level: 'error', path: f, message: '"' + f + '" should be true or false, got "' + fm[f] + '".', issue: null });
      }
    });
    if (Object.prototype.hasOwnProperty.call(fm, 'context') && fm.context !== 'fork') {
      findings.push({ level: 'error', path: 'context', message: '"context" only accepts "fork", got "' + fm.context + '".', issue: null });
    }
  }

  Object.keys(fm).forEach(function (key) {
    if (knownFields.indexOf(key) === -1) {
      findings.push({
        level: 'warn',
        path: key,
        message: '"' + key + '" is not in this tool\'s known ' + mode + '-frontmatter field list. It may be a real, newer field: Claude Code has shipped a documented bug (#25380) where its own SKILL.md validator rejected valid extended frontmatter fields it did not yet recognize. Check the current docs before treating this as an error.',
        issue: '25380',
      });
    }
  });

  var errorCount = findings.filter(function (f) { return f.level === 'error'; }).length;
  return { ok: errorCount === 0, findings: findings, frontmatter: fm, body: parsed.body, mode: mode };
}

// Builds a best-effort corrected frontmatter block from whatever was parsed:
// mechanical fixes only (slugify a malformed name, lowercase a near-miss
// model value, coerce yes/no to booleans). It never invents description text;
// a missing required field becomes a clearly bracketed placeholder instead.
function buildCorrectedFrontmatter(fm, mode) {
  fm = fm || {};
  var lines = ['---'];

  if (mode === 'agent') {
    var name = fm.name;
    if (typeof name !== 'string' || !isValidSlug(name, null)) {
      name = (typeof name === 'string' && name) ? slugify(name) : 'replace-with-a-name';
    }
    lines.push('name: ' + name);

    var description = (typeof fm.description === 'string' && fm.description !== '') ? fm.description : '<Describe when Claude should delegate to this subagent. Required.>';
    lines.push('description: ' + description);

    if (fm.tools !== undefined) {
      lines.push('tools: ' + (Array.isArray(fm.tools) ? fm.tools.join(', ') : fm.tools));
    }
    var agentModel = fixModelValue(fm.model);
    if (agentModel) lines.push('model: ' + agentModel);
  } else {
    if (fm.name !== undefined && fm.name !== '') {
      var skillName = fm.name;
      if (typeof skillName !== 'string' || !isValidSlug(skillName, 64)) skillName = slugify(skillName);
      lines.push('name: ' + skillName);
    }

    var skillDescription = (typeof fm.description === 'string' && fm.description !== '') ? fm.description : '<Recommended: describe what this skill does and when to use it.>';
    lines.push('description: ' + skillDescription);

    if (fm['allowed-tools'] !== undefined) {
      var at = fm['allowed-tools'];
      lines.push('allowed-tools: ' + (Array.isArray(at) ? at.join(', ') : at));
    }
    var skillModel = fixModelValue(fm.model);
    if (skillModel && Object.prototype.hasOwnProperty.call(fm, 'model')) lines.push('model: ' + skillModel);
    if (Object.prototype.hasOwnProperty.call(fm, 'disable-model-invocation')) {
      lines.push('disable-model-invocation: ' + fixBoolean(fm['disable-model-invocation']));
    }
    if (Object.prototype.hasOwnProperty.call(fm, 'user-invocable')) {
      lines.push('user-invocable: ' + fixBoolean(fm['user-invocable']));
    }
    if (fm.context === 'fork') lines.push('context: fork');
  }

  lines.push('---');
  return lines.join('\n');
}

// Builds a fresh, schema-valid frontmatter block from a handful of options,
// for the reverse "generate a valid stub" mode.
function generateFrontmatterStub(opts) {
  opts = opts || {};
  var mode = opts.mode === 'skill' ? 'skill' : 'agent';
  var lines = ['---'];
  var name = opts.name || (mode === 'skill' ? 'my-skill' : 'my-agent');
  lines.push('name: ' + name);
  lines.push('description: ' + (opts.description || (mode === 'skill' ? 'What this skill does and when to use it.' : 'What this subagent does and when Claude should delegate to it.')));
  if (mode === 'agent') {
    if (opts.tools) lines.push('tools: ' + opts.tools);
    lines.push('model: ' + (opts.model || 'inherit'));
  } else {
    if (opts.allowedTools) lines.push('allowed-tools: ' + opts.allowedTools);
    if (opts.model) lines.push('model: ' + opts.model);
    if (opts.disableModelInvocation) lines.push('disable-model-invocation: true');
  }
  lines.push('---');
  lines.push('');
  lines.push(opts.body || (mode === 'skill' ? 'Instructions for the skill go here.' : 'You are a focused subagent. Describe its behavior here.'));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fixtures for "Load example" (one broken, one valid, per tab)
// ---------------------------------------------------------------------------

// Broken hooks fixture. Built around issue #31187's exact contradictory-
// matcher repro (a flat matcher/command pair with no nested "hooks" array,
// then the "fixed" object-shaped matcher the error message itself suggested),
// plus a missing "type" field and a string "timeout", plus a typo'd event
// name, so one paste demonstrates every cited failure mode at once.
var EXAMPLE_HOOKS_BROKEN = {
  hooks: {
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        command: 'ruff check --fix $CLAUDE_FILE_PATH && ruff format $CLAUDE_FILE_PATH',
      },
      {
        matcher: { tools: ['BashTool'] },
        hooks: [
          { command: 'echo Done' },
        ],
      },
    ],
    PreToolUser: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi', timeout: '30' }] },
    ],
  },
};
var EXAMPLE_HOOKS_BROKEN_TEXT = JSON.stringify(EXAMPLE_HOOKS_BROKEN, null, 2);

// Valid hooks fixture: nested hooks arrays, string matchers, a Stop entry
// with the matcher key omitted entirely (valid per the schema; the UI still
// surfaces the #11544 advisory next to it).
var EXAMPLE_HOOKS_GOOD = {
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/check-command.sh', timeout: 30 }] },
    ],
    PostToolUse: [
      { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'ruff check --fix "$CLAUDE_FILE_PATH"', timeout: 60 }] },
    ],
    Stop: [
      { hooks: [{ type: 'command', command: 'afplay /System/Library/Sounds/Funk.aiff' }] },
    ],
  },
};
var EXAMPLE_HOOKS_GOOD_TEXT = JSON.stringify(EXAMPLE_HOOKS_GOOD, null, 2);

// Broken agent frontmatter: missing "name" (issue #6377's exact case), a
// wrong-case model value, and an unrecognized extra field.
var EXAMPLE_FRONTMATTER_AGENT_BROKEN_TEXT =
  '---\n' +
  'description: Reviews code for quality and best practices, and enforces the team style guide\n' +
  'tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite\n' +
  'model: Sonnet\n' +
  'temperature: 0.7\n' +
  '---\n\n' +
  'You are a careful code reviewer. Read the diff and list concrete issues.\n';

var EXAMPLE_FRONTMATTER_AGENT_GOOD_TEXT =
  '---\n' +
  'name: code-reviewer\n' +
  'description: Reviews code for quality and best practices. Use proactively after code changes.\n' +
  'tools: Read, Grep, Glob, Bash\n' +
  'model: sonnet\n' +
  '---\n\n' +
  'You are an expert code reviewer. Read the diff and list concrete issues.\n';

// Broken skill frontmatter: invalid name slug (spaces, punctuation, a
// capital letter), a non-boolean disable-model-invocation, and a missing
// (merely recommended, not required) description.
var EXAMPLE_FRONTMATTER_SKILL_BROKEN_TEXT =
  '---\n' +
  'name: Run Tests!\n' +
  'disable-model-invocation: yes\n' +
  'allowed-tools: Bash, Read\n' +
  '---\n\n' +
  'Run the test suite and summarize failures.\n';

var EXAMPLE_FRONTMATTER_SKILL_GOOD_TEXT =
  '---\n' +
  'name: run-tests\n' +
  'description: Runs the project test suite and reports failures. Use when asked to run or check tests.\n' +
  'allowed-tools: Bash, Read\n' +
  '---\n\n' +
  'Run `npm test` and summarize any failures.\n';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tryParseJson: tryParseJson,
    isPlainObject: isPlainObject,
    typeOfValue: typeOfValue,
    ISSUE_URLS: ISSUE_URLS,

    KNOWN_EVENTS: KNOWN_EVENTS,
    EVENTS_WITHOUT_MATCHER: EVENTS_WITHOUT_MATCHER,
    TOOL_MATCHER_EVENTS: TOOL_MATCHER_EVENTS,
    HOOK_HANDLER_TYPES: HOOK_HANDLER_TYPES,
    HANDLER_REQUIRED_FIELDS: HANDLER_REQUIRED_FIELDS,
    extractHooksBlock: extractHooksBlock,
    matchesMatcher: matchesMatcher,
    validateHooksConfig: validateHooksConfig,
    previewToolFire: previewToolFire,
    generateHooksStub: generateHooksStub,

    KNOWN_MODEL_ALIASES: KNOWN_MODEL_ALIASES,
    KNOWN_AGENT_FIELDS: KNOWN_AGENT_FIELDS,
    KNOWN_SKILL_FIELDS: KNOWN_SKILL_FIELDS,
    isValidSlug: isValidSlug,
    slugify: slugify,
    parseFrontmatter: parseFrontmatter,
    validateFrontmatter: validateFrontmatter,
    buildCorrectedFrontmatter: buildCorrectedFrontmatter,
    generateFrontmatterStub: generateFrontmatterStub,

    EXAMPLE_HOOKS_BROKEN_TEXT: EXAMPLE_HOOKS_BROKEN_TEXT,
    EXAMPLE_HOOKS_GOOD_TEXT: EXAMPLE_HOOKS_GOOD_TEXT,
    EXAMPLE_FRONTMATTER_AGENT_BROKEN_TEXT: EXAMPLE_FRONTMATTER_AGENT_BROKEN_TEXT,
    EXAMPLE_FRONTMATTER_AGENT_GOOD_TEXT: EXAMPLE_FRONTMATTER_AGENT_GOOD_TEXT,
    EXAMPLE_FRONTMATTER_SKILL_BROKEN_TEXT: EXAMPLE_FRONTMATTER_SKILL_BROKEN_TEXT,
    EXAMPLE_FRONTMATTER_SKILL_GOOD_TEXT: EXAMPLE_FRONTMATTER_SKILL_GOOD_TEXT,
  };
}
