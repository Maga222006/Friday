"use client";
import { useState } from "react";
import {
  MarkdownTextPrimitive,
  escapeCurrencyDollars,
  normalizeMathDelimiters,
  type SyntaxHighlighterProps,
} from "@assistant-ui/react-markdown";
import hljs from "highlight.js/lib/common";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// Gemini mixes $…$, \(…\) and \[…\]; turn them all into $-math, but keep "$5" as money
const preprocess = (text: string) => escapeCurrencyDollars(normalizeMathDelimiters(text));

/** navigator.clipboard only exists on HTTPS/localhost; over plain-HTTP LAN fall back to execCommand. */
async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void copyText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 ${className}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Header + highlighted body in one bordered block. The library renders its
 *  CodeHeader as a sibling, so that slot is emptied and the header lives here. */
function SyntaxHighlighter({ language, code }: SyntaxHighlighterProps) {
  const lang = hljs.getLanguage(language) ? language : undefined;
  // highlight.js output is escaped HTML, so injecting it is safe
  const html = lang
    ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    : hljs.highlightAuto(code).value;
  return (
    <div className="code-block">
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-1 text-xs dark:border-white/5">
        <span className="font-mono text-neutral-500">{lang ?? (language || "text")}</span>
        <CopyButton text={code} />
      </div>
      <pre>
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

const components = {
  CodeHeader: () => null,
  SyntaxHighlighter,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

/** Assistant text: GitHub-flavoured markdown, KaTeX math, highlighted code (styles in globals.css). */
export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      className="md"
      preprocess={preprocess}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      components={components}
    />
  );
}
