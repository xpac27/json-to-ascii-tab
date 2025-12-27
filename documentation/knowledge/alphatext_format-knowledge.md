# AlphaText Format - Quick Knowledge Notes

This note summarizes the AlphaText syntax needed for score conversion in this repo.
It is not a full spec; refer to alphaTab docs for details.

## General Structure

An AlphaText file is a sequence of metadata tags and bars.
Bars (measures) end with `|`.

Example:

\title "Song Title"
\track "Track Name"
  \staff {tabs}
  \tuning (E4 B3 G3 D3 A2 E2)
  :4 0.6 2.5 2.4 | 0.6 2.5 2.4 |

## Metadata Tags

- `\title "..."` song title.
- `\artist "..."` song artist.
- `\subtitle "..."` subtitle (used here for instrument).
- `\track "..."` starts a track. Optional name.
- `\staff {tabs}` selects tab staff for stringed instruments.
- `\tuning (E4 B3 G3 D3 A2 E2)` defines string tuning (note names with octave).
- `\ts N D` sets time signature (e.g. `\ts 4 4`) and can be placed before the first beat of a bar.
- `\multiBarRest` enables AlphaTab multi-bar rests for consecutive empty measures. The converter emits it
  globally and again after each `\track` to ensure per-track activation.
- `\ro ()` starts a repeat section (repeat open). The empty argument list avoids ambiguity
  when a bar begins with a chord `(` after the tag.
- `\rc N` ends a repeat section and sets the repeat count (e.g. `\rc 2`).
- `\ae (N ...)` marks the bar to be played on the listed repeat endings (alternate endings).

Example:

`\ro 1.3 2.3 3.3 4.3 | \ae (1 2) 5.3 6.3 7.3 8.3 | \ae 3 \rc 3 4.3 5.3 6.3 7.3`

## Beats

Beat syntax is:

content .duration {properties}

- Content can be a single note (`3.2`), a chord group (`(3.2 2.3 0.4)`), or `r` for rest.
- Duration is a power-of-two value (1,2,4,8,16...) and is written after a dot.
  Example: `3.2.8` is an 8th note on string 2, fret 3.

### Tuplets

Tuplets are encoded using the beat property `tu`:

`3.2.8 {tu 3}`

This indicates triplets in AlphaText. The converter uses this when the JSON beat has `tuplet`.

### Dots

Dots are encoded as beat properties:

- `{d}` for single dot
- `{dd}` for double dot

Example: `3.2.4 {d}` for a dotted quarter.

### Tempo

Tempo changes are encoded using `\tempo N` at the start of a measure.

## Notes

For tab staff, notes are expressed as `fret.string`.
String is 1-based in AlphaText (string 1 is the highest string).

### Note Properties (used here)

The JavaScript converter currently omits note-level properties (`g`, `h`, tie markers, etc.)
and beat-level palm mute/let ring to avoid AlphaText parser errors with note-duration tokens.

### Ties

This converter currently renders tied notes as repeated fret values (no explicit tie markers),
since AlphaTab rejects both `-` and `{t}` in the JSON-derived output for these files.

## Comments

`//` and `/* ... */` comments are allowed anywhere.
