const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'out');

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name === 'index.html') fixPage(fullPath);
  }
}

function fixPage(filePath) {
  const relativeDir = path.relative(outDir, path.dirname(filePath));
  const depth = relativeDir ? relativeDir.split(path.sep).length : 0;
  const prefix = '../'.repeat(depth);
  const html = fs.readFileSync(filePath, 'utf8');
  const fixed = html.replaceAll('./_next/', `${prefix}_next/`);
  if (fixed !== html) fs.writeFileSync(filePath, fixed);
}

walk(outDir);
