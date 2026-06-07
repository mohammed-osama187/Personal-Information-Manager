const fs   = require('fs');
const path = require('path');

const srcDir  = __dirname;
const destDir = path.join(__dirname, 'build');

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

// ── Static assets to copy ────────────────────────────────────────────────────
const filesToCopy = ['index.html', 'manifest.json', 'sw.js', 'logo.png', 'logo1.png'];
const dirsToCopy  = ['css', 'sounds', 'assets'];

console.log('Building web assets...');

filesToCopy.forEach(file => {
    const src  = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`  Copied ${file}`);
    }
});

dirsToCopy.forEach(dir => {
    const src  = path.join(srcDir, dir);
    const dest = path.join(destDir, dir);
    if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true, force: true });
        console.log(`  Copied directory ${dir}/`);
    }
});

// ── Bundle generation ────────────────────────────────────────────────────────
// Combines all JS modules into one non-module bundle.js so that index.html
// works when opened directly via the file:// protocol (no server needed).
// Firebase is intentionally excluded — it stays as an inline <script type="module">
// in index.html that imports from the Firebase CDN and exposes everything on window.

const BUNDLE_ORDER = [
    'js/utils.js',
    'js/db.js',
    'js/auth.js',
    'js/calendar.js',
    'js/timer.js',
    'js/ui.js',
    'js/app.js',
];

// These are the Firebase API names that the inline module script exposes as
// window globals.  We pre-declare them with var so the bundle can reference
// them as bare names (e.g. `db`, `auth`, `collection`, …).
const FIREBASE_GLOBALS = [
    'db', 'auth',
    'collection', 'addDoc', 'doc', 'updateDoc', 'getDocs', 'deleteDoc',
    'getDoc', 'query', 'where',
    'createUserWithEmailAndPassword', 'signInWithEmailAndPassword', 'signOut',
    'onAuthStateChanged', 'sendPasswordResetEmail', 'updatePassword',
    'EmailAuthProvider', 'reauthenticateWithCredential', 'updateProfile',
];

// Remove `import { … } from '…';` lines (including multi-line forms)
function stripStaticImports(code) {
    return code
        .replace(/^import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];\s*[\r\n]?/gm, '')
        .replace(/^import\s+['"][^'"]+['"];\s*[\r\n]?/gm, '');
}

// Remove the `export` keyword while keeping the declaration itself
function stripExports(code) {
    return code
        .replace(/^export\s+(async\s+function|function|class|const|let|var)\b/gm, '$1')
        .replace(/^export\s+default\s+/gm, '')
        .replace(/^export\s*\{[^}]*\};\s*[\r\n]?/gm, '');
}

// Replace  import('./x.js').then(m => { m.func() })
// with     Promise.resolve().then(() => { func() })
// Works for both block-body and expression-body arrow functions.
function replaceDynamicImports(code) {
    // Regex captures the callback variable name; we use it to strip `varName.` in the body.
    const importRx = /import\(['"]\.\/\w+\.js['"]\)\.then\(\s*(?:async\s+)?\(?(\w+)\)?\s*=>/g;
    const replacements = [];
    let m;

    while ((m = importRx.exec(code)) !== null) {
        const matchStart = m.index;
        const varName    = m[1];
        let i            = m.index + m[0].length;

        // Skip whitespace between => and the body
        while (i < code.length && /\s/.test(code[i])) i++;

        let bodyStr, exprEnd;

        if (code[i] === '{') {
            // ── Block body: count braces to find matching } ────────────────
            let depth     = 1;
            const bodyStart = i;
            i++;
            while (i < code.length && depth > 0) {
                if      (code[i] === '{') depth++;
                else if (code[i] === '}') depth--;
                i++;
            }
            bodyStr = code.slice(bodyStart, i);
            // Skip whitespace + closing ) of .then(…)
            while (i < code.length && /\s/.test(code[i])) i++;
            if (code[i] === ')') i++;
            exprEnd = i;
        } else {
            // ── Expression body (single expression arrow) ──────────────────
            let depth       = 0;
            const exprStart = i;
            while (i < code.length) {
                if      (code[i] === '(' || code[i] === '[' || code[i] === '{') depth++;
                else if (code[i] === ')' || code[i] === ']' || code[i] === '}') {
                    if (depth === 0) break;
                    depth--;
                }
                i++;
            }
            bodyStr = code.slice(exprStart, i);
            if (code[i] === ')') i++;
            exprEnd = i;
        }

        // Strip varName. so e.g. `module.displayTasks()` → `displayTasks()`
        const cleanBody  = bodyStr.replace(new RegExp(`\\b${varName}\\.`, 'g'), '');
        const replacement = `Promise.resolve().then(() => ${cleanBody})`;

        replacements.push({ start: matchStart, end: exprEnd, replacement });
    }

    // Apply in reverse order so earlier indices stay valid
    for (let r = replacements.length - 1; r >= 0; r--) {
        const { start, end, replacement } = replacements[r];
        code = code.slice(0, start) + replacement + code.slice(end);
    }

    return code;
}

function processFile(code) {
    code = stripStaticImports(code);
    code = stripExports(code);
    code = replaceDynamicImports(code);
    return code;
}

// ── Generate bundle ──────────────────────────────────────────────────────────
console.log('\nGenerating js/bundle.js…');

let bundleCode =
    '/* FlowTick Bundle — auto-generated by build.js. Do NOT edit directly. */\n' +
    '/* Firebase globals below are populated by the <script type="module"> in index.html. */\n' +
    `var ${FIREBASE_GLOBALS.join(', ')};\n\n`;

BUNDLE_ORDER.forEach(relPath => {
    const fullPath = path.join(srcDir, relPath);
    if (fs.existsSync(fullPath)) {
        const raw       = fs.readFileSync(fullPath, 'utf8');
        const processed = processFile(raw);
        bundleCode += `\n/* ===== ${relPath} ===== */\n${processed}\n`;
        console.log(`  Bundled  ${relPath}`);
    } else {
        console.warn(`  WARNING: ${relPath} not found — skipping.`);
    }
});

// Write to js/ (used by index.html when opened via file://)
const srcJsDir = path.join(srcDir, 'js');
if (!fs.existsSync(srcJsDir)) fs.mkdirSync(srcJsDir, { recursive: true });
fs.writeFileSync(path.join(srcJsDir, 'bundle.js'), bundleCode);
console.log('  Written  js/bundle.js');

// Write to build/js/ (used by Capacitor)
const buildJsDir = path.join(destDir, 'js');
if (!fs.existsSync(buildJsDir)) fs.mkdirSync(buildJsDir, { recursive: true });
fs.writeFileSync(path.join(buildJsDir, 'bundle.js'), bundleCode);
console.log('  Written  build/js/bundle.js');

console.log('\nBuild complete!');
