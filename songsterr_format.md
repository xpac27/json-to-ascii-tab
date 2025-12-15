You are going to write a ruby script that decodes a tab expressed in a JSON format. I uploaded an example JSON.

Here is the specification of the format:

- tuning: MIDI note numbers, should be converted to pitch names
- measures
  - signature: the signature of the following measures, ex: 4/4
  - voices: each voice is 1 measure, of length defined by the signature
    - rest: if true means silence for the whole measure
    - marker: annotation text to be displayed at the beginning of the measure
    - beats
      - notes: a set of notes to play at once on the guitare
        - fret: on which fret is the note
        - string: on which string is the note
        - tie: if true then the note is note tied to the previous note
        - hp: if true then the note is
          - a hammer-on if the next one has higher fret value
          - a pull-off if the next one has lower fret value
        - slide:
          - if "shift" then the note is slide
        - rest: if true this is a silence
        - ghost: means the note is a ghost note
        - dead: means the note is a dead note
      - type: the length of the note
        - if 4 then fourth note
        - if 8 then eight note
        - if 16 then sixteenth note
      - tuplet: if present then the note is part of a tuplet and its value is the length of the tuplet the note is part of
      - palmMute: if true then the note is palm muted
      - letRing: if true then the note is let ring
      - rest: if true this is a silence
      - duration: length of the notes expressed in fraction by two digits, ex: [1, 16] means 1/16th.
      - dots: number of dots for the note
      - beamStart: if true means beginning of a series of fast notes
        - if type is 8 then eighth notes sequence
        - if type is 16 then sixteenth note 
        - if type is 32 then thirtytwoth note
      - beamStop: if true means end of the current sequence

You need to follow the ASCII tab specification defined here: https://www.classtab.org/tabbing.htm
You need to enforce exact signature fill (pad with rests if a measure is short) so that each measure has the length (exact number of beats defined by the signature).
You need to enabling returning to a new line after 8 measures by default and that can be configured by a parameter.
You need to use repeat signs when the same measures sequence is repeated. Support detecting up to 16 measures long sequences being repeated. Start by detecting larger sequences (16 measures) down to single measure being repeated. You can use |: and end by using :| for nested repeats.
You need to write the measure number at the beginning of each measure (above the measure).

Todo:
- generate the ruby script according to the specs provided above
- run this code in a ruby environment with the provided JSON as input
- fix any error you found when running the code
- show the output produced by running the code
- print the final ruby script
