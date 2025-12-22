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

Tempo changes are encoded as beat properties:

`3.2.4 {tempo 120}`

In this repo, tempo is only attached to beats at measure start.

## Notes

For tab staff, notes are expressed as `fret.string`.
String is 1-based in AlphaText (string 1 is the highest string).

### Note Properties (used here)

- `g` ghost note
- `h` hammer-on / pull-off
- `pm` palm mute
- `lr` let ring

Properties are attached in braces after the note:

`3.2{pm}` or `(3.2{pm} 2.3{pm})`

### Ties

Tied notes can be represented using `-` in place of the fret:

`-.2`

AlphaTab infers the tie target from the previous note on the same string.
This converter uses `-` only when a prior note exists on the same string.

## Comments

`//` and `/* ... */` comments are allowed anywhere.

