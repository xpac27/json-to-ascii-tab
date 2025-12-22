const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40];
const POWER_OF_TWO_DURATIONS = new Set([1, 2, 4, 8, 16, 32, 64, 128, 256]);
const TUPLET_CANDIDATES = [3, 5, 6, 7, 9, 10, 12];

function jsonToAlphaText(raw, options = {}) {
  const score = parseScore(raw);
  const title = options.title?.trim() ?? '';
  const lines = [];

  if (title) lines.push(`\\title "${escapeText(title)}"`);
  if (score.name) lines.push(`\\artist "${escapeText(score.name)}"`);
  if (score.instrument) lines.push(`\\subtitle "${escapeText(score.instrument)}"`);

  if (score.instrument) {
    lines.push(`\\track "${escapeText(score.instrument)}"`);
  } else {
    lines.push('\\track');
  }

  lines.push('  \\staff {tabs}');
  lines.push(`  \\tuning (${formatTuning(score.tuning)})`);

  const tempoMap = buildTempoMap(score.automations?.tempo);

  let currentSignature = [4, 4];
  let previousNotes = Array(6).fill(false);
  score.measures.forEach((measure, measureIndex) => {
    let signatureChanged = false;
    if (measure.signature) {
      validateSignature(measure.signature, measureIndex);
      const [num, den] = measure.signature;
      if (num !== currentSignature[0] || den !== currentSignature[1]) {
        currentSignature = [num, den];
        signatureChanged = true;
      }
    }

    if (measure.marker?.text) {
      lines.push(`// ${measure.marker.text}`);
    }

    const beats = normalizeBeats(measure, currentSignature, measureIndex, 0);
    const tokens = [];

    if (signatureChanged) {
      tokens.push(`\\ts ${currentSignature[0]} ${currentSignature[1]}`);
    }

    let measurePreviousNotes = previousNotes;
    beats.forEach((beat, beatIndex) => {
      const beatTempo = beatIndex === 0 ? tempoMap.get(measureIndex) : undefined;
      const { token, nextNotes } = formatBeat(beat, measurePreviousNotes, beatTempo, 0);
      measurePreviousNotes = nextNotes;
      tokens.push(token);
    });

    lines.push(`  ${tokens.join(' ')} |`);
    previousNotes = measurePreviousNotes;
  });

  return lines.join('\n');
}

function parseScore(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Score JSON must be an object (voice 1).');
  }
  const score = raw;
  if (!Array.isArray(score.measures)) {
    throw new Error('Score JSON must include a "measures" array (voice 1).');
  }
  return score;
}

function escapeText(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatTuning(tuning) {
  const resolved = Array.isArray(tuning) && tuning.length === 6
    ? tuning
    : DEFAULT_TUNING;
  return resolved.map(midiToNote).join(' ');
}

function midiToNote(midi) {
  if (!Number.isInteger(midi)) {
    throw new Error(`Invalid MIDI value in tuning: ${midi} (voice 1).`);
  }
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function buildTempoMap(tempo) {
  const map = new Map();
  if (!tempo) return map;

  tempo.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    if (!Number.isInteger(entry.measure)) return;
    const pos = entry.position ?? 0;
    if (pos !== 0) return;
    if (typeof entry.bpm !== 'number' || !Number.isFinite(entry.bpm)) return;
    if (!map.has(entry.measure)) {
      map.set(entry.measure, entry.bpm);
    }
  });

  return map;
}

function validateSignature(signature, measureIndex) {
  const [num, den] = signature;
  if (!Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0) {
    throw new Error(`Invalid time signature in measure ${measureIndex + 1}, voice 1.`);
  }
}

function normalizeBeats(measure, signature, measureIndex, voiceIndex) {
  const voice0 = measure.voices?.[0];
  const beats = Array.isArray(voice0?.beats) ? voice0?.beats ?? [] : [];

  if (voice0?.rest || beats.length === 0) {
    return buildRestBeats(signature);
  }

  const measureLength = { n: signature[0], d: signature[1] };
  let total = { n: 0, d: 1 };
  const normalized = [];

  for (const beat of beats) {
    const duration = beatDuration(beat, measureIndex, voiceIndex);
    const next = addFractions(total, duration);
    if (compareFractions(next, measureLength) <= 0) {
      normalized.push(beat);
      total = next;
      if (compareFractions(total, measureLength) === 0) break;
    } else {
      break;
    }
  }

  if (compareFractions(total, measureLength) < 0) {
    const remaining = subtractFractions(measureLength, total);
    const restBeats = splitRestDuration(remaining);
    normalized.push(...restBeats);
  }

  return normalized;
}

function buildRestBeats(signature) {
  const [num, den] = signature;
  const beats = [];
  for (let i = 0; i < num; i += 1) {
    beats.push({ rest: true, duration: [1, den] });
  }
  return beats;
}

function splitRestDuration(duration) {
  if (duration.n <= 0) return [];
  const beats = [];
  for (let i = 0; i < duration.n; i += 1) {
    beats.push({ rest: true, duration: [1, duration.d] });
  }
  return beats;
}

function beatDuration(beat, measureIndex, voiceIndex) {
  const [n, d] = beat.duration ?? [];
  if (!Number.isInteger(n) || !Number.isInteger(d) || n <= 0 || d <= 0) {
    throw new Error(`Invalid beat duration in measure ${measureIndex + 1}, voice ${voiceIndex + 1}.`);
  }
  return reduceFraction({ n, d });
}

function formatBeat(beat, previousNotes, tempo, voiceIndex) {
  const props = [];
  if (tempo !== undefined) props.push(`tempo ${tempo}`);

  const dots = beat.dots ?? 0;
  if (dots >= 2) {
    props.push('dd');
  } else if (dots === 1) {
    props.push('d');
  }

  const durationInfo = resolveDuration(beat, voiceIndex);
  if (durationInfo.tuplet) props.push(`tu ${durationInfo.tuplet}`);

  const { content, nextNotes } = formatBeatContent(beat, previousNotes, voiceIndex);
  const beatToken = `${content}.${durationInfo.duration}`;

  if (props.length > 0) {
    return { token: `${beatToken} {${props.join(' ')}}`, nextNotes };
  }

  return { token: beatToken, nextNotes };
}

function resolveDuration(beat, voiceIndex) {
  if (!beat.duration || beat.duration.length !== 2) {
    throw new Error(`Beat duration is missing in voice ${voiceIndex + 1}.`);
  }
  const [n, d] = beat.duration;
  if (!Number.isInteger(n) || !Number.isInteger(d) || n <= 0 || d <= 0) {
    throw new Error(`Beat duration must be a positive fraction in voice ${voiceIndex + 1}.`);
  }
  if (n !== 1) {
    const dots = beat.dots ?? 0;
    if (beat.tuplet) {
      throw new Error(`Unsupported beat duration numerator: ${n} in voice ${voiceIndex + 1}.`);
    }
    const dottedBase = baseDurationFromDottedFraction(n, d, dots);
    if (dottedBase) {
      return { duration: dottedBase };
    }
    throw new Error(`Unsupported beat duration numerator: ${n} in voice ${voiceIndex + 1}.`);
  }

  if (beat.tuplet) {
    const base = (d * 2) / beat.tuplet;
    if (!Number.isInteger(base) || !POWER_OF_TWO_DURATIONS.has(base)) {
      throw new Error(`Unsupported tuplet duration: 1/${d} with tuplet ${beat.tuplet} in voice ${voiceIndex + 1}.`);
    }
    return { duration: base, tuplet: beat.tuplet };
  }

  if (POWER_OF_TWO_DURATIONS.has(d)) {
    return { duration: d };
  }

  for (const tuplet of TUPLET_CANDIDATES) {
    const base = (d * 2) / tuplet;
    if (Number.isInteger(base) && POWER_OF_TWO_DURATIONS.has(base)) {
      return { duration: base, tuplet };
    }
  }

  throw new Error(`Unsupported beat duration: 1/${d} in voice ${voiceIndex + 1}.`);
}

function baseDurationFromDottedFraction(numerator, denominator, dots) {
  if (dots === 1 && numerator === 3) {
    const base = (3 * denominator) / (2 * numerator);
    return Number.isInteger(base) && POWER_OF_TWO_DURATIONS.has(base) ? base : null;
  }
  if (dots === 2 && numerator === 7) {
    const base = (7 * denominator) / (4 * numerator);
    return Number.isInteger(base) && POWER_OF_TWO_DURATIONS.has(base) ? base : null;
  }
  return null;
}

function formatBeatContent(beat, previousNotes, voiceIndex) {
  if (beat.rest) {
    return { content: 'r', nextNotes: Array(6).fill(false) };
  }

  const notes = Array.isArray(beat.notes) ? beat.notes : [];
  const activeNotes = notes.filter((note) => note && !note.rest);
  if (activeNotes.length === 0) {
    return { content: 'r', nextNotes: Array(6).fill(false) };
  }

  const notesByString = new Map();
  for (const note of activeNotes) {
    if (!Number.isInteger(note.string) || note.string < 0 || note.string > 5) {
      throw new Error(`Invalid string index: ${note.string} in voice ${voiceIndex + 1}.`);
    }
    if (notesByString.has(note.string)) {
      throw new Error(`Multiple notes on string ${note.string + 1} in the same beat in voice ${voiceIndex + 1}.`);
    }
    notesByString.set(note.string, note);
  }

  const sorted = Array.from(notesByString.entries()).sort((a, b) => a[0] - b[0]);
  const nextNotes = Array(6).fill(false);
  const tokens = sorted.map(([stringIndex, note]) => {
    nextNotes[stringIndex] = true;
    const hasPrev = previousNotes[stringIndex];
    const effectiveTie = Boolean(note.tie && hasPrev);
    if (note.tie && !hasPrev && !Number.isInteger(note.fret)) {
      throw new Error(`Tie without a previous note on string ${note.string + 1} in voice ${voiceIndex + 1}.`);
    }
    const value = formatNoteValue(note, voiceIndex, effectiveTie);
    const props = formatNoteProps(note, beat);
    return props.length > 0 ? `${value}.${stringIndex + 1}{${props.join(' ')}}` : `${value}.${stringIndex + 1}`;
  });

  if (tokens.length === 1) {
    return { content: tokens[0], nextNotes };
  }

  return { content: `(${tokens.join(' ')})`, nextNotes };
}

function formatNoteValue(note, voiceIndex, effectiveTie) {
  if (effectiveTie) return '-';
  if (note.dead) return 'x';
  if (!Number.isInteger(note.fret) || note.fret < 0) {
    throw new Error(`Note fret must be a non-negative integer in voice ${voiceIndex + 1}.`);
  }
  return String(note.fret);
}

function formatNoteProps(note, beat) {
  const props = [];
  if (note.ghost) props.push('g');
  if (note.hp) props.push('h');
  if (beat.palmMute) props.push('pm');
  if (beat.letRing) props.push('lr');
  return props;
}

function reduceFraction(value) {
  const gcdValue = gcd(value.n, value.d);
  return { n: value.n / gcdValue, d: value.d / gcdValue };
}

function addFractions(a, b) {
  return reduceFraction({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
}

function subtractFractions(a, b) {
  return reduceFraction({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
}

function compareFractions(a, b) {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left === right ? 0 : left < right ? -1 : 1;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

window.jsonToAlphaText = jsonToAlphaText;
