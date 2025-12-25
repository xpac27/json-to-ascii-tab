require "capybara/cucumber"
require "capybara/cuprite"
require "rspec/expectations"
require "rack"
require "rack/files"
require "webrick"

public_root = File.expand_path("../../public", __dir__)

Capybara.app = Rack::Files.new(public_root)
Capybara.server = :webrick

Capybara.register_driver(:cuprite) do |app|
  Capybara::Cuprite::Driver.new(
    app,
    headless: true,
    window_size: [1280, 800],
    js_errors: true
  )
end

Capybara.default_driver = :cuprite
Capybara.javascript_driver = :cuprite
Capybara.default_max_wait_time = 2
