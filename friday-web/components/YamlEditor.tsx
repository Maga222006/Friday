"use client";
import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab, insertNewlineAndIndent } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { parseDocument } from "yaml";

const UNIT = "  "; // YAML forbids tabs; two spaces per level

/**
 * Enter the way YAML wants it:
 *   "- item"          → next line "- " at the same indent
 *   "- "  (empty)     → ends the list (drops the marker)
 *   "- key: value"    → continues that mapping, aligned under "key"
 *   "key:" / "- key:" → one level deeper
 *   anything else     → keeps the current indent
 */
function yamlEnter(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return insertNewlineAndIndent(view);

  const line = state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  const code = before.replace(/\s+#.*$/, ""); // ignore a trailing comment
  const indent = /^\s*/.exec(before)![0];
  const item = /^(\s*)-(\s+)(.*)$/.exec(code);

  let insert: string;
  if (item && item[3].trim() === "" && sel.head === line.to) {
    // empty "- " → leave the list
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: item[1] },
      selection: EditorSelection.cursor(line.from + item[1].length),
      userEvent: "input",
    });
    return true;
  } else if (item) {
    const content = item[1] + " ".repeat(1 + item[2].length); // column after "- "
    if (/[:|>]\s*$/.test(item[3])) insert = content + UNIT; // "- key:" opens a block
    else if (/^[^\s"'][^:]*:\s/.test(item[3])) insert = content; // "- key: value" → sibling key
    else insert = `${item[1]}-${item[2]}`; // plain item → next item
  } else if (/[:|>]\s*$/.test(code) && code.trim() !== "") {
    insert = indent + UNIT;
  } else {
    insert = indent;
  }

  view.dispatch(state.replaceSelection(`\n${insert}`), { scrollIntoView: true, userEvent: "input" });
  return true;
}

/** YAML syntax errors, underlined where they are. */
const yamlLint = linter((view): Diagnostic[] => {
  const doc = parseDocument(view.state.doc.toString());
  const len = view.state.doc.length;
  return [...doc.errors, ...doc.warnings].map((e) => ({
    from: Math.min(e.pos[0], len),
    to: Math.min(Math.max(e.pos[1], e.pos[0] + 1), len),
    severity: doc.errors.includes(e as never) ? "error" : "warning",
    message: e.message.split("\n")[0],
  }));
});

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", lineHeight: "1.6" },
  "&.cm-focused": { outline: "none" },
});

const isDark = () => document.documentElement.classList.contains("dark");

export function YamlEditor({
  value,
  onChange,
  onSave,
  onEscape,
  readOnly = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
  onEscape: () => void;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // latest callbacks, so the editor is created once
  const handlers = useRef({ onChange, onSave, onEscape });
  useEffect(() => {
    handlers.current = { onChange, onSave, onEscape };
  });
  const theme = useRef(new Compartment());
  const editable = useRef(new Compartment());

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          yaml(),
          indentUnit.of(UNIT),
          EditorState.tabSize.of(2),
          Prec.highest(
            keymap.of([
              { key: "Enter", run: yamlEnter },
              { key: "Mod-s", preventDefault: true, run: () => (handlers.current.onSave(), true) },
            ]),
          ),
          keymap.of([indentWithTab, { key: "Escape", run: () => (handlers.current.onEscape(), true) }]),
          lintGutter(),
          yamlLint,
          baseTheme,
          theme.current.of(isDark() ? oneDark : []),
          editable.current.of(EditorView.editable.of(!readOnly)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    v.focus();

    // follow the app's light/dark toggle while open
    const mo = new MutationObserver(() =>
      v.dispatch({ effects: theme.current.reconfigure(isDark() ? oneDark : []) }),
    );
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mo.disconnect();
      v.destroy();
      view.current = null;
    };
    // created once; later `value` changes are synced below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // outside changes (initial load, Reload) replace the document
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!readOnly)) });
  }, [readOnly]);

  return <div ref={host} className="min-h-0 flex-1 overflow-hidden" />;
}
