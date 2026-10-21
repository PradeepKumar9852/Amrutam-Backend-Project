/**
 * JavaScript Syntax & Integrity Lint Checker
 * Recursively scans src/ and tests/ directories and executes node syntax validation.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results = results.concat(getJsFiles(fullPath));
      }
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const targetDirs = [
  path.join(__dirname, '..', 'src'),
  path.join(__dirname, '..', 'tests'),
  path.join(__dirname, '..', 'scripts'),
];

let totalFiles = 0;
let errors = 0;

console.log('Running JavaScript Syntax & Code Integrity Validation...');

targetDirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    const files = getJsFiles(dir);
    files.forEach((file) => {
      totalFiles++;
      try {
        execSync(`node --check "${file}"`, { stdio: 'pipe' });
      } catch (err) {
        console.error(`SYNTAX ERROR in ${file}:`, err.message);
        errors++;
      }
    });
  }
});

if (errors > 0) {
  console.error(`Lint check failed with ${errors} error(s) across ${totalFiles} files.`);
  process.exit(1);
} else {
  console.log(`Lint check passed! Successfully validated ${totalFiles} JavaScript files without syntax errors.`);
  process.exit(0);
}
