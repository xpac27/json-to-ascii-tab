const DEFAULT_OPTIONS = {
  minRepeatLen: 4,
  maxRepeatLen: 16,
  minPrefixLen: 2,
  maxEndingLen: 8,
  allowMultipleRepeats: true,
  log: null,
};

function inferFoldPlan(adapter, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const length = adapter.len();
  const fingerprints = new Array(length);
  const boundaries = new Array(length);

  for (let i = 0; i < length; i += 1) {
    fingerprints[i] = adapter.fingerprint(i);
    boundaries[i] = adapter.boundary_id ? adapter.boundary_id(i) : null;
  }

  const candidates = [];
  candidates.push(...findSimpleRepeats(fingerprints, boundaries, opts));
  candidates.push(...findVoltas(fingerprints, boundaries, opts));

  const selection = selectRepeatSet(candidates, opts);
  if (!selection || selection.repeats.length === 0) {
    return {
      foldedIndices: [...Array(length).keys()],
      plan: null,
    };
  }

  const folded = buildFoldedPlan(selection.repeats, length);
  if (!verifyPlan(fingerprints, folded, opts)) {
    return {
      foldedIndices: [...Array(length).keys()],
      plan: null,
    };
  }

  return folded;
}

function unrollPlan(plan, measureCount) {
  const indices = [];
  if (!plan || !Array.isArray(plan.repeats) || plan.repeats.length === 0) {
    for (let i = 0; i < measureCount; i += 1) indices.push(i);
    return indices;
  }

  const repeats = [...plan.repeats].sort((a, b) => a.start - b.start);
  let cursor = 0;

  repeats.forEach((repeat) => {
    for (let i = cursor; i < repeat.start; i += 1) indices.push(i);

    const voltas = Array.isArray(repeat.voltas) ? repeat.voltas : [];
    const voltaMap = new Map();
    for (const volta of voltas) {
      voltaMap.set(volta.start, volta);
    }

    const times = repeat.times || 2;
    for (let pass = 1; pass <= times; pass += 1) {
      let i = repeat.start;
      while (i <= repeat.end) {
        const volta = voltaMap.get(i);
        if (volta) {
          const passes = new Set(volta.allowedPasses || []);
          if (passes.has(pass)) {
            for (let j = volta.start; j <= volta.end; j += 1) indices.push(j);
          }
          i = volta.end + 1;
        } else {
          indices.push(i);
          i += 1;
        }
      }
    }

    cursor = repeat.end + 1;
  });

  for (let i = cursor; i < measureCount; i += 1) indices.push(i);
  return indices;
}

function findSimpleRepeats(fps, boundaries, opts) {
  const candidates = [];
  const total = fps.length;
  const maxLen = Math.min(opts.maxRepeatLen, total);
  const nextBoundary = buildNextBoundary(boundaries);

  for (let start = 0; start < total; start += 1) {
    const boundaryIndex = nextBoundary[start + 1];
    const maxSpanEnd = boundaryIndex !== null ? boundaryIndex - 1 : total - 1;

    for (let len = opts.minRepeatLen; len <= maxLen; len += 1) {
      const secondStart = start + len;
      if (secondStart + len - 1 > maxSpanEnd) break;
      if (!segmentsEqual(fps, start, secondStart, len)) continue;

      const maxCount = Math.floor((maxSpanEnd - start + 1) / len);
      let count = 2;
      while (count <= maxCount && segmentsEqual(fps, start, start + (count - 1) * len, len)) {
        count += 1;
      }
      count -= 1;
      const spanEnd = start + len * count - 1;
      if (count < 2) continue;

      const skipStart = start + len;
      const skipEnd = spanEnd;

      const repeat = { start, end: start + len - 1, times: count };
      const candidate = buildCandidate(repeat, [], len, {
        skipRanges: [[skipStart, skipEnd]],
        expandedLen: len * count,
        printedLen: len,
        spanEnd,
      });
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

function findVoltas(fps, boundaries, opts) {
  const candidates = [];
  const total = fps.length;
  const maxPrefix = Math.min(opts.maxRepeatLen, total);

  for (let start = 0; start < total; start += 1) {
    for (let prefixLen = opts.minPrefixLen; prefixLen <= maxPrefix; prefixLen += 1) {
      for (let endLen1 = 1; endLen1 <= opts.maxEndingLen; endLen1 += 1) {
        for (let endLen2 = 1; endLen2 <= opts.maxEndingLen; endLen2 += 1) {
          const firstEnd = start + prefixLen + endLen1;
          const secondStart = firstEnd;
          const secondEnd = secondStart + prefixLen;
          const end = secondEnd + endLen2 - 1;
          if (end >= total) break;
          if (spanHasBoundary(boundaries, start, end)) continue;
          if (!segmentsEqual(fps, start, secondStart, prefixLen)) continue;
          if (endLen1 === endLen2 && segmentsEqual(fps, start + prefixLen, secondEnd, endLen1)) continue;

          const repeatStart = start;
          const repeatEnd = end;
          const volta1Start = start + prefixLen;
          const volta1End = volta1Start + endLen1 - 1;
          const volta2Start = secondEnd;
          const volta2End = volta2Start + endLen2 - 1;

          const skipStart = start + prefixLen + endLen1;
          const skipEnd = skipStart + prefixLen - 1;

          const repeat = { start: repeatStart, end: repeatEnd, times: 2 };
          const voltas = [
            { start: volta1Start, end: volta1End, allowedPasses: [1] },
            { start: volta2Start, end: volta2End, allowedPasses: [2] },
          ];

          const expandedLen = prefixLen * 2 + endLen1 + endLen2;
          const printedLen = prefixLen + endLen1 + endLen2;

          const candidate = buildCandidate(repeat, voltas, prefixLen, {
            skipRanges: [[skipStart, skipEnd]],
            expandedLen,
            printedLen,
            spanEnd: repeatEnd,
          });
          if (candidate) candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}

function buildCandidate(repeat, voltas, repeatLen, details) {
  const saved = details.expandedLen - details.printedLen;
  const constructs = 1 + (voltas ? voltas.length : 0);
  const score = saved * 10 - constructs;
  if (score <= 0) return null;

  return {
    repeat,
    voltas: voltas || [],
    skipRanges: details.skipRanges,
    expandedLen: details.expandedLen,
    printedLen: details.printedLen,
    spanEnd: details.spanEnd,
    score,
    start: repeat.start,
    end: details.spanEnd,
    repeatLen,
    constructs,
  };
}

function selectRepeatSet(candidates, opts) {
  if (candidates.length === 0) return null;

  if (!opts.allowMultipleRepeats) {
    let best = null;
    candidates.forEach((candidate) => {
      if (!best) {
        best = candidate;
        return;
      }
      if (candidate.score !== best.score) {
        best = candidate.score > best.score ? candidate : best;
        return;
      }
      if (candidate.constructs !== best.constructs) {
        best = candidate.constructs < best.constructs ? candidate : best;
        return;
      }
      if (compareRepeat(candidate, best) < 0) best = candidate;
    });
    return best ? { score: best.score, constructs: best.constructs, repeats: [best] } : null;
  }

  const sorted = [...candidates].sort((a, b) => {
    if (a.spanEnd !== b.spanEnd) return a.spanEnd - b.spanEnd;
    return a.start - b.start;
  });

  const ends = sorted.map((candidate) => candidate.spanEnd);
  const prevIndex = new Array(sorted.length).fill(-1);
  for (let i = 0; i < sorted.length; i += 1) {
    prevIndex[i] = binarySearchPrev(ends, sorted[i].start);
  }

  const dp = new Array(sorted.length);
  for (let i = 0; i < sorted.length; i += 1) {
    const include = buildPlanSet(sorted, prevIndex, dp, i);
    const exclude = i > 0 ? dp[i - 1] : buildEmptyPlanSet();
    dp[i] = betterPlanSet(include, exclude);
  }

  const best = dp[dp.length - 1];
  if (!best || !best.node) return null;
  return { score: best.score, constructs: best.constructs, repeats: nodeToList(best.node) };
}

function buildPlanSet(sorted, prevIndex, dp, i) {
  const prev = prevIndex[i] >= 0 ? dp[prevIndex[i]] : buildEmptyPlanSet();
  return {
    score: prev.score + sorted[i].score,
    constructs: prev.constructs + sorted[i].constructs,
    node: buildRepeatNode(sorted[i], prev.node),
  };
}

function buildEmptyPlanSet() {
  return { score: 0, constructs: 0, node: null };
}

function betterPlanSet(a, b) {
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (a.constructs !== b.constructs) return a.constructs < b.constructs ? a : b;
  return compareRepeatNodes(a.node, b.node) <= 0 ? a : b;
}

function compareRepeatNodes(aNode, bNode) {
  const a = nodeToList(aNode);
  const b = nodeToList(bNode);
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const cmp = compareRepeat(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

function buildRepeatNode(repeat, prev) {
  return { repeat, prev, list: null };
}

function nodeToList(node) {
  if (!node) return [];
  if (node.list) return node.list;
  const list = nodeToList(node.prev);
  node.list = list.concat(node.repeat);
  return node.list;
}

function binarySearchPrev(ends, start) {
  let low = 0;
  let high = ends.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (ends[mid] < start) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

function compareRepeat(a, b) {
  if (a.start !== b.start) return a.start - b.start;
  if (a.repeatLen !== b.repeatLen) return b.repeatLen - a.repeatLen;
  if (a.constructs !== b.constructs) return a.constructs - b.constructs;
  return a.spanEnd - b.spanEnd;
}

function buildFoldedPlan(repeats, originalLength) {
  const skip = new Array(originalLength).fill(false);
  repeats.forEach((repeat) => {
    repeat.skipRanges.forEach(([start, end]) => {
      for (let i = start; i <= end; i += 1) skip[i] = true;
    });
  });

  const foldedIndices = [];
  const indexMap = new Array(originalLength).fill(null);
  for (let i = 0; i < originalLength; i += 1) {
    if (!skip[i]) {
      indexMap[i] = foldedIndices.length;
      foldedIndices.push(i);
    }
  }

  const foldedRepeats = repeats.map((repeat) => {
    const start = indexMap[repeat.repeat.start];
    const end = indexMap[repeat.repeat.end];
    if (start === null || end === null) return null;

    const foldedVoltas = repeat.voltas.map((volta) => ({
      start: indexMap[volta.start],
      end: indexMap[volta.end],
      allowedPasses: [...volta.allowedPasses],
    }));

    return {
      start,
      end,
      times: repeat.repeat.times,
      voltas: foldedVoltas,
    };
  }).filter(Boolean);

  return {
    foldedIndices,
    plan: { repeats: foldedRepeats },
  };
}

function verifyPlan(originalFps, folded, opts) {
  const foldedFps = folded.foldedIndices.map((i) => originalFps[i]);
  const unrolledIndices = unrollPlan(folded.plan, foldedFps.length);
  const unrolledFps = unrolledIndices.map((i) => foldedFps[i]);
  if (arraysEqual(unrolledFps, originalFps)) return true;

  if (opts.log) {
    const diffIndex = firstDiffIndex(unrolledFps, originalFps);
    opts.log(`verification failed at ${diffIndex}`);
  }
  return false;
}

function segmentsEqual(fps, startA, startB, len) {
  for (let i = 0; i < len; i += 1) {
    if (fps[startA + i] !== fps[startB + i]) return false;
  }
  return true;
}

function spanHasBoundary(boundaries, start, end) {
  for (let i = start + 1; i <= end; i += 1) {
    if (boundaries[i] !== null && boundaries[i] !== undefined) return true;
  }
  return false;
}

function buildNextBoundary(boundaries) {
  const next = new Array(boundaries.length + 1).fill(null);
  let nearest = null;
  for (let i = boundaries.length - 1; i >= 0; i -= 1) {
    if (boundaries[i] !== null && boundaries[i] !== undefined) {
      nearest = i;
    }
    next[i] = nearest;
  }
  next[boundaries.length] = null;
  return next;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function firstDiffIndex(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { inferFoldPlan, unrollPlan };
} else if (typeof window !== 'undefined') {
  window.repeatInference = { inferFoldPlan, unrollPlan };
}
