#!/usr/bin/env node
/*
 * fix-bold.js — 自动修复 Markdown 中渲染不出来的 **粗体**
 *
 * CommonMark 规则：
 *   - 结尾的 ** 若前面是标点、后面紧跟文字（如 `**说明：**在`），不算结尾；
 *   - 开头的 ** 若后面是标点、前面紧跟文字（如 `文字**「引号」**`），不算开头。
 * 修法：把粗体内侧首尾的标点挪到 ** 外面，例如 `**说明：**在` → `**说明**：在`。
 * 无法安全自动修的情况（如单独多出一个 **）只报告，不改动。
 *
 * 用法：
 *   node fix-bold.js <file.md> [...]        修复文件，输出修改摘要
 *   node fix-bold.js --check <file.md> [...] 只检查不修改
 *   作为 Claude Code PostToolUse hook：从 stdin 读取 JSON，修复 tool_input.file_path
 */
'use strict';
const fs = require('fs');

const isWS = (c) => c === undefined || c === '' || /\s/u.test(c);
const isPunct = (c) => c !== undefined && c !== '' && /[\p{P}\p{S}]/u.test(c);
// 可以安全挪到粗体外的标点（不含 ` $ [ ] * _ 等有语法含义的符号）
const TRAIL = '：:，,。.？?！!；;、）)」』”’》〉】〕';
const LEAD = '（(「『“‘《〈【〔';

function maskLine(line) {
  // 把行内代码、行内公式、wikilink 内部替换成 x（保留长度和边界符号），避免误判
  return line
    .replace(/(`+)([\s\S]*?)\1/g, (m, t, b) => t + 'x'.repeat(b.length) + t)
    .replace(/\$(?!\s)([^$\n]*?[^\s\\])\$/g, (m, b) => '$' + 'x'.repeat(b.length) + '$')
    .replace(/\[\[([^\]]*)\]\]/g, (m, b) => '[[' + 'x'.repeat(b.length) + ']]');
}

function fixLine(line) {
  const masked = maskLine(line);
  // 找出恰好两个星号、且未被反斜杠转义的位置
  const pos = [];
  const re = /\*+/g;
  let m;
  while ((m = re.exec(masked))) {
    if (m[0].length === 2 && masked[m.index - 1] !== '\\') pos.push(m.index);
  }
  if (pos.length === 0) return { line, fixed: 0, problems: [] };
  if (pos.length % 2 === 1) return { line, fixed: 0, problems: ['** 数量为奇数（可能多了或少了一个 **）'] };

  const edits = []; // {start, end, text}
  const problems = [];
  for (let k = 0; k < pos.length; k += 2) {
    const o = pos[k], c = pos[k + 1];
    const inner = line.slice(o + 2, c);
    // 开头
    const oPrev = masked[o - 1], oNext = masked[o + 2];
    const openOK = !isWS(oNext) && (!isPunct(oNext) || isWS(oPrev) || isPunct(oPrev));
    // 结尾
    const cPrev = masked[c - 1], cNext = masked[c + 2];
    const closeOK = !isWS(cPrev) && (!isPunct(cPrev) || isWS(cNext) || isPunct(cNext));
    if (openOK && closeOK) continue;

    let lead = '', body = inner, trail = '';
    if (!closeOK && isPunct(cPrev) && !isWS(cNext)) {
      let i = body.length;
      while (i > 0 && TRAIL.includes(body[i - 1])) i--;
      trail = body.slice(i); body = body.slice(0, i);
    }
    if (!openOK && isPunct(oNext) && !isWS(oPrev)) {
      let i = 0;
      while (i < body.length && LEAD.includes(body[i])) i++;
      lead = body.slice(0, i); body = body.slice(i);
    }
    const stillOpenBad = !openOK && !lead;
    const stillCloseBad = !closeOK && !trail;
    if (!body || stillOpenBad || stillCloseBad) {
      problems.push('无法自动修复：' + line.slice(o, c + 2).slice(0, 40));
      continue;
    }
    edits.push({ start: o, end: c + 2, text: lead + '**' + body + '**' + trail });
  }
  let out = line;
  for (const e of edits.reverse()) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { line: out, fixed: edits.length, problems };
}

function fixText(src) {
  const lines = src.split('\n');
  let inFence = false, fenceMark = '', inMath = false, inFm = false;
  let fixed = 0;
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (i === 0 && l === '---') { inFm = true; continue; }
    if (inFm) { if (l === '---') inFm = false; continue; }
    if (!inFence) {
      // 开始围栏：反引号围栏的 info string 里不能再有反引号（否则是行内代码）
      const open = l.match(/^\s*(?:>\s*)*(`{3,})[^`]*$/) || l.match(/^\s*(?:>\s*)*(~{3,})/);
      if (open) { inFence = true; fenceMark = open[1]; continue; }
    } else {
      const close = l.match(/^\s*(?:>\s*)*(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fenceMark[0] && close[1].length >= fenceMark.length) { inFence = false; }
      continue;
    }
    if (inFence) continue;
    if (/^\s*\$\$/.test(l)) { if (!/^\s*\$\$.*\$\$\s*$/.test(l)) inMath = !inMath; continue; }
    if (inMath || !l.includes('**')) continue;
    const r = fixLine(l);
    lines[i] = r.line;
    fixed += r.fixed;
    for (const p of r.problems) problems.push(`第 ${i + 1} 行：${p}`);
  }
  return { text: lines.join('\n'), fixed, problems };
}

function processFile(file, checkOnly) {
  if (!file || !file.endsWith('.md') || !fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('**')) return null;
  const r = fixText(src);
  if (!checkOnly && r.fixed > 0) fs.writeFileSync(file, r.text);
  return r;
}

module.exports = { fixText, fixLine };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // hook 模式：从 stdin 读 JSON
    let input = '';
    process.stdin.on('data', (d) => (input += d));
    process.stdin.on('end', () => {
      let file;
      try { const j = JSON.parse(input); file = (j.tool_input && j.tool_input.file_path) || (j.tool_response && j.tool_response.filePath); } catch (e) { return; }
      const r = processFile(file, false);
      if (!r || (r.fixed === 0 && r.problems.length === 0)) return;
      const msgs = [];
      if (r.fixed) msgs.push(`fix-bold hook 已自动修复 ${file} 中 ${r.fixed} 处渲染不出来的粗体（把标点移到了 ** 外面），文件已在磁盘上被修改，再次编辑前请重新读取。`);
      if (r.problems.length) msgs.push(`fix-bold hook 发现无法自动修复的粗体问题：\n${r.problems.join('\n')}`);
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msgs.join('\n') } }));
    });
  } else {
    const checkOnly = args[0] === '--check';
    const files = checkOnly ? args.slice(1) : args;
    let total = 0;
    for (const f of files) {
      const r = processFile(f, checkOnly);
      if (!r || (r.fixed === 0 && r.problems.length === 0)) continue;
      total += r.fixed;
      console.log(`${f}: ${checkOnly ? '可修复' : '已修复'} ${r.fixed} 处${r.problems.length ? '；' + r.problems.join('；') : ''}`);
    }
    if (checkOnly && total > 0) process.exitCode = 1;
  }
}
