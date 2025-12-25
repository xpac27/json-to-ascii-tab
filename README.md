# Tablioscope

[Try it live](https://xpac27.github.io/tablioscope/)

Single-page score viewer.

Loads a file from your machine and renders it in the browser using [AlphaTab](https://www.alphatab.net/). The page is geared for quick inspection of exported tabs and scores without installing a full editor.

Supported file formats (as accepted by the page input):
- Guitar Pro: .gp, .gp3, .gp4, .gp5, .gpx
- PowerTab: .ptb
- MusicXML: .xml, .mxl, .musicxml
- AlphaText: .atext
- JSON score: .json

## Usage

Run the cucumber tests:

```bash
bundle exec cucumber
```

## Extras folder

`extras/` contains the Ruby conversion scripts and small helpers used for local format experiments. These are optional for the web viewer and can be run directly from the command line if you want to generate or inspect output in the terminal.

## Licenses

- AlphaTab is a third-party library; see https://www.alphatab.net/ for licensing and usage terms.
- The bundled soundfont used by the web player is referenced from jsDelivr and carries an Apache 2.0 license: https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.7.1/dist/soundfont/LICENSE
- Repo licensing: no explicit LICENSE file is present in this repository; add one if you want to clarify reuse terms.
