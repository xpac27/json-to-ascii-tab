# frozen_string_literal: true

require 'minitest/autorun'
require 'open3'

class InteractionRenderingTest < Minitest::Test
  def test_tuplet_pm_let_ring_and_ties_interaction
    script = File.expand_path('../json_to_ascii_tab.rb', __dir__)
    fixture = File.expand_path('fixture_interactions.json', __dir__)

    stdout, stderr, status = Open3.capture3('ruby', script, '--json', fixture)

    assert status.success?, "renderer failed: #{stderr}"

    lines = stdout.lines.map(&:chomp)
    assert_equal '# Interaction test: tuplet + PM + let ring + continuous tie sustain', lines[0]

    tuplet_body = lines.fetch(2).split('|')[1]
    assert_includes tuplet_body, '-----3----', 'tuplet rail should span the triplet beats'

    pm_body = lines.fetch(3).split('|')[1]
    assert_includes pm_body, 'PM----------', 'palm mute rail should cover the first two beats'
    assert_match(/PM-+\s+$/, pm_body, 'palm mute rail should stop after the second beat')

    lr_body = lines.fetch(4).split('|')[1]
    assert_match(/let ring~+/, lr_body, 'let ring text should appear at the start of the span')

    a_string = lines.fetch(9).split('|')[1]
    assert_includes a_string, '3===3===3', 'tied triplet notes should use sustain rails'

    low_e_string = lines.fetch(10).split('|')[1]
    assert_includes low_e_string, '0=====0', 'tied palm-muted notes should use sustain rails'
  end
end
