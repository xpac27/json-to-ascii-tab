# JSON Guitar Tab Format – Authoritative Specification

This document defines the JSON format used to represent a guitar tab, intended to be rendered into **ASCII guitar tablature**.

The format is optimized for:

* deterministic rendering
* repeat detection
* precise rhythmic alignment
* compatibility with classic ASCII tab notation

---

## Top-Level Object

```json
{
  "name": "Example Track",
  "partId": 0,
  "instrument": "Overdriven Guitar",
  "automations": { "tempo": [ ... ] },
  "tuning": [59, 54, 50, 45, 40, 35],
  "measures": [ ... ]
}
```

### Fields

| Field        | Type           | Required | Description                                    |
| ------------ | -------------- | -------- | ---------------------------------------------- |
| `name`       | string         | optional | Name of the part/track (used in header)        |
| `partId`     | int            | optional | Part index (used in header)                    |
| `instrument` | string         | optional | Instrument name (used in header)               |
| `automations`| object         | optional | Automation lanes (tempo supported)             |
| `tuning`     | array[int]     | optional | Guitar tuning expressed as 6 MIDI note numbers |
| `measures`   | array[measure] | required | Ordered list of measures                       |

---

## Tuning

```json
"tuning": [59, 54, 50, 45, 40, 35]
```

* Exactly **6 integers**
* Each value is a **MIDI note number**
* Order is **string 1 → string 6 (high → low)**

Example interpretation:

| MIDI | Note |
| ---: | ---- |
|   59 | B3   |
|   54 | F#3  |
|   50 | D3   |
|   45 | A2   |
|   40 | E2   |
|   35 | B1   |

If `tuning` is missing or invalid, **standard tuning** is assumed.

---

## Tempo Automation

Tempo changes are provided via `automations.tempo`. Each entry applies at the **start of a measure** and renders a left-aligned label inside that measure’s box above the tab (e.g. `Tempo 120`).

```json
"automations": {
  "tempo": [
    { "measure": 0, "position": 0, "bpm": 120, "type": 4 }
  ]
}
```

### Tempo fields

| Field     | Type    | Required | Description                               |
| --------- | ------- | -------- | ----------------------------------------- |
| `measure` | int     | yes      | Zero-based measure index of the change    |
| `position`| int     | optional | Only `0` (measure start) is rendered      |
| `bpm`     | number  | yes      | Tempo value displayed in the label        |
| `type`    | int     | optional | Ignored for rendering                     |
| `linear`  | boolean | optional | Ignored for rendering                     |

Notes:
* Entries with `position` other than `0` are ignored by the renderer.
* Multiple tempo changes in one measure are deduped by their BPM for display.
* Other automation lanes are currently ignored.

---

## Metadata Header

If `instrument`, `partId`, or `name` are present, a header line is printed in a boxed banner above the tab, followed by a blank line:

```
+--------------------------------------------+
| Example Track - Overdriven Guitar (part 0) |
+--------------------------------------------+
```

Fields are optional; missing values are skipped.

---

## Measures

```json
{
  "signature": [4, 4],
  "voices": [ ... ],
  "marker": { "text": "Verse" }
}
```

### Measure fields

| Field       | Type            | Required | Description                                            |
| ----------- | --------------- | -------- | ------------------------------------------------------ |
| `signature` | array[int, int] | optional | Time signature applying to this and following measures |
| `voices`    | array[voice]    | required | Voices in the measure (only voice 0 is used)           |
| `marker`    | object          | optional | Annotation text for the measure                        |

### Notes

* If `signature` is omitted, the previous signature continues.
* Each measure **must fill exactly the duration defined by the signature**.
* If the provided beats are too short, the renderer **pads with rests**.
* If too long, extra content is **clipped**.

---

## Marker

```json
"marker": {
  "text": "Chorus",
  "width": 123
}
```

Only `marker.text` is semantically meaningful.
It is rendered as a comment above the tab block.

---

## Voices

```json
{
  "rest": false,
  "beats": [ ... ]
}
```

### Voice fields

| Field   | Type        | Required | Description                           |
| ------- | ----------- | -------- | ------------------------------------- |
| `rest`  | boolean     | optional | If true, the entire measure is silent |
| `beats` | array[beat] | optional | Rhythmic content of the measure       |

### Rules

* Only **voices[0]** is rendered.
* If `rest: true`, beats are ignored and the measure is silent.

---

## Beats

```json
{
  "notes": [ ... ],
  "duration": [1, 16],
  "type": 16,
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

| Field         | Type            | Required | Description                              |
| ------------- | --------------- | -------- | ---------------------------------------- |
| `notes`       | array[note]     | optional | Notes played simultaneously              |
| `duration`    | array[int, int] | required | Fraction of a whole note (e.g. `[1,16]`) |
| `type`        | int             | optional | Note type hint (4, 8, 16, 32…)           |
| `dots`        | int             | optional | Number of rhythmic dots                  |
| `rest`        | boolean         | optional | Beat-level silence                       |
| `tuplet`      | int             | optional | Tuplet size (e.g. `3` for triplets)      |
| `tupletStart` | boolean         | optional | Explicit start of tuplet group           |
| `tupletStop`  | boolean         | optional | Explicit end of tuplet group             |
| `beamStart`   | boolean         | optional | Start of a beamed fast-note group        |
| `beamStop`    | boolean         | optional | End of a beamed group                    |
| `palmMute`    | boolean         | optional | Beat is palm-muted                       |
| `letRing`     | boolean         | optional | Notes are allowed to ring                |

Notes:
* When `dots` is used, some data sources encode the dotted value directly in `duration` (e.g. `duration: [3,8]` with `dots: 1` for a dotted quarter). Consumers should treat this as a dotted base duration rather than rejecting the numerator.

### Tuplet semantics

* If `tupletStart` / `tupletStop` are present, they define the group.
* Otherwise, **consecutive beats with the same `tuplet` value** form a group.
* Tuplets are rendered as **classic rails above the tab**, e.g.:

```
    ----3----
```

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

| Field    | Type    | Required | Description                    |
| -------- | ------- | -------- | ------------------------------ |
| `string` | int     | required | 0 = highest string, 5 = lowest |
| `fret`   | int     | optional | Fret number                    |
| `rest`   | boolean | optional | Note-level silence             |
| `dead`   | boolean | optional | Dead note (`x`)                |
| `ghost`  | boolean | optional | Ghost note (`(5)`)             |
| `tie`    | boolean | optional | **Tied to the previous note**  |
| `hp`     | boolean | optional | Hammer-on / pull-off hint      |
| `slide`  | string  | optional | `"shift"` indicates slide      |

---

## **Important Correction: Tie Semantics**

> ⚠️ **`tie: true` means the note is tied to the PREVIOUS note**, not the next one.

### Rendering behavior

* If a note has `tie: true` **and there was a previous note on the same string**:

  * The gap between the previous note and this note is rendered using `=` characters
  * This produces a **continuous sustain**, e.g.:

```
5====5
```

* The sustain length matches the actual rhythmic spacing.
* Ties are **string-local** (do not cross strings).

---

## Palm Mute & Let Ring Rendering

These are **beat-level effects**, rendered as annotation lines above the strings.

### Palm Mute

* A rail of `-` spanning palm-muted beats
* Prefixed with `PM` at the first occurrence

```
PM--------
```

### Let Ring

* A rail of `~` spanning let-ring beats
* Prefixed with the text `let ring` at the first occurrence

```
let ring~~~~~~~
```

---

## Repeat Semantics (Rendering-Level)

While repeats are not explicit in JSON:

* Measures are compared using a **canonical musical representation**
* Metadata such as markers and layout hints are ignored
* Repeated sequences up to **16 measures** are detected
* Rendered using:

```
|: ... :| xN
```

---

## Design Constraints (Important for Tools)

* Every measure must render to **exactly its time-signature duration**
* All rendering is **monospaced ASCII**
* Alignment and spacing are musically meaningful
* Canonical comparison must ignore:

  * markers
  * visual-only metadata
  * non-musical fields

---

## Summary for Tool Authors / ChatGPT Instances

When working on this format or renderer:

* Treat `tie` as **tie-to-previous**
* Enforce time signatures strictly
* Use MIDI numbers for tuning
* Tuplets, PM, let ring are **annotation rails**, not timing changes
* Repeat detection is **content-based**, not structural
