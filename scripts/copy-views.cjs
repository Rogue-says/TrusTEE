const fs = require('node:fs');
fs.rmSync('dist/views', { recursive: true, force: true });
fs.cpSync('src/views', 'dist/views', { recursive: true });
