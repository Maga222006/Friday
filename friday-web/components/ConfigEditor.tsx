"use client";
import { useEffect, useMemo, useState } from "react";
import { checkConfig } from "@/lib/configSchema";
import { YamlEditor } from "./YamlEditor";

const HEADERS = { "content-type": "application/json", "x-friday-config": "1" };

const EXAMPLE = `models:
  primary: google_genai:gemini-flash-latest     # provider:model …
  fallbacks:
    - model: openai:gemma-4-e4b                 # … or an object: init_chat_model kwargs
      base_url: http://localhost:8080/v1        # any OpenAI-compatible server
      api_key: \${LOCAL_LLM_KEY}                # filled from .env
      temperature: 0.3
mcp:
  langchain_docs:
    transport: http
    url: https://docs.langchain.com/mcp`;

type Loaded = { path: string; text: string; mtime: number };

/** Edits the project's config.yaml through /api/config (localhost only). */
export function ConfigEditor({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);

  const check = useMemo(() => checkConfig(text), [text]);
  const dirty = loaded !== null && text !== loaded.text;

  const load = async () => {
    setBusy(true);
    setStatus(null);
    setConflict(false);
    try {
      const r = await fetch("/api/config", { headers: HEADERS, cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setLoaded(j);
      setText(j.text);
    } catch (e) {
      setStatus({ kind: "error", msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch
  }, []);

  const save = async (force = false) => {
    if (!loaded || check.errors.length || busy) return;
    setBusy(true);
    setStatus(null);
    setServerErrors([]);
    try {
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: HEADERS,
        body: JSON.stringify({ text, baseMtime: loaded.mtime, force }),
      });
      const j = await r.json();
      if (r.status === 409) {
        setConflict(true);
        throw new Error(j.error);
      }
      if (!r.ok) {
        setServerErrors(j.errors ?? []);
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setLoaded({ ...loaded, text, mtime: j.mtime });
      setConflict(false);
      setStatus({
        kind: "ok",
        msg: `Saved${j.backedUp ? " (previous version in config.yaml.bak)" : ""}. Restart Aegra and the voice worker to apply.`,
      });
    } catch (e) {
      setStatus({ kind: "error", msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("Discard unsaved changes to config.yaml?")) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={close}>
      <div
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl sm:h-[85vh] sm:rounded-2xl dark:bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="min-w-0">
            <p className="font-semibold">Configuration</p>
            <p className="truncate font-mono text-xs text-neutral-400" title={loaded?.path}>
              {loaded?.path ?? "config.yaml"}
            </p>
          </div>
          <button onClick={close} className="ml-auto rounded-lg px-2 py-1 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-neutral-50 dark:bg-[#282c34]">
          {loaded && <YamlEditor value={text} onChange={setText} onSave={() => void save()} onEscape={close} />}
        </div>

        <div className="max-h-40 space-y-1 overflow-y-auto border-t border-neutral-200 px-4 py-2 text-xs empty:hidden dark:border-neutral-800">
          {[...check.errors, ...serverErrors].map((m) => (
            <p key={`e${m}`} className="text-red-500">✕ {m}</p>
          ))}
          {check.warnings.map((m) => (
            <p key={`w${m}`} className="text-amber-600 dark:text-amber-400">! {m}</p>
          ))}
          {status && <p className={status.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{status.msg}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <details className="mr-auto text-xs text-neutral-500">
            <summary className="cursor-pointer select-none">Example</summary>
            <pre className="mt-2 max-w-[80vw] overflow-x-auto rounded-lg bg-neutral-100 p-2 font-mono dark:bg-neutral-900">{EXAMPLE}</pre>
          </details>
          <button
            onClick={load}
            disabled={busy}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-neutral-700"
          >
            Reload
          </button>
          {conflict && (
            <button onClick={() => save(true)} disabled={busy} className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-500">
              Overwrite anyway
            </button>
          )}
          <button
            onClick={() => save()}
            disabled={busy || !dirty || check.errors.length > 0}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
            title="⌘/Ctrl + S"
          >
            {busy ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
