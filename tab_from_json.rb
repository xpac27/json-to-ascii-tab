#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'optparse'

DEFAULT_SIGNATURE = [4, 4].freeze
DEFAULT_TUNING_MIDI = [64, 59, 55, 50, 45, 40].freeze # E4 B3 G3 D3 A2 E2 (high -> low)

COLUMNS_PER_SIXTEENTH = 3
SEPARATOR_WIDTH = 2

MeasureRep = Struct.new(
  :measure_index, :signature, :beats, :marker_text, :raw, :canon,
  keyword_init: true
)

RepeatBlock = Struct.new(:start, :len, :count, keyword_init: true)

RenderUnit = Struct.new(
  :kind,
  :measure,
  :repeat_start,
  :repeat_end,
  keyword_init: true
)

module Util
  module_function

  NOTE_NAMES_SHARP = %w[C C# D D# E F F# G G# A A# B].freeze

  def midi_to_note_name(midi, with_octave: true)
    m = midi.to_i
    name = NOTE_NAMES_SHARP[m % 12]
    return name unless with_octave
    octave = (m / 12) - 1
    "#{name}#{octave}"
  end

  def rational_from_fraction(arr)
    return Rational(0, 1) if arr.nil? || arr.empty?
    Rational(arr[0].to_i, arr[1].to_i)
  end

  def measure_total_duration(sig)
    num, den = sig
    Rational(num, den)
  end

  def duration_to_cols(duration_r)
    (duration_r * 16 * COLUMNS_PER_SIXTEENTH).to_i
  end

  def deep_sort(obj)
    case obj
    when Hash
      obj.keys.sort.each_with_object({}) { |k, h| h[k] = deep_sort(obj[k]) }
    when Array
      obj.map { |v| deep_sort(v) }
    else
      obj
    end
  end

  def center_text(text, width)
    t = text.to_s
    return t[0, width] if t.length >= width
    left = (width - t.length) / 2
    right = width - t.length - left
    (' ' * left) + t + (' ' * right)
  end
end

class TabRenderer
  def initialize(measures, measures_per_line: 8, string_names:)
    @measures = measures
    @measures_per_line = measures_per_line
    @string_names = string_names
  end

  def render
    blocks = detect_repeats(@measures, max_len: 16)
    units = build_units(@measures, blocks)

    out = []
    chunks = []
    cur = []

    # Wrap at per-line limit AND after repeat ends
    units.each do |u|
      cur << u
      if cur.length >= @measures_per_line || u.repeat_end
        chunks << cur
        cur = []
      end
    end
    chunks << cur unless cur.empty?

    chunks.each do |chunk|
      marker_texts = chunk.map { |u| u.measure&.marker_text }.compact
      marker_texts.each { |mt| out << "# #{mt}" } unless marker_texts.empty?

      lines = Array.new(6) { +"" }
      num_line = +""
      tuplet_line = +""
      any_tuplets = false

      chunk.each do |u|
        m = u.measure

        sep_left = u.repeat_start ? "|:" : "| "
        sep_right = u.repeat_end ? ":|" : "| "

        rendered, tuplet_annot = render_measure(m)
        width = rendered.map(&:length).max

        rendered.map! { |s| s.ljust(width, '-') }
        tuplet_annot = tuplet_annot.ljust(width, ' ')
        any_tuplets ||= (tuplet_annot.strip.length > 0)

        measure_box_width = SEPARATOR_WIDTH + width + SEPARATOR_WIDTH
        num_line << Util.center_text((m.measure_index + 1).to_s, measure_box_width)

        tuplet_line << sep_left.ljust(SEPARATOR_WIDTH)
        tuplet_line << tuplet_annot
        tuplet_line << sep_right.ljust(SEPARATOR_WIDTH)

        6.times do |si|
          lines[si] << sep_left.ljust(SEPARATOR_WIDTH)
          lines[si] << rendered[si]
          lines[si] << sep_right.ljust(SEPARATOR_WIDTH)
        end

        if u.repeat_end
          rb = u.repeat_end
          num_line << " x#{rb.count}"
          pad = 3 + rb.count.to_s.length
          tuplet_line << (' ' * pad)
          lines.map! { |ln| ln + (' ' * pad) }
        end
      end

      prefix_width = @string_names.map(&:length).max
      out << num_line
      out << (" " * prefix_width + tuplet_line) if any_tuplets
      6.times do |si|
        out << format("%-#{prefix_width}s%s", @string_names[si], lines[si])
      end
      out << ""
    end

    out.join("\n")
  end

  private

  # Now returns [lines6, tuplet_annotation_line]
  def render_measure(m)
    sig = m.signature
    beats = m.beats

    if beats.nil? || beats.empty? || m.raw.dig('voices', 0, 'rest')
      cols = Util.duration_to_cols(Util.measure_total_duration(sig))
      return [Array.new(6) { '-' * cols }, ' ' * cols]
    end

    total_needed = Util.measure_total_duration(sig)
    total_have = beats.sum { |b| Util.rational_from_fraction(b['duration']) }

    if total_have < total_needed
      pad = total_needed - total_have
      beats = beats + [{
        'rest' => true,
        'notes' => [{ 'rest' => true }],
        'duration' => [pad.numerator, pad.denominator]
      }]
    end

    # Clip if too long
    acc = Rational(0, 1)
    clipped = []
    beats.each do |b|
      d = Util.rational_from_fraction(b['duration'])
      break if acc >= total_needed
      if acc + d <= total_needed
        clipped << b
        acc += d
      else
        remaining = total_needed - acc
        clipped << { 'rest' => true, 'notes' => [{ 'rest' => true }], 'duration' => [remaining.numerator, remaining.denominator] }
        acc = total_needed
      end
    end

    lines = Array.new(6) { +"" }

    # Track beat column spans so we can draw tuplet brackets
    beat_spans = [] # {start:, stop:, beat:}
    cur_col = 0

    clipped.each_with_index do |beat, bi|
      duration_r = Util.rational_from_fraction(beat['duration'])
      cols = [Util.duration_to_cols(duration_r), 1].max

      next_beat = clipped[bi + 1]
      tokens = tokens_for_beat(beat, next_beat)
      token_width = tokens.map(&:length).max
      event_cols = [cols, token_width].max

      beat_spans << { start: cur_col, stop: cur_col + event_cols, beat: beat }
      cur_col += event_cols

      6.times do |si|
        tok = tokens[si]
        lines[si] << tok
        lines[si] << ('-' * (event_cols - tok.length))
      end
    end

    tuplet_annot = build_tuplet_annotation(beat_spans, cur_col)
    [lines, tuplet_annot]
  end

  def build_tuplet_annotation(beat_spans, total_cols)
    line = Array.new(total_cols, ' ')
    i = 0

    while i < beat_spans.length
      beat = beat_spans[i][:beat]
      t = beat['tuplet']
      t = t.to_i if t
      if t.nil? || t <= 1
        i += 1
        next
      end

      start_i = i
      end_i = nil

      if beat['tupletStart']
        j = i
        j += 1 while j < beat_spans.length && !beat_spans[j][:beat]['tupletStop']
        end_i = [j, beat_spans.length - 1].min
      else
        j = i + 1
        while j < beat_spans.length
          bj = beat_spans[j][:beat]
          break if bj['tuplet'].to_i != t
          break if bj['tupletStart']
          j += 1
        end
        end_i = j - 1
      end

      span_start = beat_spans[start_i][:start]
      span_stop  = beat_spans[end_i][:stop] # exclusive
      span_stop = [span_stop, total_cols].min
      span_len = span_stop - span_start

      # Need enough room to draw something meaningful
      if span_len >= 3
        # Draw a horizontal rail. Leave one space margin if possible so it doesn't "kiss" barlines.
        rail_start = span_start
        rail_stop  = span_stop

        if rail_stop - rail_start >= 5
          rail_start += 1
          rail_stop  -= 1
        end

        (rail_start...rail_stop).each do |pos|
          line[pos] = '-'
        end

        # Place the tuplet number centered on the rail, replacing dashes.
        num = t.to_s
        num_pos = rail_start + ((rail_stop - rail_start) / 2) - (num.length / 2)
        num_pos = [[num_pos, rail_start].max, rail_stop - num.length].min

        num.chars.each_with_index do |ch, k|
          pos = num_pos + k
          line[pos] = ch if pos >= 0 && pos < total_cols
        end
      end

      i = end_i + 1
    end

    line.join
  end

  def tokens_for_beat(beat, next_beat)
    return Array.new(6, '-') if beat['rest']
    notes = (beat['notes'] || [])
    return Array.new(6, '-') if notes.empty? || notes.all? { |n| n['rest'] }

    tokens = Array.new(6, '-')
    notes.each do |n|
      next if n['rest']
      si = n['string']
      next if si.nil? || si < 0 || si > 5
      tokens[si] = note_token(n, next_beat)
    end
    tokens
  end

  def note_token(note, next_beat)
    base = note['dead'] ? 'x' : note.fetch('fret', 0).to_s
    base = "(#{base})" if note['ghost']
    base += '~' if note['tie']
    base += '/' if note.dig('slide') == 'shift'
    base
  end

  def detect_repeats(measures, max_len: 16)
    canon = measures.map(&:canon)
    i = 0
    blocks = []

    while i < canon.length
      best = nil
      [max_len, canon.length - i].min.downto(1) do |len|
        seq = canon[i, len]
        count = 1
        while i + count * len + len <= canon.length && canon[i + count * len, len] == seq
          count += 1
        end
        next if count < 2
        best = RepeatBlock.new(start: i, len: len, count: count)
        break
      end

      if best
        blocks << best
        i += best.len * best.count
      else
        i += 1
      end
    end

    blocks
  end

  def build_units(measures, blocks)
    block_at = {}
    blocks.each { |b| block_at[b.start] = b }

    units = []
    i = 0
    while i < measures.length
      b = block_at[i]
      if b
        (0...b.len).each do |k|
          units << RenderUnit.new(
            kind: :measure,
            measure: measures[i + k],
            repeat_start: (k == 0),
            repeat_end: (k == b.len - 1) ? b : nil
          )
        end
        i += b.len * b.count
      else
        units << RenderUnit.new(kind: :measure, measure: measures[i], repeat_start: false, repeat_end: nil)
        i += 1
      end
    end
    units
  end
end

options = { per_line: 8 }

OptionParser.new do |opts|
  opts.banner = "Usage: tab_decode.rb --json FILE [--per-line N]"
  opts.on('--json FILE', 'Input JSON file') { |v| options[:json] = v }
  opts.on('--per-line N', Integer, 'Rendered measures per output line (default 8)') { |v| options[:per_line] = v }
end.parse!

abort("Missing --json FILE") if options[:json].nil?

json = JSON.parse(File.read(options[:json]))

tuning = json['tuning']
tuning = DEFAULT_TUNING_MIDI if !tuning.is_a?(Array) || tuning.length != 6
string_names = tuning.map { |m| Util.midi_to_note_name(m, with_octave: false) }

raw_measures = json.fetch('measures')
current_sig = DEFAULT_SIGNATURE

measures = raw_measures.map.with_index do |m, idx|
  if m['signature'].is_a?(Array) && m['signature'].length == 2
    current_sig = [m['signature'][0].to_i, m['signature'][1].to_i]
  end

  voice0 = (m['voices'] || [])[0] || {}
  beats = voice0['beats'] || []

  # IMPORTANT: canon should ignore marker/metadata; build from rendered musical content.
  canon_obj = {
    'signature' => current_sig,
    'voice_rest' => !!voice0['rest'],
    'beats' => (beats || []).map do |b|
      {
        'duration' => b['duration'],
        'rest' => !!b['rest'],
        'palmMute' => !!b['palmMute'],
        'letRing' => !!b['letRing'],
        'tuplet' => b['tuplet'],                 # include tuplet in canon (affects rendering line)
        'tupletStart' => !!b['tupletStart'],     # include if present
        'tupletStop' => !!b['tupletStop'],       # include if present
        'notes' => (b['notes'] || []).map do |n|
          {
            'string' => n['string'],
            'fret' => n['fret'],
            'rest' => !!n['rest'],
            'tie' => !!n['tie'],
            'hp' => !!n['hp'],
            'slide' => n['slide'],
            'ghost' => !!n['ghost'],
            'dead' => !!n['dead']
          }
        end
      }
    end
  }

  MeasureRep.new(
    measure_index: idx,
    signature: current_sig,
    beats: beats,
    marker_text: m.dig('marker', 'text'),
    raw: m,
    canon: Util.deep_sort(canon_obj)
  )
end

puts TabRenderer.new(measures, measures_per_line: options[:per_line], string_names: string_names).render
