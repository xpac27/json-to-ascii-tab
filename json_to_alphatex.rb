#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'optparse'

NOTE_NAMES = %w[C C# D D# E F F# G G# A A# B].freeze
DEFAULT_SIGNATURE = [4, 4].freeze
DEFAULT_TUNING = [64, 59, 55, 50, 45, 40].freeze

Options = Struct.new(:json_path, :output_path)

class AlphaTexWriter
  def initialize(data)
    @data = data
    @signature = DEFAULT_SIGNATURE
    @tempo_map = build_tempo_map(data.fetch('automations', {})['tempo'])
  end

  def render
    lines = []

    lines << %(title "#{@data['name']}") if @data['name']
    lines << %(instrument "#{@data['instrument']}") if @data['instrument']
    lines << %(part "#{@data['partId']}") if @data.key?('partId')
    lines << "tuning #{string_tuning_names.join(' ')}"
    lines << "time #{@signature[0]}/#{@signature[1]}"
    lines << ''

    measures = Array(@data['measures'])
    measures.each_with_index do |measure, idx|
      if measure['signature']
        @signature = measure['signature']
        lines << "time #{@signature[0]}/#{@signature[1]}"
      end

      tempo_tokens = @tempo_map[idx]
      lines.concat(tempo_tokens) unless tempo_tokens.empty?

      marker = measure.dig('marker', 'text')
      lines << "// #{marker}" if marker

      lines << "| #{render_measure(measure)} |"
      lines << ''
    end

    lines.join("\n")
  end

  private

  def build_tempo_map(entries)
    tempo_map = Hash.new { |h, k| h[k] = [] }
    Array(entries).each do |entry|
      next unless entry.is_a?(Hash)
      next unless entry['position'].nil? || entry['position'].to_i.zero?
      measure_idx = entry['measure'].to_i
      bpm = entry['bpm']
      tempo_map[measure_idx] << "tempo #{bpm}"
    end
    tempo_map
  end

  def string_tuning_names
    (Array(@data['tuning']) || DEFAULT_TUNING).yield_self do |arr|
      if arr.length == 6 && arr.all? { |n| n.is_a?(Numeric) }
        arr
      else
        DEFAULT_TUNING
      end
    end.map { |m| midi_to_note_name(m) }
  end

  def midi_to_note_name(num)
    name = NOTE_NAMES[num % 12]
    octave = (num / 12) - 1
    "#{name}#{octave}"
  end

  def duration_rational(arr)
    return Rational(1, 4) unless arr.is_a?(Array) && arr.size == 2
    num, den = arr.map(&:to_i)
    return Rational(1, 4) if num <= 0 || den <= 0
    Rational(num, den)
  end

  def duration_token(r)
    return ":#{r.denominator}" if r.numerator == 1
    ":#{r.numerator}/#{r.denominator}"
  end

  def split_duration(total)
    parts = []
    remaining = total
    [1, 2, 4, 8, 16, 32].each do |den|
      unit = Rational(1, den)
      while remaining >= unit
        parts << unit
        remaining -= unit
      end
    end
    parts << remaining if remaining.positive?
    parts
  end

  def render_measure(measure)
    voice = Array(measure['voices']).first || {}
    beats = Array(voice['beats'])

    content = if voice['rest']
                rest_fill(Util.measure_total(@signature))
              elsif beats.empty?
                rest_fill(Util.measure_total(@signature))
              else
                render_beats(beats, measure_index: measure['measure_index'])
              end

    content.join(' ')
  end

  def render_beats(beats, measure_index: nil)
    signature_total = Util.measure_total(@signature)
    acc = Rational(0, 1)
    tokens = []

    beats.each do |beat|
      dur = duration_rational(beat['duration'])
      next if dur <= 0
      break if acc >= signature_total

      rendered = render_beat(beat, dur)
      tokens << rendered
      acc += dur
    end

    if acc < signature_total
      tokens.concat(rest_fill(signature_total - acc))
    end

    tokens
  end

  def render_beat(beat, duration)
    token = if beat['rest']
              "r#{duration_token(duration)}"
            else
              notes = Array(beat['notes']).map { |n| render_note(n, duration) }.compact
              notes = ["r#{duration_token(duration)}"] if notes.empty?
              notes.length > 1 ? "[#{notes.join(' ')}]#{duration_token(duration)}" : "#{notes.first}#{duration_token(duration)}"
            end

    token = "pm(#{token})" if beat['palmMute']
    token = "let-ring(#{token})" if beat['letRing']

    if beat['tuplet']
      token = "tuplet(#{beat['tuplet']}, #{token})"
    end

    token
  end

  def render_note(note, duration)
    return nil if note['rest']

    string_no = note['string']&.to_i
    fret = note['fret']

    return nil unless string_no
    return nil if fret.nil? && !note['dead']

    string_label = string_no + 1
    value = if note['dead']
      'x'
            elsif note['ghost']
              "(#{fret})"
            else
              fret
            end

    token = "#{string_label}.#{value}"
    token = "sl(#{token})" if note['slide']
    token = "hp(#{token})" if note['hp']
    token += '~' if note['tie']
    token
  end

  def rest_fill(total)
    split_duration(total).map { |r| "r#{duration_token(r)}" }
  end
end

module Util
  module_function

  def measure_total(signature)
    Rational(signature[0], signature[1])
  end
end

if __FILE__ == $PROGRAM_NAME
  opts = Options.new
  OptionParser.new do |parser|
    parser.banner = 'Usage: ruby json_to_alphatex.rb --json path/to/file.json [--output out.atext]'
    parser.on('--json PATH', 'Input JSON file') { |v| opts.json_path = v }
    parser.on('--output PATH', 'Output AlphaTex file (default: stdout)') { |v| opts.output_path = v }
  end.parse!

  if opts.json_path.nil?
    warn 'Missing --json'
    exit 1
  end

  data = JSON.parse(File.read(opts.json_path))

  writer = AlphaTexWriter.new(data)
  output = writer.render

  if opts.output_path
    File.write(opts.output_path, output)
  else
    puts output
  end
end
