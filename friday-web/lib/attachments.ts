import type { AttachmentAdapter } from "@assistant-ui/react";

/** Gemini caps an inline request at ~20 MB; base64 adds a third on top. */
const MAX_BYTES = 14 * 1024 * 1024;

const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/**
 * Files go to the agent inline, base64, inside the human message — the same
 * way the Telegram bot sends them. react-langgraph turns images into
 * `image_url` blocks and everything else into base64 `file`/`audio` blocks,
 * all of which langchain-google-genai accepts.
 */
export const fileAttachments: AttachmentAdapter = {
  accept: "image/*,audio/*,video/*,application/pdf,text/*,application/json",

  async add({ file }) {
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} is too big (max ${MAX_BYTES / 1024 / 1024} MB)`);
    }
    return {
      id: crypto.randomUUID(),
      type: file.type.startsWith("image/") ? "image" : "file",
      name: file.name,
      contentType: file.type || "application/octet-stream",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },

  async send(attachment) {
    const data = await dataUrl(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content:
        attachment.type === "image"
          ? [{ type: "image", image: data, filename: attachment.name }]
          : [{ type: "file", data, mimeType: attachment.contentType!, filename: attachment.name }],
    };
  },

  async remove() {},
};
