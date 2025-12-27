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
  const output = jsonToAlphaText(score);
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
  const output = jsonToAlphaText(score);
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
  const output = jsonToAlphaText(score);
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
  assertMatches(output);
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

function testTempoSegmentedRestRepeats() {
  const measures = [
    ...Array.from({ length: 92 }, () => makeRestMeasure()),
    ...Array.from({ length: 3 }, () => makeRestMeasure()),
    ...Array.from({ length: 96 }, () => makeRestMeasure()),
    ...Array.from({ length: 4 }, () => makeRestMeasure()),
  ];
  const score = {
    measures,
    automations: {
      tempo: [
        { measure: 0, position: 0, bpm: 120 },
        { measure: 92, position: 0, bpm: 110 },
        { measure: 95, position: 0, bpm: 90 },
        { measure: 191, position: 0, bpm: 80 },
      ],
    },
  };
  const output = jsonToAlphaText(score);
  const repeatStarts = output.split('\\ro').length - 1;
  const repeatEnds = output.split('\\rc').length - 1;
  const voltas = output.split('\\ae').length - 1;
  assert.strictEqual(repeatStarts, 4);
  assert.strictEqual(repeatEnds, 4);
  assert.strictEqual(voltas, 0);
  assertMatches(output);
}

testSimpleRepeat();
testVoltaRepeat();
testMultiPassRepeat();
testMultipleRepeats();
testLongRestRepeat();
testNoSingleMeasureRepeatForNonSilent();
testTempoSegmentedRestRepeats();

console.log('alphatex repeat inference tests: ok');
