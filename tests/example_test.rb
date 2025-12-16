# frozen_string_literal: true

require 'minitest/autorun'
require 'open3'

class TempoLabelAlignmentTest < Minitest::Test
  def test_tempo_label_is_left_aligned_inside_measure_box
    script = File.expand_path('../json_to_ascii_tab.rb', __dir__)
    fixture = File.expand_path('../doc/example.json', __dir__)

    stdout, stderr, status = Open3.capture3('ruby', script, '--json', fixture)

    assert status.success?, "renderer failed: #{stderr}"

    header = 'Example Track - Overdriven Guitar (part 0)'
    inner = " #{header} "
    border = "+#{'-' * inner.length}+"
    header_box = [border, "|#{inner}|", border, ""]

    body = <<~'OUT'.split("\n")
# Demo: tuplets, PM, let ring, tie
                     Tempo 120
                         1                                                   2
 |        -----3----                               | |                                                 |
 | PM----                                          | |                                                 |
 |       let ring~~~~                              | |                                                 |
E| ------------------------2-----------------------| | ------------------------------------------------|
B| ------------------------2-----------------------| | ------------------------------------------------|
G| ------------------------2-----------------------| | ------------------------------------------------|
D| ------------------------(2)---------------------| | ------------------------------------------------|
A| ------3===3===3---------------------------------| | ------------------------------------------------|
E| 0-----------------------------------x-----------| | 0===========0===========0===========0-----------|
OUT

    lines = stdout.lines.map { |l| l.chomp.rstrip }
    expected = header_box + body
    assert_equal expected, lines.first(expected.length)
  end
end
