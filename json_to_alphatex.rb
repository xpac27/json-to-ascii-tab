#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'optparse'

DEFAULT_SIGNATURE = [4, 4].freeze
DEFAULT_TUNING_MIDI = [64, 59, 55, 50, 45, 40].freeze # E4 B3 G3 D3 A2 E2 (high -> low)

module AlphaTexUtil
  module_function

  NOTE_NAMES_SHARP = %w[C C# D D# E F F# G G# A A# B].freeze

  def midi_to_note_name(midi)
    m = midi.to_i
    name = NOTE_NAMES_SHARP[m % 12]
    octave = (m / 12) - 1
    "#{name}#{octave}"
  end

  def escape(text)
    text.to_s.gsub('"', '\"')
  end

  def rational_from_fraction(arr)
    return Rational(0, 1) if arr.nil? || arr.empty?
    Rational(arr[0].to_i, arr[1].to_i)
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

  def duration_denominator(beat)
    type = beat['type']
    return type.to_i if type

    arr = beat['duration']
    return nil unless arr.is_a?(Array) && arr.size == 2
    num, den = arr.map { |v| v.to_i }
    return nil if num.zero?

    den / num
  end
end

class AlphaTexConverter
  include AlphaTexUtil

  def initialize(json_hash, max_repeat_len: 16)
    @json = json_hash
    @tuning = normalized_tuning
    @tempos_by_measure = collect_tempos
    @max_repeat_len = max_repeat_len
  end

  def to_alphatex
    lines = []

    cli_title = @json.delete('__cli_title')
    lines << %(\\title "#{escape(cli_title)}") if cli_title

    if @json['name']
      lines << %(\\artist "#{escape(@json['name'])}")
    end

    lines << %(\\subtitle "#{escape(@json['instrument'])}") if @json['instrument']

    track_line = '\\track'
    track_line += %( "#{escape(@json['instrument'])}") if @json['instrument']
    lines << track_line

    lines << '  \staff {tabs}'
    lines << "  \\tuning (#{tuning_note_names.join(' ')})"

    current_sig = DEFAULT_SIGNATURE

    canon = canonical_measures(measures)
    blocks = detect_repeats(canon, @max_repeat_len)
    units = build_units(measures, blocks)

    units.each_with_index do |unit, idx|
      measure = unit[:measure]
      marker = measure.dig('marker', 'text')
      lines << "// #{marker}" if marker && !marker.empty?

      sig = measure['signature'] || current_sig
      sig = DEFAULT_SIGNATURE unless valid_signature?(sig)
      sig_changed = idx.zero? || sig != current_sig
      current_sig = sig

      meta = []
      meta << '\ro' if unit[:repeat_start]
      marker = measure.dig('marker', 'text')
      meta << %(\\section "#{escape(marker)}") if marker && !marker.empty?
      meta << "\\ts #{sig[0]} #{sig[1]}" if sig_changed
      tempos = @tempos_by_measure[idx]
      tempos.each { |bpm| meta << "\\tempo #{bpm}" }
      meta << "\\rc #{unit[:repeat_end][:count]}" if unit[:repeat_end]

      beat_line = build_measure_line(measure, meta)
      lines << beat_line unless beat_line.nil?
    end

    lines.join("\n")
  end

  private

  def measures
    @json['measures'] || []
  end

  def normalized_tuning
    arr = @json['tuning']
    if arr.is_a?(Array) && arr.size == 6 && arr.all? { |v| v.is_a?(Numeric) }
      arr
    else
      DEFAULT_TUNING_MIDI
    end
  end

  def tuning_note_names
    @tuning.map { |m| AlphaTexUtil.midi_to_note_name(m) }
  end

  def valid_signature?(sig)
    sig.is_a?(Array) && sig.size == 2 && sig.all? { |v| v.to_i.positive? }
  end

  def collect_tempos
    tempos = Hash.new { |h, k| h[k] = [] }
    (@json.dig('automations', 'tempo') || []).each do |t|
      measure = t['measure']
      next unless measure
      pos = t['position']
      next unless pos.nil? || pos.to_i.zero?
      bpm = t['bpm']
      next unless bpm
      tempos[measure.to_i] << bpm.to_i
    end
    tempos
  end

  def build_measure_line(measure, meta)
    voice = (measure['voices'] || []).first
    beats = voice ? merge_tied_beats(voice['beats'] || []) : []

    content = format_beats(beats)
    return nil if content.empty?

    line = +'  '
    line << meta.join(' ') << ' ' unless meta.empty?
    line << content
    line << ' |'
    line.strip
  end

  def format_beats(beats)
    cur_denom = nil
    current_tuplet = nil

    beats.map do |b|
      parts = []
      denom = AlphaTexUtil.duration_denominator(b)
      emit_tuplet = tuplet_emit?(b, current_tuplet)

      if denom && denom != cur_denom
        token = ":#{denom}"
        if emit_tuplet && b['tuplet']
          token += " { tu #{b['tuplet']} }"
          emit_tuplet = false
        end
        parts << token
        cur_denom = denom
      end

      parts << format_beat(b, emit_tuplet)

      tu = b['tuplet']
      if b['tupletStart']
        current_tuplet = tu
      elsif tu
        current_tuplet = tu
      elsif b['tupletStop'] || tu.nil?
        current_tuplet = nil
      end

      parts.join(' ')
    end.join(' ')
  end

  def format_beat(beat, emit_tuplet_prop)
    if beat['rest']
      return 'r'
    end

    notes = (beat['notes'] || []).map do |n|
      format_note(n, beat_palm_mute: beat['palmMute'], beat_let_ring: beat['letRing'])
    end.compact

    notes = ['r'] if notes.empty?
    content = notes.length == 1 ? notes.first : "(#{notes.join(' ')})"

    props = []
    dots = beat['dots'].to_i
    props << 'd' if dots == 1
    props << 'dd' if dots == 2
    props << 'd' if dots > 2
    props << "tu #{beat['tuplet']}" if emit_tuplet_prop && beat['tuplet']

    props.empty? ? content : "#{content} { #{props.join(' ')} }"
  end

  def format_note(note, beat_palm_mute:, beat_let_ring:)
    return nil if note['rest']

    string_num = note['string']
    string_txt = string_num ? (string_num.to_i + 1).to_s : nil

    if note['tie']
      return string_txt ? "-.#{string_txt}" : '-'
    end

    base = if note['dead']
             string_txt ? "x.#{string_txt}" : 'x'
           elsif note['fret']
             string_txt ? "#{note['fret']}.#{string_txt}" : note['fret'].to_s
           else
             string_txt ? "0.#{string_txt}" : '0'
           end

    props = []
    props << 'g' if note['ghost']
    props << 'x' if note['dead']
    props << 't' if note['tie']
    props << 'h' if note['hp']
    props << 'ss' if note['slide'] == 'shift'
    props << 'pm' if beat_palm_mute
    props << 'lr' if beat_let_ring

    props.empty? ? base : "#{base} { #{props.join(' ')} }"
  end

  def merge_tied_beats(beats)
    merged = []
    beats.each do |beat|
      if can_merge_tie?(merged.last, beat)
        prev = merged.last
        prev_dur = AlphaTexUtil.rational_from_fraction(prev['duration'])
        cur_dur = AlphaTexUtil.rational_from_fraction(beat['duration'])
        sum = prev_dur + cur_dur
        prev['duration'] = [sum.numerator, sum.denominator]
      else
        merged << (beat ? Marshal.load(Marshal.dump(beat)) : beat)
      end
    end
    merged
  end

  def single_note(beat)
    notes = beat['notes'] || []
    notes.reject { |n| n['rest'] }.length == 1 ? notes.find { |n| !n['rest'] } : nil
  end

  def can_merge_tie?(prev_beat, cur_beat)
    return false unless prev_beat && cur_beat
    return false if cur_beat['rest'] || prev_beat['rest']

    n_prev = single_note(prev_beat)
    n_cur = single_note(cur_beat)
    return false unless n_prev && n_cur
    return false unless n_cur['tie']
    return false unless n_prev['string'] == n_cur['string']
    return false unless n_prev['fret'] == n_cur['fret']
    return false if [prev_beat, cur_beat].any? { |b| b['tuplet'] || b['dots'].to_i > 0 || b['palmMute'] || b['letRing'] }

    true
  end

  def tuplet_emit?(beat, current_tuplet)
    t = beat['tuplet']
    return false unless t
    return true if beat['tupletStart']
    current_tuplet != t
  end

  # Repeat detection (content-based)
  def canonical_measures(measures)
    current_sig = DEFAULT_SIGNATURE
    measures.map do |m|
      if m['signature'].is_a?(Array) && m['signature'].length == 2
        current_sig = [m['signature'][0].to_i, m['signature'][1].to_i]
      end

      voice0 = (m['voices'] || [])[0] || {}
      beats = voice0['beats'] || []

      canon_obj = {
        'signature' => current_sig,
        'voice_rest' => !!voice0['rest'],
        'beats' => (beats || []).map do |b|
          {
            'duration' => b['duration'],
            'rest' => !!b['rest'],
            'palmMute' => !!b['palmMute'],
            'letRing' => !!b['letRing'],
            'tuplet' => b['tuplet'],
            'tupletStart' => !!b['tupletStart'],
            'tupletStop' => !!b['tupletStop'],
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

      AlphaTexUtil.deep_sort(canon_obj)
    end
  end

  def detect_repeats(canon, max_len)
    blocks = []
    i = 0
    while i < canon.length
      best = nil
      max_len.downto(1) do |len|
        break if i + len > canon.length
        seq = canon[i, len]
        count = 1
        while i + count * len + len <= canon.length && canon[i + count * len, len] == seq
          count += 1
        end
        next if count <= 1
        best = { start: i, len: len, count: count }
        break
      end

      if best
        blocks << best
        i += best[:len] * best[:count]
      else
        i += 1
      end
    end
    blocks
  end

  def build_units(measures, blocks)
    block_at = {}
    blocks.each { |b| block_at[b[:start]] = b }

    units = []
    i = 0
    while i < measures.length
      b = block_at[i]
      if b
        b[:len].times do |k|
          units << {
            measure: measures[i + k],
            repeat_start: (k == 0),
            repeat_end: (k == b[:len] - 1) ? b : nil
          }
        end
        i += b[:len] * b[:count]
      else
        units << { measure: measures[i], repeat_start: false, repeat_end: nil }
        i += 1
      end
    end
    units
  end
end

options = { json_path: nil, title: nil, max_repeat_len: 16 }

OptionParser.new do |opts|
  opts.banner = 'Usage: json_to_alphatex.rb [options]'
  opts.on('--json PATH', 'Path to input JSON file (defaults to STDIN)') do |path|
    options[:json_path] = path
  end
  opts.on('--title TEXT', 'Override title (renders as \\title)') do |text|
    options[:title] = text
  end
  opts.on('--max-repeat-len N', Integer, 'Max repeated sequence length to compress (default 16)') do |v|
    options[:max_repeat_len] = v
  end
end.parse!

input = if options[:json_path]
          File.read(options[:json_path])
        else
          STDIN.read
        end

data = JSON.parse(input)
data['__cli_title'] = options[:title] if options[:title]
converter = AlphaTexConverter.new(data, max_repeat_len: options[:max_repeat_len].to_i)
puts converter.to_alphatex
