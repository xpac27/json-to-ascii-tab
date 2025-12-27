const assert = require('assert');
const jsonToAlphaText = require('../../docs/jsonToAlphaText');

function makeMeasure(fret) {
  const beat = (value) => ({
    duration: [1, 4],
    notes: [{ string: 0, fret: value }],
  });
  return {
    signature: [4, 4],
    voices: [
      {
        beats: [beat(fret), beat(fret), beat(fret), beat(fret)],
      },
    ],
  };
}

function assertIncludes(output, needle) {
  assert(
    output.includes(needle),
    `Expected output to include ${needle}\n${output}`,
  );
}

function assertMatches(output, pattern) {
  const rcIndex = output.indexOf('\\rc ');
  assert(rcIndex >= 0, `Expected output to include \\rc <count>\\n${output}`);
  const after = output.slice(rcIndex + 4);
  assert(/^[0-9]+/.test(after), `Expected repeat count after \\rc\\n${output}`);
}

function testSimpleRepeat() {
  const score = {
    measures: [makeMeasure(1), makeMeasure(2), makeMeasure(1), makeMeasure(2), makeMeasure(3)],
  };
  const output = jsonToAlphaText(score, { minRepeatLen: 2 });
  assertIncludes(output, '\\ro');
  assertMatches(output);
}

function testVoltaRepeat() {
  const score = {
    measures: [
      makeMeasure(1),
      makeMeasure(2),
      makeMeasure(3),
      makeMeasure(1),
      makeMeasure(2),
      makeMeasure(4),
      makeMeasure(5),
    ],
  };
  const output = jsonToAlphaText(score, { minRepeatLen: 2 });
  assertIncludes(output, '\\ro');
  assertIncludes(output, '\\ae 1');
  assertIncludes(output, '\\ae 2');
  assertMatches(output);
}

function testMultiPassRepeat() {
  const score = {
    measures: [
      makeMeasure(1),
      makeMeasure(2),
      makeMeasure(1),
      makeMeasure(2),
      makeMeasure(1),
      makeMeasure(2),
      makeMeasure(3),
    ],
  };
  const output = jsonToAlphaText(score, { minRepeatLen: 2 });
  assertIncludes(output, '\\ro');
  assertMatches(output);
}

function testMultipleRepeats() {
  const score = {
    measures: [
      makeMeasure(1),
      makeMeasure(2),
      makeMeasure(1),
      makeMeasure(2),
      makeMeasure(3),
      makeMeasure(4),
      makeMeasure(3),
      makeMeasure(4),
      makeMeasure(5),
    ],
  };
  const output = jsonToAlphaText(score, { minRepeatLen: 2 });
  const repeatStarts = output.split('\\ro').length - 1;
  const repeatEnds = output.split('\\rc').length - 1;
  assert.strictEqual(repeatStarts, 2);
  assert.strictEqual(repeatEnds, 2);
}

function testNoSingleMeasureRepeatForNonSilent() {
  const score = {
    measures: [makeMeasure(1), makeMeasure(1), makeMeasure(1)],
  };
  const output = jsonToAlphaText(score);
  const repeatStarts = output.split('\\ro').length - 1;
  const repeatEnds = output.split('\\rc').length - 1;
  assert.strictEqual(repeatStarts, 0);
  assert.strictEqual(repeatEnds, 0);
}

function testMultiBarRestEnabled() {
  const score = {
    measures: [makeMeasure(1)],
  };
  const output = jsonToAlphaText(score);
  assertIncludes(output, '\\multiBarRest');
}

function testDefaultMinRepeatLenBlocksShortNonSilent() {
  const score = {
    measures: [makeMeasure(1), makeMeasure(2), makeMeasure(1), makeMeasure(2)],
  };
  const output = jsonToAlphaText(score);
  const repeatStarts = output.split('\\ro').length - 1;
  const repeatEnds = output.split('\\rc').length - 1;
  assert.strictEqual(repeatStarts, 0);
  assert.strictEqual(repeatEnds, 0);
}

testSimpleRepeat();
testVoltaRepeat();
testMultiPassRepeat();
testMultipleRepeats();
testNoSingleMeasureRepeatForNonSilent();
testMultiBarRestEnabled();
testDefaultMinRepeatLenBlocksShortNonSilent();

console.log('alphatex repeat inference tests: ok');
