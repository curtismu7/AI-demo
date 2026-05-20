// banking_api_server/scripts/extractChips.js
'use strict';
/**
 * Source-of-truth chip extractor.
 *
 * banking_api_ui/src/components/BankingChips.jsx is JSX with `import` and does
 * NOT export its chip constants, so it cannot be require()'d from Node. This
 * module reads the file as text and regex-parses the two const literals:
 *   const HEURISTIC_CHIPS = [ { id, label, message }, ... ];
 *   const LLM_CHIPS = { "Group": [ { id, label, message }, ... ], ... };
 *
 * Entry fields are simple string literals (id/label/message). The regex is
 * deliberately strict: it only matches { id: "..", label: "..", message: ".." }
 * objects (in any property order) and ignores comments/JSX around them.
 */
const fs = require('fs');
const path = require('path');

const CHIPS_FILE = path.resolve(
  __dirname,
  '../../demo_api_ui/src/components/BankingChips.jsx',
);

function readSource() {
  return fs.readFileSync(CHIPS_FILE, 'utf8');
}

/** Extract the substring of `src` for a balanced bracket starting at `openIdx`. */
function sliceBalanced(src, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error(`Unbalanced ${open}${close} starting at ${openIdx}`);
}

/** Pull every { id,label,message } object literal out of a block of text. */
function parseChipObjects(block) {
  const chips = [];
  // Match an object literal containing id/label/message string props in any order.
  const objRe = /\{[^{}]*?\bid\s*:\s*"([^"]+)"[^{}]*?\}/g;
  let m;
  while ((m = objRe.exec(block)) !== null) {
    const objText = m[0];
    const id = (objText.match(/\bid\s*:\s*"([^"]+)"/) || [])[1];
    const label = (objText.match(/\blabel\s*:\s*"([^"]+)"/) || [])[1];
    const message = (objText.match(/\bmessage\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    if (id && label != null && message != null) {
      chips.push({ id, label, message: message.replace(/\\"/g, '"') });
    }
  }
  return chips;
}

function extract() {
  const src = readSource();

  const hIdx = src.indexOf('HEURISTIC_CHIPS');
  const hArrStart = src.indexOf('[', hIdx);
  const hBlock = sliceBalanced(src, hArrStart, '[', ']');
  const heuristicChips = parseChipObjects(hBlock);

  const lIdx = src.indexOf('LLM_CHIPS');
  const lObjStart = src.indexOf('{', lIdx);
  const lBlock = sliceBalanced(src, lObjStart, '{', '}');
  // Group name precedes each array: "Group Name": [ ... ]
  const groupRe = /"([^"]+)"\s*:\s*\[/g;
  const llmChips = [];
  let gm;
  while ((gm = groupRe.exec(lBlock)) !== null) {
    const group = gm[1];
    const arrStart = lBlock.indexOf('[', gm.index);
    const arrBlock = sliceBalanced(lBlock, arrStart, '[', ']');
    for (const c of parseChipObjects(arrBlock)) {
      llmChips.push({ ...c, group });
    }
  }

  const allChips = [
    ...heuristicChips.map((c) => ({ ...c, kind: 'heuristic-builtin' })),
    ...llmChips.map((c) => ({ ...c, kind: 'llm-builtin' })),
  ];
  return { heuristicChips, llmChips, allChips };
}

module.exports = extract();
module.exports.extract = extract;
