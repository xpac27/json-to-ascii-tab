# JSON → ASCII Guitar Tab Renderer

This Ruby script converts a guitar tab expressed in a structured JSON format into a readable **ASCII guitar tab**, following classic tabbing conventions.

It is designed for **machine-generated tabs** (e.g. Songsterr-like exports) and focuses on:

* musical correctness
* stable alignment
* compact output (repeat compression)
* readability in plain text

---

## Features

### 🎸 Guitar-oriented ASCII tab

* 6-string guitar output
* Classic ASCII layout (`|----|`)
* Configurable tuning (via MIDI note numbers)
* String labels derived automatically from tuning

### 🧮 Rhythm & structure

* Enforces **exact time-signature fill** per measure
  (pads with rests if a measure is short)
* Supports:

  * rests
  * dead notes (`x`)
  * ghost notes (`(5)`)
  * ties (`~`)
  * slides (`/`)
* Measures are numbered above the tab

### 🔁 Repeat compression

* Detects **repeated measure sequences up to 16 measures**
* Greedy detection (longest repeats first)
* Outputs compact repeats using:

  ```
  |: ... :| xN
  ```
* Nested repeats supported
* Automatically starts a new line after a repeat ends

### 🎼 Tuplets

* Supports tuplets via the `tuplet` field in JSON
* Uses **classic tab notation**:

  ```
      ---3---
  ```
* Tuplets can be defined using:

  * `tupletStart` / `tupletStop`, or
  * consecutive beats with the same `tuplet` value
* Tuplet annotations appear above the tab lines

### 📐 Layout

* Wraps output after *N measures per line* (default: 8)
* Configurable via CLI
* Keeps all alignment stable even with annotations

---

## Usage

```bash
ruby json_to_ascii_tab.rb --json input.json
```

Optional parameters:

```bash
--per-line N    # number of measures per line (default: 8)
```

---

## JSON Input Format

### Top-level structure

```json
{
  "tuning": [59, 54, 50, 45, 40, 35],
  "measures": [ ... ]
}
```

### Tuning

* Array of **6 MIDI note numbers**
* Order: **string 1 → string 6 (high → low)**
* Example:

| MIDI | Note |
| ---: | ---- |
|   59 | B3   |
|   54 | F#3  |
|   50 | D3   |
|   45 | A2   |
|   40 | E2   |
|   35 | B1   |

Rendered string labels:

```
B F# D A E B
```

If `tuning` is missing or invalid, standard tuning is used.

---

## Measure format

```json
{
  "signature": [4, 4],
  "voices": [
    {
      "beats": [ ... ]
    }
  ]
}
```

* `signature` applies to this and following measures until changed
* Only `voices[0]` is used (one measure = one voice)

---

## Beat format

```json
{
  "duration": [1, 16],
  "type": 16,
  "tuplet": 3,
  "tupletStart": true,
  "notes": [ ... ]
}
```

### Beat fields

| Field                        | Meaning                                  |
| ---------------------------- | ---------------------------------------- |
| `duration`                   | Fraction of a whole note (e.g. `[1,16]`) |
| `type`                       | Note type (4, 8, 16, …)                  |
| `rest`                       | Silence                                  |
| `tuplet`                     | Tuplet size (e.g. `3` for triplet)       |
| `tupletStart` / `tupletStop` | Explicit tuplet boundaries               |
| `palmMute`, `letRing`        | Parsed (not visually rendered yet)       |

---

## Note format

```json
{
  "string": 0,
  "fret": 5,
  "tie": true,
  "ghost": false,
  "dead": false,
  "hp": true,
  "slide": "shift"
}
```

| Field            | Effect in tab                   |
| ---------------- | ------------------------------- |
| `string`         | 0 = high string, 5 = low string |
| `fret`           | Printed as number               |
| `dead`           | `x`                             |
| `ghost`          | `(5)`                           |
| `tie`            | `~`                             |
| `hp`             | Hammer-on / pull-off            |
| `slide: "shift"` | `/`                             |

---

## Example Output

```
        ---3---
e |---5-7-8---|
B |-----------|
G |-----------|
D |-----------|
A |-----------|
E |-----------|
```

With repeats:

```
|: ---- ---- ---- ---- :| x4
```

---

## Design Notes

* Repeat detection works on **canonical musical content**, not metadata
* Markers, layout hints, and annotations do **not** affect repeat matching
* Tuplets are rendered purely as annotations and do not affect timing
* Output is fully ASCII and suitable for terminals, diffs, and version control

---

## Limitations / Future Work

* Only one voice per measure is supported
* No chord-name rendering yet
* No support for bends or vibrato notation (could be added)
