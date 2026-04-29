"use client";

/**
 * Thin wrapper around @uiw/react-codemirror.
 * Lives in its own file so FileEditorModal can dynamic-import it with ssr:false
 * without pulling CodeMirror into the server bundle.
 */

import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  lang: "markdown" | "json" | "text";
  onChange: (value: string) => void;
}

const langExtension = {
  markdown: [markdown()],
  json: [json()],
  text: [],
} as const;

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  // overflow: scroll forces both scrollbars to always be present
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    overflow: "scroll",
    scrollbarWidth: "thin",         // Firefox: thin scrollbars
    scrollbarColor: "#4b5563 #1e1e2e", // Firefox: thumb / track
  },
  // Webkit (Chrome / Safari / Edge) — always-visible, styled scrollbars
  ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
  ".cm-scroller::-webkit-scrollbar-track": { background: "#1e1e2e" },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    background: "#4b5563",
    borderRadius: "5px",
    border: "2px solid #1e1e2e",
  },
  ".cm-scroller::-webkit-scrollbar-thumb:hover": { background: "#6b7280" },
  ".cm-scroller::-webkit-scrollbar-corner": { background: "#1e1e2e" },
  ".cm-content": { padding: "16px 0", lineHeight: "1.65", minWidth: "100%" },
  ".cm-line": { padding: "0 20px" },
  ".cm-gutters": { paddingLeft: "8px", paddingRight: "4px" },
});

export default function CodeMirrorEditor({ value, lang, onChange }: Props) {
  // Line wrapping is on for markdown only — JSON and text get horizontal scroll
  const extensions = [
    ...langExtension[lang],
    baseTheme,
    ...(lang === "markdown" ? [EditorView.lineWrapping] : []),
  ];

  return (
    <CodeMirror
      value={value}
      height="100%"
      style={{ height: "100%" }}   /* wrapper div must also be 100% so .cm-editor 100% resolves correctly */
      theme={vscodeDark}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        searchKeymap: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: lang === "json",
        indentOnInput: true,
      }}
    />
  );
}
