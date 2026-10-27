const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') walk(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.json') || f.endsWith('.css') || f.endsWith('.html') || f.endsWith('.rs')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('\r\n')) {
        fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
      }
    }
  }
}

walk(path.join(__dirname, '..', 'src'));
walk(path.join(__dirname, '..', 'src-tauri'));
console.log('Normalized line endings in src and src-tauri to LF');
