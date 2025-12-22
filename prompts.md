# Task: Implement a conversion from score-JSON to alphatext format

- you are working in this repository.
- your task is to implement **a conversion from score-JSON to alphatext format** so that files in score-JSON format can be rendered using the existing alphatext rendering code.
- clone this repository in a temp folder: https://github.com/CoderLine/alphaTabWebsite
- learn about the alphatext music score format by reading the files in the alphatex folder: alphaTabWebsite/tree/main/docs/alphatex
- learn about an other music score format, we'll call it score-JSON, by reading the files from the doc folder
- read index.html
- ignore any existing ruby code in the current repository
- implement a conversion from score-JSON to alphatext format as per the following specifications:
  - implement the conversion from score-JSON to alphatext in Typescript in a new file called jsonToAlphaText.ts
  - change index.html so that when loading a file, if the file is a JSON file then assume it is using the score-JSON format and convert it to alphatext format, then displays it using the existing alphatext rendering code
  - print an error message if the conversion fails or the input format is invalid and explaining what went wrong
  - make use of the following alphatext features when rendering the converted score:
    - \staff {tabs}
    - \tuning
    - \title - use the json file name replacing underscores with spaces and removing the extension
    - \artist - use the "name" field from the json file
    - \subtitle - use the "instrument" field from the json file
    - \track - use the "instrument" field from the json file


===


# Task: Implement provably-correct repeat & alternate-ending (volta) inference for music notation

You are working in this repository.
Your task is to implement **automatic inference of repeat signs and alternate endings (voltas)** from a fully **linear (unrolled)** sequence of measures.
You're writing a reusable inference engine that can be plugged into different score formats via adapters.
You'll use the inference engine in jsonToAlphaText.js to infer repeats/voltas before rendering the alphatext score.
You'll use the inference engine in a test adapter to verify correctness on synthetic test cases.

The result must be **provably correct**: every inferred fold must expand back to exactly the original score.

---

## 1) Goal

Given a linear sequence of measures:

* Detect opportunities for:
  * simple repeats `|: ... :|`
  * alternate endings (voltas) `1.` / `2.`
* Produce a **FoldPlan** describing repeat/volta constructs
* Integrate this plan into the rendering pipeline
* Guarantee that **unrolling the folded score reproduces the original measure sequence exactly**

This is **notation inference**, not audio analysis.

---

## 2) Core correctness invariant (MANDATORY)

### Round-trip invariant

For any input sequence `S`:

```
unroll(infer(S)) == S
```

If this cannot be proven for a candidate fold, it must be rejected.

**Prefer “no fold” over a risky fold.**

---

## 3) Architecture requirement: format-agnostic engine via pluggable fingerprinting

The inference engine must be **completely independent of score format**.

### A) Adapter interface (engine input)

The engine operates on an abstract “sequence of items” (measures) provided by an adapter:

```
len() -> int
fingerprint(i) -> Fingerprint        // string or bytes; equality defines measure equality
boundary_id(i) -> BoundaryID | nil   // hard boundary between i-1 and i
debug_label(i) -> string             // optional, for logs (“A”, “m12”, etc.)
```

The engine must **not** inspect concrete measure data directly.

### B) Boundaries

A non-nil `boundary_id(i)` represents a **hard boundary**:

* repeats and voltas must not cross it (unless an option enables it)
* typical boundaries: time signature, key, tempo, rehearsal marks

---

## 4) Formal unrolling semantics (definition of correctness)

Define a folded score as:

* Original measures `[0..N-1]`
* A `FoldPlan` containing:
  * `RepeatSpan { start, end, times=2 }`
  * Optional `VoltaSpan { start, end, allowed_passes }`

### Unrolling semantics (reference implementation)

```
unroll(plan, N):
  out = []

  emit measures before repeat normally

  for pass in 1..times:
    i = repeat.start
    while i <= repeat.end:
      if i begins a volta segment:
        if pass in allowed_passes:
          emit measures [volta.start .. volta.end]
        i = volta.end + 1
      else:
        emit measure i
        i += 1

  emit measures after repeat normally
```

All voltas must be:

* inside exactly one repeat
* non-overlapping
* ordered

This semantics defines **what “correct” means**.

---

## 5) Candidate generation (heuristic, permissive)

Generate candidate constructs:

### A) Simple repeats

* Identify repeated contiguous blocks `(a, b, L)` where:

  ```
  fingerprint[a..a+L) == fingerprint[b..b+L)
  ```
* Enforce `min_repeat_len` (default 2–4 measures)
* Reject if any hard boundary lies between `a` and `a+L` or `b` and `b+L`

### B) Volta candidates

Detect patterns of the form:

```
P + E1 + P + E2 + C
```

Where:

* `P` = common prefix
* `E1`, `E2` = divergent endings
* `C` = common continuation

Constraints:

* `len(P) >= min_prefix_len`
* `len(E1), len(E2) <= max_ending_len`
* Rejoin at `C` must be unambiguous
* No boundary crossing

Candidate generation may over-generate.

---

## 6) Candidate acceptance: PROVE-BY-CONSTRUCTION (MANDATORY)

**Never trust heuristics.**

For every candidate `FoldPlan`:

1. Compute:

   ```
   original_fps = [ fingerprint(i) for i in 0..N-1 ]
   unrolled_indices = unroll(plan, N)
   unrolled_fps = [ fingerprint(i) for i in unrolled_indices ]
   ```
2. Accept the plan **iff**:

   ```
   unrolled_fps == original_fps
   ```
3. Also verify boundary constraints are respected.

This verification step is the **proof of correctness**.

---

## 7) Selection & optimization (deterministic)

Multiple valid plans may exist.

### A) Scoring

Define a cost function:

* baseline: printing all measures normally
* savings for folded repeats
* penalties for:

  * repeat barlines
  * volta brackets
  * complexity

### B) Determinism

* Sort candidates by stable order:

  1. earlier start
  2. longer repeated span
  3. fewer constructs
* Break ties deterministically
* Repeated runs must yield identical results

DP over measure index is recommended.

---

## 8) Verification strategy

* Verify **each candidate construct**
* Verify the **final selected plan**
* If verification fails at any stage, fall back to “no fold”

---

## 9) Testing requirements

### A) Letters adapter (MANDATORY)

Provide a test-only adapter where:

```
Input:  A B C A B C D
fingerprint(i) = "A" | "B" | ...
boundary_id(i) = nil (unless explicitly inserted)
```

Use this adapter to write golden tests:

* Simple repeat:

  ```
  A B C A B C D
  => |: A B C :| D
  ```
* Volta:

  ```
  A B X A B Y D
  => |: A B [1: X] [2: Y] :| D
  ```
* Boundary stops fold
* Ambiguous cases rejected

### B) Property test (strongly recommended)

For many generated sequences:

```
unroll(infer(S)) == S
```

---

## 10) Real score adapter

Provide an adapter for the repo’s actual score format:

* Define a strict, stable `fingerprint(measure)`
* Define `boundary_id(i)` from musical metadata

---

## 11) Integration

* Renderer consumes `FoldPlan` to emit repeat bars + voltas
* Add verbose/debug logging explaining why candidates were accepted/rejected

---

## 12) Acceptance criteria

* All tests pass
* Letters fixtures demonstrate correct inference
* Alphatext scores render correct repeat/volta notation (\ro, \rc, \ae)
* The system is **provably safe**: no incorrect fold can be emitted

---

Proceed to implement.

