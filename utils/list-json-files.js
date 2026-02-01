const fs = require('fs').promises;
const path = require('path');

async function listJsonFiles(dir, baseDir = dir) {
    let results = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(await listJsonFiles(fullPath, baseDir));
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
            const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            results.push(rel);
        }
    }
    return results;
}

module.exports = { listJsonFiles };
