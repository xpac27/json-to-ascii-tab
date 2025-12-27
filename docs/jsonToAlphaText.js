const DEFAULT_TUNING = [64, 59, 55, 50, 45, 40];
const POWER_OF_TWO_DURATIONS = new Set([1, 2, 4, 8, 16, 32, 64, 128, 256]);
const TUPLET_CANDIDATES = [3, 5, 6, 7, 9, 10, 12];
const repeatInference = (() => {
  if (typeof require !== 'undefined') {
    try {
      return require('./repeat_inference');
    } catch (err) {
      return null;
    }
  }
  if (typeof window !== 'undefined' && window.repeatInference) {
    return window.repeatInference;
  }
  return null;
})();

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
  let previousFrets = Array(6).fill(null);
  const measureInfos = [];

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

    const beats = normalizeBeats(measure, currentSignature, measureIndex, 0);
    const tokens = [];

    if (signatureChanged) {
      tokens.push(`\\ts ${currentSignature[0]} ${currentSignature[1]}`);
    }

    let measurePreviousFrets = previousFrets;
    beats.forEach((beat, beatIndex) => {
      const beatTempo = beatIndex === 0 ? tempoMap.get(measureIndex) : undefined;
      const { token, nextFrets } = formatBeat(beat, measurePreviousFrets, beatTempo, 0);
      measurePreviousFrets = nextFrets;
      tokens.push(token);
    });

    previousFrets = measurePreviousFrets;

    measureInfos.push({
      measure,
      measureIndex,
      signature: currentSignature,
      signatureChanged,
      markerText: measure.marker?.text ?? '',
      beats,
      tokens,
    });
  });

  const foldResult = inferRepeats(
    score,
    measureInfos,
    tempoMap,
    options,
  );

  const repeatMeta = buildRepeatMeta(foldResult.plan);
  const foldedIndices = foldResult.foldedIndices;

  foldedIndices.forEach((measureIndex, outputIndex) => {
    const info = measureInfos[measureIndex];
    if (info.markerText) {
      lines.push(`// ${info.markerText}`);
    }

    const meta = [];
    if (repeatMeta.repeatStarts.has(outputIndex)) {
      meta.push('\\ro');
    }

    const voltaPasses = repeatMeta.voltaStarts.get(outputIndex);
    if (voltaPasses) {
      meta.push(formatVolta(voltaPasses));
    }

    if (info.signatureChanged) {
      meta.push(`\\ts ${info.signature[0]} ${info.signature[1]}`);
    }

    const repeatTimes = repeatMeta.repeatEnds.get(outputIndex);
    if (repeatTimes) {
      meta.push(`\\rc ${repeatTimes}`);
    }

    const lineTokens = meta.concat(info.tokens);
    lines.push(`  ${lineTokens.join(' ')} |`);
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

function inferRepeats(score, measureInfos, tempoMap, options) {
  const inferEnabled = options.inferRepeats !== false;
  if (!inferEnabled || !repeatInference || !repeatInference.inferFoldPlan) {
    return { foldedIndices: [...Array(measureInfos.length).keys()], plan: null };
  }

  const boundaries = buildBoundaryIds(measureInfos, tempoMap);
  const fingerprints = measureInfos.map((info) => canonicalFingerprint(info));
  const adapter = {
    len: () => measureInfos.length,
    fingerprint: (i) => fingerprints[i],
    boundary_id: (i) => boundaries[i],
    debug_label: (i) => `m${i + 1}`,
  };

  const maxRepeatLen = Number.isInteger(options.maxRepeatLen)
    ? options.maxRepeatLen
    : 16;
  const minRepeatLen = Number.isInteger(options.minRepeatLen)
    ? options.minRepeatLen
    : 1;

  return repeatInference.inferFoldPlan(adapter, { maxRepeatLen, minRepeatLen });
}

function buildBoundaryIds(measureInfos, tempoMap) {
  const boundaries = new Array(measureInfos.length).fill(null);
  for (let i = 1; i < measureInfos.length; i += 1) {
    const info = measureInfos[i];
    if (info.signatureChanged || info.markerText || tempoMap.get(i) !== undefined) {
      boundaries[i] = 'boundary';
    }
  }
  return boundaries;
}

function canonicalFingerprint(info) {
  const voice0 = info.measure.voices?.[0];
  const canon = {
    signature: info.signature,
    voice_rest: !!voice0?.rest,
    beats: info.beats.map((beat) => canonicalBeat(beat)),
  };
  return stableStringify(canon);
}

function canonicalBeat(beat) {
  return {
    duration: beat.duration,
    rest: !!beat.rest,
    palmMute: !!beat.palmMute,
    letRing: !!beat.letRing,
    tuplet: beat.tuplet,
    tupletStart: !!beat.tupletStart,
    tupletStop: !!beat.tupletStop,
    notes: (beat.notes || []).map((note) => canonicalNote(note)),
  };
}

function canonicalNote(note) {
  return {
    string: note.string,
    fret: note.fret,
    rest: !!note.rest,
    tie: !!note.tie,
    hp: !!note.hp,
    slide: note.slide,
    ghost: !!note.ghost,
    dead: !!note.dead,
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildRepeatMeta(plan) {
  const repeatStarts = new Set();
  const repeatEnds = new Map();
  const voltaStarts = new Map();

  if (!plan || !Array.isArray(plan.repeats)) {
    return { repeatStarts, repeatEnds, voltaStarts };
  }

  plan.repeats.forEach((repeat) => {
    repeatStarts.add(repeat.start);
    repeatEnds.set(repeat.end, repeat.times || 2);
    (repeat.voltas || []).forEach((volta) => {
      voltaStarts.set(volta.start, volta.allowedPasses || []);
    });
  });

  return { repeatStarts, repeatEnds, voltaStarts };
}

function formatVolta(passes) {
  const normalized = passes.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  normalized.sort((a, b) => a - b);
  if (normalized.length <= 1) {
    return `\\ae ${normalized[0] ?? 1}`;
  }
  return `\\ae (${normalized.join(' ')})`;
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

function formatBeat(beat, previousFrets, tempo, voiceIndex) {
  const props = [];
  if (tempo !== undefined) props.push(`tempo ${tempo}`);
  if (beat.palmMute) props.push('pm');

  const dots = beat.dots ?? 0;
  if (dots >= 2) {
    props.push('dd');
  } else if (dots === 1) {
    props.push('d');
  }

  const durationInfo = resolveDuration(beat, voiceIndex);
  if (durationInfo.tuplet) props.push(`tu ${durationInfo.tuplet}`);

  const { content, nextFrets } = formatBeatContent(beat, previousFrets, voiceIndex);
  const beatToken = `${content}.${durationInfo.duration}`;

  if (props.length > 0) {
    return { token: `${beatToken} {${props.join(' ')}}`, nextFrets };
  }

  return { token: beatToken, nextFrets };
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

function formatBeatContent(beat, previousFrets, voiceIndex) {
  if (beat.rest) {
    return { content: 'r', nextFrets: Array(6).fill(null) };
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
  const nextFrets = Array(6).fill(null);
  const tokens = sorted.map(([stringIndex, note]) => {
    const prevFret = previousFrets[stringIndex];
    const hasPrev = Number.isInteger(prevFret);
    const effectiveTie = Boolean(note.tie && hasPrev);
    if (note.tie && !hasPrev && !Number.isInteger(note.fret)) {
      throw new Error(`Tie without a previous note on string ${note.string + 1} in voice ${voiceIndex + 1}.`);
    }
    const value = formatNoteValue(note, voiceIndex, effectiveTie, prevFret);
    if (!effectiveTie && Number.isInteger(note.fret)) {
      nextFrets[stringIndex] = note.fret;
    } else if (effectiveTie && Number.isInteger(prevFret)) {
      nextFrets[stringIndex] = prevFret;
    }
    const props = formatNoteProps(note, beat, effectiveTie);
    return props.length > 0 ? `${value}.${stringIndex + 1}{${props.join(' ')}}` : `${value}.${stringIndex + 1}`;
  });

  if (tokens.length === 1) {
    return { content: tokens[0], nextFrets };
  }

  return { content: `(${tokens.join(' ')})`, nextFrets };
}

function formatNoteValue(note, voiceIndex, effectiveTie, previousFret) {
  if (effectiveTie && Number.isInteger(previousFret)) return String(previousFret);
  if (note.dead) return 'x';
  if (!Number.isInteger(note.fret) || note.fret < 0) {
    throw new Error(`Note fret must be a non-negative integer in voice ${voiceIndex + 1}.`);
  }
  return String(note.fret);
}

function formatNoteProps(note, beat, effectiveTie) {
  const props = [];
  if (note.ghost) props.push('g');
  if (note.hp) props.push('h');
  if (effectiveTie) props.push('t');
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = jsonToAlphaText;
} else if (typeof window !== 'undefined') {
  window.jsonToAlphaText = jsonToAlphaText;
}
