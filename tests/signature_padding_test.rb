# frozen_string_literal: true

require 'minitest/autorun'
require 'open3'

class SignaturePaddingTest < Minitest::Test
  def test_exact_signature_fill_with_trailing_rest
    script = File.expand_path('../json_to_ascii_tab.rb', __dir__)
    fixture = File.expand_path('fixture_signature_padding.json', __dir__)

    stdout, stderr, status = Open3.capture3('ruby', script, '--json', fixture)

    assert status.success?, "renderer failed: #{stderr}"

    lines = stdout.lines.map(&:chomp)
    assert_equal '# Padding test: measure is short, must be padded', lines[0]

    low_e_line = lines.fetch(7).rstrip
    assert_equal 'E| 0-----------1-----------2-----------------------|', low_e_line

    after_second = low_e_line.split('2', 2).last
    assert_equal '-' * 23 + '|', after_second
  end
end
