# JSON → ASCII Guitar Tab Renderer

This Ruby script converts a guitar tab expressed in a structured JSON format into a readable **ASCII guitar tab**, inspired by classic tabbing conventions (see classtab.org).

It is designed for **machine-generated tabs** (e.g. Songsterr-like exports) and focuses on:

* musical correctness
* stable alignment
* compact output (repeat compression)
* readability in plain text

---

## Features

### 🎸 Guitar-oriented ASCII tab

* 6-string ASCII output with barlines
* String labels derived from tuning (no octave by default)
* Classic symbols for common techniques

### 🧮 Rhythm & structure

* Enforces **exact time-signature fill** per measure
  (pads with rests if a measure is short)
* Measures are numbered above the tab
* **Tempo changes** at measure starts render as labels above the tab
* Wraps output after *N rendered measures per line* (default: 8)

### 🔁 Repeat compression

* Detects **repeated measure sequences up to 16 measures**
* Greedy detection (longest repeats first)
* Renders compact repeats using:

  ```
  |: ... :| xN
  ```
* Automatically starts a new line after a repeat ends

### 🎼 Tuplets

* Supports tuplets via the `tuplet` beat field
* Renders **classic rail style** above the tab:

  ```
      ----3----
  ```
* Tuplet groups can be defined using:

  * `tupletStart` / `tupletStop`, or
  * consecutive beats with the same `tuplet` value

### 🤫 Palm mute / Let ring

Rendered as dedicated annotation lines above the strings:

* Palm mute (rail with leading `PM`):

  ```
  PM--------
  ```

* Let ring (text at first span + `~` rail):

  ```
  let ring~~~~~~~
  ```

### 🔗 Ties (sustain)

`tie: true` means the note is tied to the **previous** note (same string).

The renderer draws sustain by replacing the entire gap between the previous note and the tied note with `=`:

```
5====5
```

This is **continuous sustain**, not just a small prefix marker.

---

## Usage

```bash
ruby tab_decode.rb --json input.json
```

Options:

```bash
--per-line N    # number of rendered measures per line (default: 8)
```

---

## JSON Input Format

### Top-level structure

```json
{
  "automations": { "tempo": [ ... ] },
  "tuning": [59, 54, 50, 45, 40, 35],
  "measures": [ ... ]
}
```

* `tuning` is optional. If missing or invalid, standard tuning is used.
* `automations.tempo` (optional) holds tempo changes at **measure starts** (see below).

---

## Tempo Automation

Tempo changes can be supplied via `automations.tempo`. Each entry applies at the **start of a measure** and renders a label (left-aligned inside the measure box) above the tab, e.g. `Tempo 120`.

```json
"automations": {
  "tempo": [
    { "measure": 0, "position": 0, "bpm": 120, "type": 4 }
  ]
}
```

* `measure`: zero-based index where the change starts
* `position`: only `0` (measure start) is rendered; other positions are ignored
* `bpm`: tempo value that will be displayed
* Other fields (e.g. `type`, `linear`) are ignored for rendering

---

## Tuning

* `tuning` is an array of **6 MIDI note numbers**
* Order is **string 1 → string 6 (high → low)**

Example:

```json
"tuning": [59, 54, 50, 45, 40, 35]
```

Which corresponds to:

```
B3 – F#3 – D3 – A2 – E2 – B1
```

The tab margin prints note names (no octave by default), e.g.:

```
B F# D A E B
```

---

## Measures

```json
{
  "signature": [4, 4],
  "voices": [
    {
      "rest": false,
      "beats": [ ... ]
    }
  ],
  "marker": { "text": "Verse", "width": 123 }
}
```

* `signature` applies to this and following measures until changed
* Only `voices[0]` is used (one measure = one voice)
* `voices[0].rest: true` means a full-measure rest
* `marker.text` (if present) is printed before the chunk

---

## Beats

```json
{
  "notes": [ ... ],
  "type": 16,
  "duration": [1, 16],
  "dots": 0,
  "rest": false,

  "tuplet": 3,
  "tupletStart": true,
  "tupletStop": false,

  "beamStart": true,
  "beamStop": false,

  "palmMute": true,
  "letRing": false
}
```

### Beat fields

| Field                        | Meaning                                                |
| ---------------------------- | ------------------------------------------------------ |
| `duration`                   | Fraction of a whole note (e.g. `[1,16]`)               |
| `type`                       | Note type hint (4, 8, 16, …)                           |
| `rest`                       | Silence for this beat                                  |
| `tuplet`                     | Tuplet size (e.g. `3` for triplet)                     |
| `tupletStart` / `tupletStop` | Explicit tuplet boundaries                             |
| `palmMute`                   | Marks this beat as palm-muted (renders on PM line)     |
| `letRing`                    | Marks this beat as let-ring (renders on let ring line) |

---

## Notes

```json
{
  "string": 0,
  "fret": 5,
  "tie": true,
  "ghost": false,
  "dead": false,
  "hp": false,
  "slide": "shift",
  "rest": false
}
```

### Note fields

| Field            | Effect in tab                                     |
| ---------------- | ------------------------------------------------- |
| `string`         | 0 = high string, 5 = low string                   |
| `fret`           | Printed as a number                               |
| `dead`           | `x`                                               |
| `ghost`          | `(5)`                                             |
| `tie`            | Tied to **previous** note → gap rendered with `=` |
| `slide: "shift"` | `/`                                               |
| `rest`           | Note-level silence                                |

---

## Example Output (illustrative)

Tuplet + palm mute + let ring:

```
           ----3----
           PM--------
           let ring~~~~~~~
e |---5-7-8-----------|
B |-------------------|
G |-------------------|
D |-------------------|
A |-------------------|
E |-------------------|
```

Tie sustain:

```
e |---5====5----------|
```

Repeat compression:

```
|: ---- ---- ---- ---- :| x4
```

---

## Design Notes

* Repeat detection operates on **canonical musical content**, not metadata
* Markers and other non-musical fields do **not** affect repeat matching
* Tuplets / PM / let ring are rendered as annotation lines above the tab
* Output is ASCII and suitable for terminals, diffs, and version control

---

## Limitations / Future Work

* Only one voice per measure is supported (`voices[0]`)
* Hammer-on/pull-off markers are not currently rendered
* Beaming is not rendered (it can be added as an annotation line if desired)
* Ties are currently rendered **within a measure**; cross-measure ties would require carrying state across measures
