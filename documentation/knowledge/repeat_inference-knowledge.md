# Repeat/Volta Inference Engine (Format-Agnostic)

This repo includes a format-agnostic repeat/volta inference engine that folds
an unrolled measure sequence into a compact plan that is guaranteed to unroll
back to the original sequence.

## Location

- Implementation: `docs/repeat_inference.js`
- Letter fixtures test: `extras/tests/repeat_inference_test.js`

## Purpose

Given a fully linear sequence of measures, infer:

- Simple repeats (`|: :|`)
- Voltas / alternate endings (`1.` / `2.`)

with correctness guaranteed by verification:

```
unroll(infer(S)) == S
```

## Adapter Interface

The engine is format-agnostic and depends on an adapter:

```
len() -> int
fingerprint(i) -> string
boundary_id(i) -> any | null
debug_label(i) -> string (optional)
```

Only `fingerprint` equality is used for measure identity. `boundary_id` defines
hard boundaries (time signature, key, tempo, rehearsal marks, etc.) that block
folding across them.

## Main API

- `inferFoldPlan(adapter, options)`
  - returns `{ foldedIndices, plan }`
  - `plan` is `null` if no safe fold is found
- `unrollPlan(plan, measureCount)`
  - returns the measure index sequence produced by the plan

`plan` contains one or more repeat spans:

```
{
  repeats: [
    { start, end, times, voltas: [ { start, end, allowedPasses } ] }
  ]
}
```

## Candidate Generation

Two candidate types are enumerated:

1) Simple repeats: contiguous duplicate blocks

```
fps[a..a+L) == fps[b..b+L)
```

2) Voltas: shared prefix with divergent endings

```
P + E1 + P + E2 + C
```

Candidates are rejected if they cross boundaries or fail minimum length limits.

## Verification (Proof by Construction)

Each candidate is verified by unrolling the folded indices and comparing the
resulting fingerprint sequence to the original. Only verified candidates are
eligible for selection.

## Deterministic Selection

Candidates are sorted by:

1) Score (savings - construct penalty)
2) Earliest repeat start
3) Longest repeated span
4) Fewer constructs
5) Earliest end

When multiple non-overlapping repeats are present, a deterministic interval
selection chooses the best non-overlapping set.

Multi-pass repeats (e.g. x3, x4) are supported for simple repeats.

## AlphaText Integration

`docs/jsonToAlphaText.js` integrates the engine:

- Canonical fingerprints are built from normalized beats plus the active signature.
- Hard boundaries are enforced for signature changes, tempo at measure start, and markers.
- `\ro`, `\rc N`, and `\ae` tags are injected into AlphaText output.

Options:

- `inferRepeats` (default `true`): disable repeat inference when `false`.
- `maxRepeatLen` (default `16`): maximum repeated block length for inference.
- `minRepeatLen` (default `1` for AlphaText integration): minimum repeated block length.

## Test Coverage

The letter fixture test covers:

- Simple repeat: `A B C A B C D`
- Volta: `A B X A B Y D`
- Boundary stops folding

Run via:

```
node extras/tests/repeat_inference_test.js

Additional integration coverage:

```
node extras/tests/json_to_alphatex_repeat_test.js
```
```
