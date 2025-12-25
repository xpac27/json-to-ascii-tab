# Agent Handbook

## Purpose
Render structured JSON guitar tabs to ASCII with repeats, tuplets, palm mute / let ring rails, tie-to-previous sustain, tempo labels at measure starts, and optional metadata header banner.

## Directory Structure
- `extras/tests` - test cases and fixtures
- `doc` - documentation, JSON format spec, examples
- `tabs` - IGNORE THIS FOLDER
- `extras/json_to_ascii_tab.rb` - main conversion script
- `README.md` - overview and usage instructions

## Default Flow for Changes
- Implement the code change (usually in `extras/json_to_ascii_tab.rb`); keep defaults (4/4, standard tuning) intact.
- If behavior/output changes, suggest the required edits to `documentation/examples/example.json` accordingly. Wait for the user to confirm the changes.
- Sync tests with fixtures: update `extras/tests/example_test.rb` to assert new behavior. Consider adding tests and ask the user if you find relevant ones.
- Run tests: `ruby -Iextras/tests extras/tests/example_test.rb` plus other tests from the `extras/tests/` folder.
- Fix code/fixtures until tests pass.
- Refresh docs:
  - `README.md` (feature notes, rendered example snippet if output changed)
  - `documentation/knowledge/json_format-knowledge.md` (spec/semantics)
  - `documentation/schema/format.json.schema` (schema alignment)
- Don't commit, let the user review and commit.

## Committing Changes
- Commit only after user review.
- You can't commit due to gpg issues, so when asked to commit, just prepare the commit (add files) and ask the user to commit for you by providing the command.

## Key Semantics
- `tie: true` ties **to previous note** on the same string; sustain gap rendered with `=`.
- Tempo automation: only `automations.tempo` entries at measure start (`position` 0/`nil`) render a left-aligned `Tempo <bpm>` label.
- Header banner: built from `name`, `instrument`, `partId` → `Name - Instrument (part N)` boxed with a blank line after.
- Measures enforce exact signature fill: pad with rest if short, clip if long; only `voices[0]` is rendered.

## Style/Notes
- ASCII only; keep comments minimal and meaningful.
- Repeat detection is content-based (canonicalized measures) up to 16 measures.
- Use `rg` for searching; avoid destructive git commands.
