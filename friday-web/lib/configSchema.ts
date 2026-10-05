import { parse, YAMLParseError } from "yaml";

/**
 * Checks config.yaml before it's saved, in the browser (live) and again in the
 * API route. Mirrors src/friday/config.py; a model may be a "provider:model"
 * string or an object with `model` plus init_chat_model kwargs (base_url, …).
 */
export type ConfigCheck = { errors: string[]; warnings: string[] };

const KNOWN_TOP = new Set(["models", "mcp"]);
const MCP_TRANSPORTS = new Set(["http", "streamable_http", "sse", "stdio", "websocket"]);
const SECRET_KEY = /(token|secret|password|api[_-]?key|authorization)/i;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function checkModel(v: unknown, where: string, errors: string[]) {
  if (typeof v === "string") {
    if (!v.includes(":")) errors.push(`${where}: "${v}" should look like provider:model, e.g. google_genai:gemini-flash-latest`);
    return;
  }
  if (isObj(v)) {
    if (typeof v.model !== "string" || !v.model) errors.push(`${where}: object form needs a "model" string`);
    if (v.base_url !== undefined && typeof v.base_url !== "string") errors.push(`${where}.base_url must be a string`);
    return;
  }
  errors.push(`${where}: expected "provider:model" or an object with "model"`);
}

/** plain-text secrets end up in the browser and in git; ${ENV_VAR} keeps them in .env */
function findSecrets(v: unknown, path: string, out: string[]) {
  if (isObj(v)) {
    for (const [k, child] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (SECRET_KEY.test(k) && typeof child === "string" && child && !/\$\{\w+\}/.test(child)) out.push(p);
      else findSecrets(child, p, out);
    }
  } else if (Array.isArray(v)) v.forEach((c, i) => findSecrets(c, `${path}[${i}]`, out));
}

export function checkConfig(text: string): ConfigCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  let doc: unknown;
  try {
    doc = parse(text, { prettyErrors: true });
  } catch (e) {
    const msg = e instanceof YAMLParseError ? e.message.split("\n")[0] : String(e);
    return { errors: [`YAML: ${msg}`], warnings };
  }
  if (!isObj(doc)) return { errors: ["The file must be a mapping (key: value) at the top level."], warnings };

  for (const k of Object.keys(doc)) if (!KNOWN_TOP.has(k)) warnings.push(`"${k}" isn't read by config.py yet`);

  const models = doc.models;
  if (!isObj(models)) errors.push('"models" is required, with at least "primary"');
  else {
    if (models.primary === undefined) errors.push('"models.primary" is required');
    else checkModel(models.primary, "models.primary", errors);
    if (models.fallbacks !== undefined && models.fallbacks !== null) {
      if (!Array.isArray(models.fallbacks)) errors.push('"models.fallbacks" must be a list');
      else models.fallbacks.forEach((m, i) => checkModel(m, `models.fallbacks[${i}]`, errors));
    }
  }

  if (doc.mcp !== undefined && doc.mcp !== null) {
    if (!isObj(doc.mcp)) errors.push('"mcp" must map server names to their settings');
    else
      for (const [name, srv] of Object.entries(doc.mcp)) {
        if (!isObj(srv)) {
          errors.push(`mcp.${name}: expected settings (transport, url / command)`);
          continue;
        }
        const t = srv.transport;
        if (typeof t !== "string" || !MCP_TRANSPORTS.has(t)) {
          errors.push(`mcp.${name}.transport must be one of ${[...MCP_TRANSPORTS].join(", ")}`);
        } else if (t === "stdio" ? typeof srv.command !== "string" : typeof srv.url !== "string") {
          errors.push(`mcp.${name}: ${t === "stdio" ? '"command"' : '"url"'} is required for ${t}`);
        }
      }
  }

  const secrets: string[] = [];
  findSecrets(doc, "", secrets);
  for (const s of secrets) warnings.push(`${s} is a plain-text secret; consider \${ENV_VAR} and keeping it in .env`);

  return { errors, warnings };
}
