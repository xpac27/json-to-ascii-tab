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

function makeRestMeasure() {
  return {
    voices: [
      {
        beats: [
          {
            notes: [{ rest: true }],
            type: 1,
            rest: true,
            duration: [1, 1],
          },
        ],
        rest: true,
      },
    ],
    rest: true,
  };
}

function assertIncludes(output, needle) {
  assert(
    output.includes(needle),
    `Expected output to include ${needle}\n${output}`,
  );
}

function testSimpleRepeat() {
  const score = {
    measures: [makeMeasure(1), makeMeasure(2), makeMeasure(1), makeMeasure(2), makeMeasure(3)],
  };
  const output = jsonToAlphaText(score);
  assertIncludes(output, '\\ro');
  assertIncludes(output, '\\rc 2');
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
  const output = jsonToAlphaText(score);
  assertIncludes(output, '\\ro');
  assertIncludes(output, '\\ae 1');
  assertIncludes(output, '\\ae 2');
  assertIncludes(output, '\\rc 2');
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
  const output = jsonToAlphaText(score);
  assertIncludes(output, '\\ro');
  assertIncludes(output, '\\rc 3');
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
  const output = jsonToAlphaText(score);
  const repeatStarts = output.split('\\ro').length - 1;
  const repeatEnds = output.split('\\rc').length - 1;
  assert.strictEqual(repeatStarts, 2);
  assert.strictEqual(repeatEnds, 2);
}

function testLongRestRepeat() {
  const measures = Array.from({ length: 92 }, () => makeRestMeasure());
  const score = { measures };
  const output = jsonToAlphaText(score);
  const repeatStarts = output.split('\\ro').length - 1;
  const repeatEnds = output.split('\\rc').length - 1;
  const voltas = output.split('\\ae').length - 1;
  assert.strictEqual(repeatStarts, 1);
  assert.strictEqual(repeatEnds, 1);
  assert.strictEqual(voltas, 0);
  assertIncludes(output, '\\rc 92');
}

testSimpleRepeat();
testVoltaRepeat();
testMultiPassRepeat();
testMultipleRepeats();
testLongRestRepeat();

console.log('alphatex repeat inference tests: ok');
