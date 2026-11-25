/**
 * One-off codemod: replace hard-coded "₹" and 'en-IN' in the web UI with the
 * user's currency (cs()) and number locale (nl()) from src/lib/money.js.
 *
 * AST-guided but edit-in-place: only the exact characters are replaced, every
 * other byte of each file (formatting, comments, classNames, styles) is kept,
 * so the design is untouched.
 *
 *   node scripts/codemod-currency.cjs          # apply
 *   node scripts/codemod-currency.cjs --check  # report remaining occurrences
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const SRC = path.join(__dirname, '..', 'src');
const SKIP = new Set([path.join(SRC, 'lib', 'money.js')]);
const check = process.argv.includes('--check');

const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (/\.(jsx?|tsx?)$/.test(e.name) && !SKIP.has(p)) files.push(p);
});
walk(SRC);

let total = 0;
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  if (!code.includes('₹') && !code.includes("'en-IN'") && !code.includes('"en-IN"')) continue;
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const edits = []; // [start, end, replacement]
  let usesCs = false, usesNl = false;

  traverse(ast, {
    // `₹${x}` → `${cs()}${x}`
    TemplateElement(p) {
      const raw = p.node.value.raw;
      if (!raw.includes('₹')) return;
      const { start, end } = p.node;
      edits.push([start, end, raw.split('₹').join('${cs()}')]);
      usesCs = true;
    },
    // JSX text: <span>₹{x}</span> → <span>{cs()}{x}</span>
    JSXText(p) {
      const v = p.node.value;
      if (!v.includes('₹')) return;
      edits.push([p.node.start, p.node.end, v.split('₹').join('{cs()}')]);
      usesCs = true;
    },
    StringLiteral(p) {
      const v = p.node.value;
      const parent = p.parent;
      if (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration') return;
      if (v === 'en-IN') {
        edits.push([p.node.start, p.node.end, 'nl()']);
        usesNl = true;
        return;
      }
      if (!v.includes('₹')) return;
      // JSX attribute value: placeholder="₹500" → placeholder={`${cs()}500`}
      const tpl = '`' + v.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').split('₹').join('${cs()}') + '`';
      edits.push([p.node.start, p.node.end, parent.type === 'JSXAttribute' ? `{${tpl}}` : tpl]);
      usesCs = true;
    },
  });

  if (!edits.length) continue;
  total += edits.length;
  if (check) { console.log(`${path.relative(SRC, file)}: ${edits.length}`); continue; }

  let out = code;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);

  const names = [usesCs && 'cs', usesNl && 'nl'].filter(Boolean);
  const existing = out.match(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/money['"];?/);
  if (existing) {
    const have = existing[1].split(',').map((s) => s.trim()).filter(Boolean);
    const merged = [...new Set([...have, ...names])].join(', ');
    out = out.replace(existing[0], `import { ${merged} } from '@/lib/money';`);
  } else {
    // After the last top-level import.
    const imports = [...out.matchAll(/^import[\s\S]*?from\s*['"][^'"]+['"];?[^\S\n]*$/gm)];
    const at = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
    out = out.slice(0, at) + `\nimport { ${names.join(', ')} } from '@/lib/money';` + out.slice(at);
  }
  fs.writeFileSync(file, out);
  console.log(`${path.relative(SRC, file)}: ${edits.length} replacement(s)`);
}
console.log(check ? `${total} occurrence(s) remaining` : `Done: ${total} replacement(s)`);
