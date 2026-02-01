const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!doctype html><html><body>
<input id="openaiApiKey" />
<div id="openaiStatus" class="status-indicator"></div>
</body></html>`, { url: "https://example.com" });

// Setup global environment expected by integrations.js
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = window.localStorage;

// Minimal SecureStorage mock used by saveOpenAIConfig
global.SecureStorage = {
  ensurePassphrase: async () => {},
  encrypt: async (value) => value
};

// Load the integrations script which defines saveOpenAIConfig
require('../js/integrations.js');

(async () => {
  // Use a key format with additional dashes to mimic new OpenAI keys
  document.getElementById('openaiApiKey').value = 'sk-proj-1234567890abcdef';
  await window.saveOpenAIConfig();
  const status = document.getElementById('openaiStatus').textContent;
  if (status !== 'Configuration saved successfully') {
    throw new Error('API key was rejected');
  }
  console.log('OpenAI API key accepted');
})();
