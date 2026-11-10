"use strict";
/* Bold Fixer — 自动修复渲染不出来的 **粗体**（核心逻辑与 .claude/hooks/fix-bold.js 相同） */
const { Plugin, Notice, MarkdownView, TFile } = require("obsidian");
const { EditorView } = require("@codemirror/view");
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


const IDLE_MS = 1000;

module.exports = class BoldFixer extends Plugin {
  async onload() {
    this.fileTimers = new Map();

    // 1. 命令：手动修复当前笔记（包括光标所在行）
    this.addCommand({
      id: "fix-current-note",
      name: "修复当前笔记中渲染不出来的粗体",
      editorCallback: (editor, view) => {
        const cm = editor.cm;
        const n = cm ? this.fixView(cm, false) : 0;
        new Notice(n ? `Bold Fixer：修复了 ${n} 处粗体` : "Bold Fixer：没有发现问题");
      },
    });

    // 2. 粘贴时修复（其他插件已处理过的粘贴不干预）
    this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor) => {
      if (evt.defaultPrevented || !evt.clipboardData) return;
      const text = evt.clipboardData.getData("text/plain");
      if (!text || !text.includes("**")) return;
      const r = fixText(text);
      if (!r.fixed) return;
      evt.preventDefault();
      editor.replaceSelection(r.text);
    }));

    // 3. 正在打开的笔记：内容变化或光标移动后，停手 1 秒自动修复（跳过光标所在行）
    const plugin = this;
    this.registerEditorExtension(EditorView.updateListener.of((update) => {
      if (!update.docChanged && !update.selectionSet) return;
      const view = update.view;
      clearTimeout(view.__boldFixerTimer);
      view.__boldFixerTimer = setTimeout(() => plugin.fixView(view, true), IDLE_MS);
    }));

    // 4. 没在编辑器里打开的笔记被修改（例如 Claude 写入）：直接修文件
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      if (this.isOpen(file)) return; // 打开着的交给编辑器扩展处理
      clearTimeout(this.fileTimers.get(file.path));
      this.fileTimers.set(file.path, setTimeout(() => {
        this.fileTimers.delete(file.path);
        if (!this.isOpen(file)) this.fixFile(file);
      }, 800));
    }));
  }

  isOpen(file) {
    let open = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.file.path === file.path) open = true;
    });
    return open;
  }

  // 在编辑器里修复：保留撤销历史和光标位置；skipCursorLine 时不动光标所在行
  fixView(view, skipCursorLine) {
    if (!view || !view.dom || !view.dom.isConnected || view.composing) return 0;
    const state = view.state;
    const doc = state.doc.toString();
    if (!doc.includes("**")) return 0;
    const r = fixText(doc);
    if (!r.fixed) return 0;
    const oldLines = doc.split("\n"), newLines = r.text.split("\n");
    if (oldLines.length !== newLines.length) return 0;
    const cursorLines = new Set(state.selection.ranges.map((rg) => state.doc.lineAt(rg.head).number - 1));
    const changes = [];
    for (let i = 0; i < oldLines.length; i++) {
      if (oldLines[i] === newLines[i]) continue;
      if (skipCursorLine && cursorLines.has(i)) continue;
      const line = state.doc.line(i + 1);
      changes.push({ from: line.from, to: line.to, insert: newLines[i] });
    }
    if (!changes.length) return 0;
    view.dispatch({ changes, userEvent: "input.bold-fixer" });
    return changes.length;
  }

  async fixFile(file) {
    let fixed = 0;
    await this.app.vault.process(file, (data) => {
      if (!data.includes("**")) return data;
      const r = fixText(data);
      fixed = r.fixed;
      return r.fixed ? r.text : data;
    });
    return fixed;
  }

  onunload() { for (const t of this.fileTimers.values()) clearTimeout(t); }
};
