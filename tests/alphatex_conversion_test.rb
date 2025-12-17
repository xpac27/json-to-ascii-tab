# frozen_string_literal: true

require 'minitest/autorun'
require 'open3'

class AlphaTexConversionTest < Minitest::Test
  def test_converts_example_json_to_alphatex
    script = File.expand_path('../json_to_alphatex.rb', __dir__)
    fixture = File.expand_path('../doc/example.json', __dir__)

    stdout, stderr, status = Open3.capture3('ruby', script, '--json', fixture)

    assert status.success?, "converter failed: #{stderr}"
    refute_includes stdout, '\\title', 'no cli title passed; title should be absent'
    assert_includes stdout, '\\artist "Example Track"'
    assert_includes stdout, '\\subtitle "Overdriven Guitar"'
    assert_includes stdout, '\\tuning (E4 B3 G3 D3 A2 E2)'
    assert_includes stdout, '\\section "Demo: tuplets, PM, let ring, tie"'
    assert_includes stdout, '\\tempo 120'
    assert_match(/:8\s+0\.6/, stdout)
    assert_equal 1, stdout.scan(/\{ tu 3 \}/).count
    # Tied run in measure 2 should merge into a single whole-note beat.
    assert_includes stdout, "\n:1 0.6 |\n"
  end

  def test_cli_title_overrides_title_keyword
    script = File.expand_path('../json_to_alphatex.rb', __dir__)
    fixture = File.expand_path('../doc/example.json', __dir__)

    stdout, stderr, status = Open3.capture3('ruby', script, '--json', fixture, '--title', 'Custom Title')

    assert status.success?, "converter failed: #{stderr}"
    assert_includes stdout, '\\title "Custom Title"'
    assert_includes stdout, '\\artist "Example Track"'
    assert_includes stdout, '\\subtitle "Overdriven Guitar"'
  end
end
