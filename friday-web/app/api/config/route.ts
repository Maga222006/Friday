import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { checkConfig } from "@/lib/configSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The project's config.yaml: next to friday-web/ locally, mounted in Docker. */
// turbopackIgnore: a runtime path, so the build mustn't trace (and bundle) the whole project
const CONFIG_PATH = process.env.CONFIG_PATH ?? path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "config.yaml");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The file holds model settings and MCP credentials, so only the local machine
 * may read or write it. The custom header makes browsers preflight any
 * cross-site request, which this route never approves.
 */
function refuse(req: NextRequest): NextResponse | null {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.has(host) && process.env.CONFIG_EDITOR_ALLOW_REMOTE !== "1") {
    return NextResponse.json({ error: "The config editor only works on localhost." }, { status: 403 });
  }
  if (req.headers.get("x-friday-config") !== "1") {
    return NextResponse.json({ error: "Missing x-friday-config header." }, { status: 403 });
  }
  return null;
}

const mtimeOf = async () => (await stat(CONFIG_PATH)).mtimeMs;

export async function GET(req: NextRequest) {
  const denied = refuse(req);
  if (denied) return denied;
  try {
    const [text, mtime] = await Promise.all([readFile(CONFIG_PATH, "utf8"), mtimeOf()]);
    return NextResponse.json({ path: CONFIG_PATH, text, mtime });
  } catch (e) {
    return NextResponse.json({ error: `Can't read ${CONFIG_PATH}: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = refuse(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { text?: unknown; baseMtime?: unknown; force?: unknown } | null;
  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ error: 'Expected {"text": "..."}' }, { status: 400 });
  }

  const { errors } = checkConfig(body.text);
  if (errors.length) return NextResponse.json({ error: "Invalid config", errors }, { status: 422 });

  try {
    // someone (you, in an editor) changed the file after it was loaded here
    if (!body.force && typeof body.baseMtime === "number" && (await mtimeOf()) !== body.baseMtime) {
      return NextResponse.json({ error: "config.yaml changed on disk since you opened it." }, { status: 409 });
    }
    // best effort: in Docker only the file itself is mounted, its folder isn't writable
    const backedUp = await copyFile(CONFIG_PATH, `${CONFIG_PATH}.bak`).then(() => true, () => false);
    // write in place (not rename): Docker bind-mounts this single file
    await writeFile(CONFIG_PATH, body.text.endsWith("\n") ? body.text : `${body.text}\n`, "utf8");
    return NextResponse.json({ ok: true, mtime: await mtimeOf(), backedUp });
  } catch (e) {
    return NextResponse.json({ error: `Can't write ${CONFIG_PATH}: ${(e as Error).message}` }, { status: 500 });
  }
}
