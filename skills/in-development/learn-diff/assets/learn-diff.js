/* learn-diff.js — prebuilt behavior for /learn-diff explanation pages.
   Vanilla, offline, no deps. Safe to include on every page (IIFE).
   Markup contract lives in references/html-page.md. */
(function () {
  "use strict";

  /* ---------- tiny syntax highlighter (DW-5) ----------
     Regex alternation per language, in priority order: comment → string →
     number → keyword → function-call name. Unknown language → plain. */

  var KW = {
    js: "abstract|as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|with|yield",
    python: "False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|self",
    bash: "if|then|else|elif|fi|for|while|until|do|done|case|esac|function|in|local|return|exit|export|source|set|shift|echo|cd|read|declare|readonly|trap",
    sql: "SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|DISTINCT|UNION|ALL|EXISTS|BETWEEN|LIKE|ILIKE|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MIN|MAX|PRIMARY|FOREIGN|KEY|REFERENCES|DEFAULT|CONSTRAINT|WITH|RETURNING|ASC|DESC",
    yaml: "true|false|null|yes|no|on|off"
  };

  function re(src, flags) { return new RegExp(src, flags); }

  // Each language: ordered list of [type, regex]. Regexes are sticky-applied
  // by the tokenizer; first match at the current position wins.
  var LANGS = {};
  function def(names, rules) {
    names.forEach(function (n) { LANGS[n] = rules; });
  }

  var NUM = ["num", /\b\d[\d_]*(\.\d+)?([eE][+-]?\d+)?\b|\b0[xXbBoO][\da-fA-F]+\b/];
  var FN = ["fn", /[A-Za-z_$][\w$]*(?=\s*\()/];

  def(["js", "ts", "jsx", "tsx", "javascript", "typescript"], [
    ["com", /\/\/[^\n]*|\/\*[\s\S]*?(\*\/|$)/],
    ["str", /`(\\.|[^`\\])*`|"(\\.|[^"\\\n])*"|'(\\.|[^'\\\n])*'/],
    NUM,
    ["kw", re("\\b(" + KW.js + ")\\b")],
    FN
  ]);

  def(["python", "py"], [
    ["com", /#[^\n]*/],
    ["str", /("""[\s\S]*?("""|$))|('''[\s\S]*?('''|$))|"(\\.|[^"\\\n])*"|'(\\.|[^'\\\n])*'/],
    NUM,
    ["kw", re("\\b(" + KW.python + ")\\b")],
    FN
  ]);

  def(["bash", "sh", "shell", "zsh"], [
    ["com", /#[^\n]*/],
    ["str", /"(\\.|[^"\\])*"|'[^']*'/],
    ["kw", re("(^|(?<=[;|&\\s]))(" + KW.bash + ")\\b")],
    ["num", /(?<=\s|^)-{1,2}[\w-]+/],          // CLI flags, colored like numbers
    ["fn", /\$\{?[\w@#?*]+\}?/]                 // variables, colored like fn
  ]);

  def(["sql"], [
    ["com", /--[^\n]*|\/\*[\s\S]*?(\*\/|$)/],
    ["str", /'([^'\n]|'')*'/],
    NUM,
    ["kw", re("\\b(" + KW.sql + ")\\b", "i")],
    FN
  ]);

  def(["json"], [
    ["kw", /"(\\.|[^"\\])*"(?=\s*:)/],          // keys
    ["str", /"(\\.|[^"\\])*"/],
    NUM,
    ["num", /\b(true|false|null)\b/]
  ]);

  def(["yaml", "yml"], [
    ["com", /#[^\n]*/],
    ["kw", /(^|(?<=^\s*|- ))[\w.\/-]+(?=\s*:(\s|$))/m],  // keys
    ["str", /"(\\.|[^"\\])*"|'[^'\n]*'/],
    NUM,
    ["num", re("\\b(" + KW.yaml + ")\\b")]
  ]);

  def(["html", "xml", "vue", "svelte"], [
    ["com", /<!--[\s\S]*?(-->|$)/],
    ["kw", /<\/?[\w-]+|\/?>|<!doctype\b/i],     // tags
    ["str", /"[^"]*"|'[^']*'/],
    ["fn", /\b[\w-]+(?==)/]                     // attribute names
  ]);

  def(["css", "scss"], [
    ["com", /\/\*[\s\S]*?(\*\/|$)/],
    ["str", /"[^"\n]*"|'[^'\n]*'/],
    ["kw", /(^|(?<=[{;]\s*))[\w-]+(?=\s*:)/m],  // property names (incl. --custom-props)
    ["num", /#[\da-fA-F]{3,8}\b|\b\d[\d.]*(px|rem|em|vh|vw|%|s|ms|ch|fr)?\b/],
    ["fn", /[\w-]+(?=\()|@[\w-]+|\.[\w-]+(?=[\s,{:])/]
  ]);

  // Tokenize `text` into [{type|null, text}] using the language's rules.
  function tokenize(text, rules) {
    var out = [], pos = 0, plain = "";
    while (pos < text.length) {
      var best = null, bestType = null;
      for (var i = 0; i < rules.length; i++) {
        var r = new RegExp(rules[i][1].source, "g" + rules[i][1].flags.replace(/[gy]/g, ""));
        r.lastIndex = pos;
        var m = r.exec(text);
        if (m && m.index === pos && m[0].length) { best = m[0]; bestType = rules[i][0]; break; }
      }
      if (best) {
        if (plain) { out.push({ t: null, s: plain }); plain = ""; }
        out.push({ t: bestType, s: best });
        pos += best.length;
      } else {
        // advance to next word boundary so \b keyword matches stay correct
        plain += text[pos++];
        while (pos < text.length && /[\w$]/.test(text[pos - 1]) && /[\w$]/.test(text[pos])) {
          plain += text[pos++];
        }
      }
    }
    if (plain) out.push({ t: null, s: plain });
    return out;
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Render tokens → HTML with each line wrapped in <span class="ln"> (DW-6).
  // Multi-line tokens are split so every span stays within one line.
  function renderLines(tokens) {
    var lines = [[]], cur = lines[0];
    tokens.forEach(function (tok) {
      var parts = tok.s.split("\n");
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) { cur = []; lines.push(cur); }
        if (parts[i]) cur.push({ t: tok.t, s: parts[i] });
      }
    });
    // drop a single trailing empty line (from trailing \n)
    if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    return lines.map(function (line) {
      var html = line.map(function (tok) {
        return tok.t ? '<span class="tok-' + tok.t + '">' + esc(tok.s) + "</span>" : esc(tok.s);
      }).join("");
      return '<span class="ln">' + html + "</span>";
    }).join("\n");
  }

  function highlightAll() {
    var blocks = document.querySelectorAll("figure.code-block pre code");
    blocks.forEach(function (code) {
      if (code.dataset.ldDone) return;
      code.dataset.ldDone = "1";
      var lang = (code.className.match(/language-([\w-]+)/) || [])[1];
      var rules = lang && LANGS[lang.toLowerCase()];
      var text = code.textContent;
      var tokens;
      try {
        tokens = rules ? tokenize(text, rules) : [{ t: null, s: text }];
      } catch (e) {
        tokens = [{ t: null, s: text }];      // never break the page
      }
      code.innerHTML = renderLines(tokens);
    });
  }

  /* ---------- copy buttons (code + terminal) ---------- */
  function addCopyButtons() {
    document.querySelectorAll("figure.code-block, figure.terminal").forEach(function (fig) {
      if (fig.querySelector(".copy-btn")) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "copy";
      btn.addEventListener("click", function () {
        var text;
        var cmds = fig.querySelectorAll(".cmd");
        if (fig.classList.contains("terminal") && cmds.length) {
          // terminal: copy commands only, no "$" prefix, no output lines
          text = Array.prototype.map.call(cmds, function (c) {
            return c.textContent;
          }).join("\n");
        } else {
          var code = fig.querySelector("pre code") || fig.querySelector("pre");
          text = code.textContent;            // .ln numbers are CSS ::before → not included
        }
        copyText(text, btn);
      });
      fig.appendChild(btn);
    });
  }

  function copyText(text, btn) {
    function done(ok) {
      btn.textContent = ok ? "copied!" : "copy failed";
      setTimeout(function () { btn.textContent = "copy"; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacyCopy(text)); });
    } else {
      done(legacyCopy(text));                 // clipboard API may be absent on file://
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  function init() {
    highlightAll();
    addCopyButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
