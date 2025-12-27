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
  assert(output.includes('3.1.4 {pm lr}'), output);
  assert(!output.includes('3.1{'), output);
}

testBeatLevelProps();

console.log('alphatex beat-level props tests: ok');
