const assert = require('assert');
const { inferFoldPlan, unrollPlan } = require('../../docs/repeat_inference');

function makeAdapter(tokens, boundaries = []) {
  return {
    len: () => tokens.length,
    fingerprint: (i) => tokens[i],
    boundary_id: (i) => boundaries[i] ?? null,
    debug_label: (i) => tokens[i],
  };
}

function renderFolded(tokens, result) {
  const foldedTokens = result.foldedIndices.map((i) => tokens[i]);
  if (!result.plan) return foldedTokens.join(' ');

  if (!result.plan.repeats || result.plan.repeats.length !== 1) {
    return foldedTokens.join(' ');
  }

  const repeat = result.plan.repeats[0];
  const voltas = repeat.voltas || [];
  const voltaMap = new Map();
  for (const volta of voltas) voltaMap.set(volta.start, volta);

  const rendered = [];
  let i = 0;
  while (i < foldedTokens.length) {
    const token = foldedTokens[i];
    if (i === repeat.start) rendered.push('|:');

    const volta = voltaMap.get(i);
    if (volta) {
      const label = volta.allowedPasses[0];
      const spanTokens = foldedTokens.slice(volta.start, volta.end + 1).join(' ');
      rendered.push(`${label}.[${spanTokens}]`);
      i = volta.end + 1;
    } else {
      rendered.push(token);
      i += 1;
    }

    if (i - 1 === repeat.end) rendered.push(':|');
  }

  return rendered.join(' ');
}

function assertUnrollMatches(tokens, result) {
  const foldedTokens = result.foldedIndices.map((i) => tokens[i]);
  const unrolledIndices = unrollPlan(result.plan, foldedTokens.length);
  const unrolledTokens = unrolledIndices.map((i) => foldedTokens[i]);
  assert.deepStrictEqual(unrolledTokens, tokens);
}

function testSimpleRepeat() {
  const tokens = ['A', 'B', 'C', 'A', 'B', 'C', 'D'];
  const adapter = makeAdapter(tokens);
  const result = inferFoldPlan(adapter);
  assert(result.plan);
  assert.strictEqual(result.plan.repeats.length, 1);
  assert.strictEqual(renderFolded(tokens, result), '|: A B C :| D');
  assertUnrollMatches(tokens, result);
}

function testVolta() {
  const tokens = ['A', 'B', 'X', 'A', 'B', 'Y', 'D'];
  const adapter = makeAdapter(tokens);
  const result = inferFoldPlan(adapter);
  assert(result.plan);
  assert.strictEqual(result.plan.repeats.length, 1);
  assert.strictEqual(renderFolded(tokens, result), '|: A B 1.[X] 2.[Y] :| D');
  assertUnrollMatches(tokens, result);
}

function testBoundaryStopsFold() {
  const tokens = ['A', 'B', 'C', 'A', 'B', 'C', 'D'];
  const boundaries = [];
  boundaries[3] = 'ts';
  const adapter = makeAdapter(tokens, boundaries);
  const result = inferFoldPlan(adapter);
  assert.strictEqual(result.plan, null);
  assert.strictEqual(renderFolded(tokens, result), tokens.join(' '));
}

function testMultiPassRepeat() {
  const tokens = ['A', 'B', 'A', 'B', 'A', 'B', 'C'];
  const adapter = makeAdapter(tokens);
  const result = inferFoldPlan(adapter);
  assert(result.plan);
  assert.strictEqual(result.plan.repeats.length, 1);
  assert.strictEqual(result.plan.repeats[0].times, 3);
  assertUnrollMatches(tokens, result);
}

function testMultipleRepeats() {
  const tokens = ['A', 'B', 'A', 'B', 'C', 'D', 'C', 'D', 'E'];
  const adapter = makeAdapter(tokens);
  const result = inferFoldPlan(adapter);
  assert(result.plan);
  assert.strictEqual(result.plan.repeats.length, 2);
  assertUnrollMatches(tokens, result);
}

function testBoundaryCapsRepeatCount() {
  const tokens = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'];
  const boundaries = [];
  boundaries[4] = 'tempo';
  const adapter = makeAdapter(tokens, boundaries);
  const result = inferFoldPlan(adapter, { minRepeatLen: 1 });
  assert(result.plan);
  assert.strictEqual(result.plan.repeats.length, 2);
  assert.strictEqual(result.plan.repeats[0].times, 4);
  assert.strictEqual(result.plan.repeats[1].times, 4);
  assertUnrollMatches(tokens, result);
}

testSimpleRepeat();
testVolta();
testBoundaryStopsFold();
testMultiPassRepeat();
testMultipleRepeats();
testBoundaryCapsRepeatCount();

console.log('repeat inference tests: ok');
