const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.js')) results.push(file);
        }
    });
    return results;
}

const jsFiles = walk('./out');
console.log(`Transpiling ${jsFiles.length} JavaScript files for older TV compatibility...`);

for (const file of jsFiles) {
    try {
        execSync(`npx esbuild "${file}" --allow-overwrite --outfile="${file}" --target=chrome69`);
    } catch (e) {
        console.error(`Failed to transpile ${file}`, e.message);
    }
}

console.log('Successfully transpiled exported files for older browsers.');
