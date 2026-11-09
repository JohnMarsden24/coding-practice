import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import tsWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker';
import { useEffect, useRef } from 'react';

self.MonacoEnvironment = {
  getWorker: (_id, label) => (label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker()),
};

monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  strict: true,
  noEmit: true,
  allowNonTsExtensions: true,
});

const dark = window.matchMedia('(prefers-color-scheme: dark)');
const themeName = () => (dark.matches ? 'practice-dark' : 'practice-light');

monaco.editor.defineTheme('practice-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#fdfcf9', 'editorLineNumber.foreground': '#b5b2a8' },
});
monaco.editor.defineTheme('practice-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#2b2a27', 'editorLineNumber.foreground': '#6b6963' },
});

export function CodeEditor({
  value,
  onChange,
  prelude,
  onRun,
}: {
  value: string;
  onChange: (code: string) => void;
  prelude: string;
  onRun: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const callbacks = useRef({ onChange, onRun });
  callbacks.current = { onChange, onRun };

  useEffect(() => {
    const model = monaco.editor.createModel(value, 'typescript', monaco.Uri.parse('file:///solution.ts'));
    const instance = monaco.editor.create(host.current!, {
      model,
      theme: themeName(),
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13.5,
      lineHeight: 21,
      tabSize: 2,
      scrollBeyondLastLine: false,
      padding: { top: 12 },
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    });
    editor.current = instance;
    instance.onDidChangeModelContent(() => callbacks.current.onChange(instance.getValue()));
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => callbacks.current.onRun());
    const onTheme = () => monaco.editor.setTheme(themeName());
    dark.addEventListener('change', onTheme);
    return () => {
      dark.removeEventListener('change', onTheme);
      instance.dispose();
      model.dispose();
    };
    // The editor owns its content after mount; later value changes come from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prelude.trim()) return;
    const lib = monaco.typescript.typescriptDefaults.addExtraLib(prelude, 'file:///provided.ts');
    return () => lib.dispose();
  }, [prelude]);

  return <div className="code-editor" ref={host} />;
}
