const assert = require('assert');
const jsonToAlphaText = require('../../docs/jsonToAlphaText');

function testBeatLevelProps() {
  const score = {
    measures: [
      {
        signature: [4, 4],
        voices: [
          {
            beats: [
              {
                duration: [1, 4],
                palmMute: true,
                letRing: true,
                notes: [{ string: 0, fret: 3 }],
              },
            ],
          },
        ],
      },
    ],
  };

  const output = jsonToAlphaText(score);
  assert(output.includes('3.1.4 {pm}'), output);
  assert(!output.includes('3.1{'), output);
}

testBeatLevelProps();

function testTieUsesNoteProp() {
  const score = {
    measures: [
      {
        signature: [4, 4],
        voices: [
          {
            beats: [
              { duration: [1, 4], notes: [{ string: 0, fret: 3 }] },
              { duration: [1, 4], notes: [{ string: 0, fret: 3 }] },
              { duration: [1, 4], notes: [{ string: 0, fret: 3 }] },
              { duration: [1, 4], notes: [{ string: 0, fret: 3 }] },
            ],
          },
        ],
      },
      {
        voices: [
          {
            beats: [
              { duration: [1, 4], notes: [{ string: 0, fret: 3, tie: true }] },
            ],
          },
        ],
      },
    ],
  };

  const output = jsonToAlphaText(score);
  assert(output.includes('3.1{t}.4'), output);
  assert(!output.includes('-.1'), output);
}

testTieUsesNoteProp();

console.log('alphatex beat-level props tests: ok');
