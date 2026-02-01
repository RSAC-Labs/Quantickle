const fs = require('fs');
const path = require('path');
const assert = require('assert');

function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDir(full);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (Object.prototype.hasOwnProperty.call(data, 'color')) {
        assert.match(
          data.color,
          /^#[0-9a-fA-F]{6}$/,
          `Invalid color format in ${full}: ${data.color}`
        );
      }
    }
  }
}

checkDir(path.join(__dirname, '..', 'config'));
console.log('config-color-format.test.js passed');
