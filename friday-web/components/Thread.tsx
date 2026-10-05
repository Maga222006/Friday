"use client";
import {
  ActionBarPrimitive,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type FileMessagePartComponent,
  type ImageMessagePartComponent,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { VoiceButton } from "./VoiceButton";
import { MarkdownText } from "./MarkdownText";

/* --------------------------------------------------------- files in chat */

const ImagePart: ImageMessagePartComponent = ({ image, filename }) => (
  // eslint-disable-next-line @next/next/no-img-element -- data URLs, nothing to optimize
  <img src={image} alt={filename ?? "image"} className="my-1 max-h-64 rounded-lg" />
);

const FilePart: FileMessagePartComponent = ({ filename, mimeType }) => (
  <span className="my-1 inline-flex items-center gap-1.5 rounded-lg bg-black/10 px-2 py-1 text-xs dark:bg-white/10">
    📎 {filename ?? "file"} <span className="opacity-60">{mimeType}</span>
  </span>
);

/* ------------------------------------------------------------ tool calls */

const short = (v: unknown, max = 600) => {
  const t = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** Every tool call, inline and collapsed: "🔧 weather · done". */
const ToolCall: ToolCallMessagePartComponent = ({ toolName, args, result, status, isError }) => {
  const state =
    status.type === "running" ? "running…"
    : isError || status.type === "incomplete" ? "failed"
    : result === undefined ? "waiting"
    : "done";
  return (
    <details className="group my-1 rounded-lg border border-black/10 text-xs dark:border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 text-neutral-600 select-none dark:text-neutral-400">
        <span>🔧</span>
        <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">{toolName}</span>
        <span className={state === "failed" ? "text-red-500" : state === "running…" ? "animate-pulse" : ""}>
          · {state}
        </span>
        <span className="ml-auto opacity-50 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-1.5 border-t border-black/10 px-2 py-1.5 dark:border-white/10">
        {args && Object.keys(args).length > 0 && (
          <pre className="overflow-x-auto font-mono whitespace-pre-wrap opacity-80">{short(args)}</pre>
        )}
        {result !== undefined && (
          <pre className="max-h-60 overflow-auto font-mono whitespace-pre-wrap">{short(result, 2000)}</pre>
        )}
      </div>
    </details>
  );
};

const parts = { Image: ImagePart, File: FilePart, tools: { Fallback: ToolCall } };
const DONE = { type: "complete" } as const;

/* ------------------------------------------------------- message actions */

const actionBtn =
  "rounded-md px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-black/5 hover:text-neutral-900 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-neutral-100";

function CopyAction() {
  return (
    <ActionBarPrimitive.Copy className={actionBtn}>
      <MessagePrimitive.If copied>Copied</MessagePrimitive.If>
      <MessagePrimitive.If copied={false}>Copy</MessagePrimitive.If>
    </ActionBarPrimitive.Copy>
  );
}

/** Pending file in the composer, before Send. */
function ComposerAttachment() {
  return (
    <AttachmentPrimitive.Root className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
      <span className="max-w-40 truncate">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove className="text-neutral-400 hover:text-red-500" aria-label="Remove file">
        x
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="group flex flex-col items-end px-3 py-1.5 sm:px-4">
      <div className="flex max-w-[85%] flex-col items-start rounded-2xl rounded-br-sm bg-neutral-800 px-4 py-2 text-sm text-neutral-50 whitespace-pre-wrap sm:max-w-[75%] dark:bg-neutral-700">
        {/* files sent in this session; after a reload they come back as parts */}
        <MessagePrimitive.Attachments>
          {({ attachment }) =>
            attachment.content.map((c, i) =>
              c.type === "image" ? (
                <ImagePart key={i} {...c} status={DONE} />
              ) : c.type === "file" ? (
                <FilePart key={i} {...c} status={DONE} />
              ) : null,
            )
          }
        </MessagePrimitive.Attachments>
        <MessagePrimitive.Parts components={parts} />
      </div>
      {/* fixed-height slot so hover-only actions don't make the list jump */}
      <div className="h-6">
        <ActionBarPrimitive.Root hideWhenRunning autohide="always" className="mt-0.5 flex gap-0.5">
          <CopyAction />
          <ActionBarPrimitive.Edit className={actionBtn}>Edit</ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

/** Replaces a user message while it's being edited; Send forks the thread from there. */
function EditComposer() {
  return (
    <ComposerPrimitive.Root className="flex flex-col items-end gap-1.5 px-3 py-1.5 sm:px-4">
      <ComposerPrimitive.Input
        autoFocus
        className="w-full max-w-[85%] resize-none rounded-2xl border border-neutral-300 bg-transparent px-4 py-2 text-sm outline-none focus:border-neutral-500 sm:max-w-[75%] dark:border-neutral-700"
      />
      <div className="flex gap-1.5">
        <ComposerPrimitive.Cancel className="rounded-lg border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">
          Cancel
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
          Resend
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex flex-col items-start px-3 py-1.5 sm:px-4">
      <div className="max-w-[92%] min-w-0 rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 text-sm text-neutral-900 sm:max-w-[80%] dark:bg-neutral-900 dark:text-neutral-100">
        <MessagePrimitive.Parts components={{ ...parts, Text: MarkdownText }} />
        <MessagePrimitive.Error>
          <p className="mt-1 text-xs text-red-500">Something went wrong. Try regenerating.</p>
        </MessagePrimitive.Error>
      </div>
      <div className="h-6">
        <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="mt-0.5 flex gap-0.5">
          <CopyAction />
          <ActionBarPrimitive.Reload className={actionBtn}>Regenerate</ActionBarPrimitive.Reload>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto py-4">
        <div className="mx-auto w-full max-w-3xl">
          <ThreadPrimitive.Empty>
            <p className="px-4 py-16 text-center text-sm text-neutral-400">Ask Friday something.</p>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage, EditComposer }} />
        </div>
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="border-t border-neutral-200 dark:border-neutral-800">
        <ComposerPrimitive.AttachmentDropzone className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-2 sm:p-3 data-[dragging=true]:bg-sky-50 dark:data-[dragging=true]:bg-sky-950/40">
          <div className="flex flex-wrap gap-1.5 empty:hidden">
            <ComposerPrimitive.Attachments>{() => <ComposerAttachment />}</ComposerPrimitive.Attachments>
          </div>
          <div className="flex items-end gap-1.5 sm:gap-2">
            <ComposerPrimitive.AddAttachment
              multiple
              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              title="Attach files (or drop them here)"
            >
              📎
            </ComposerPrimitive.AddAttachment>
            <ComposerPrimitive.Input
              rows={1}
              autoFocus
              placeholder="Message Friday…"
              className="max-h-40 min-w-0 flex-1 resize-none rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
            />
            <VoiceButton />
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900">
                Send
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel className="rounded-xl border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">
                Stop
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}
