import { execFile } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function assertLocalProject(root = projectRoot) {
  const marker = join(root, "supabase", ".temp", "project-ref");
  try {
    lstatSync(marker);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error("Não foi possível verificar o vínculo remoto do Supabase.");
  }
  throw new Error(
    "Vínculo remoto encontrado em supabase/.temp/project-ref. Preview local recusado.",
  );
}

export function localProcessEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) => !/^(VITE_|SUPABASE_|API_URL$|ANON_KEY$)|SERVICE_ROLE/i.test(name),
    ),
  );
}

export function frontendEnv(status, inherited = process.env) {
  const { API_URL, ANON_KEY } = status;
  if (
    typeof API_URL !== "string" ||
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(API_URL)
  ) {
    throw new Error("API_URL não é localhost ou 127.0.0.1. Preview local recusado.");
  }
  try {
    const url = new URL(API_URL);
    if (!url.port || Number(url.port) < 1) throw new Error();
  } catch {
    throw new Error("API_URL local inválida ou sem porta explícita.");
  }
  if (typeof ANON_KEY !== "string" || !ANON_KEY.trim()) {
    throw new Error("ANON_KEY ausente no status do Supabase local.");
  }
  // ANON_KEY da CLI local é JWT. Recusar inclusive uma chave administrativa
  // colocada por engano neste campo, sem registrar o seu conteúdo.
  try {
    const parts = ANON_KEY.split(".");
    if (
      parts.length !== 3 ||
      JSON.parse(Buffer.from(parts[1], "base64url")).role !== "anon"
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("ANON_KEY local inválida: esperado token público com papel anon.");
  }
  return {
    ...localProcessEnv(inherited),
    VITE_SUPABASE_URL: API_URL,
    VITE_SUPABASE_ANON_KEY: ANON_KEY,
  };
}

export async function runLocalCli(command, root = projectRoot) {
  assertLocalProject(root);
  if (!["status", "start"].includes(command))
    throw new Error("Comando local não permitido.");
  const entry = join(root, "node_modules", "supabase", "dist", "supabase.js");
  if (!existsSync(entry))
    throw new Error("CLI Supabase local não instalada. Execute npm ci.");
  const args = command === "status" ? ["status", "-o", "json"] : ["start"];
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [entry, ...args],
      {
        cwd: root,
        env: localProcessEnv(),
        encoding: "utf8",
        windowsHide: true,
        timeout: command === "status" ? 30_000 : 300_000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", terminate);
        if (error) {
          // stdout/stderr da CLI podem conter chaves: nunca os repassar aos logs.
          const diagnostic = `${stdout ?? ""}\n${stderr ?? ""}`;
          const reason = error.killed
            ? "tempo limite excedido"
            : /address already in use|port.*allocated|bind.*failed/i.test(diagnostic)
              ? "porta local ocupada"
              : /docker daemon|connect.*docker|docker.*running|named pipe/i.test(
                    diagnostic,
                  )
                ? "Docker indisponível"
                : `CLI falhou: ${typeof error.code === "number" ? error.code : "erro de execução"}`;
          reject(
            new Error(
              command === "status"
                ? `Supabase local não está disponível (${reason}). Verifique Docker Desktop e execute npm run supabase:start.`
                : `Falha ao iniciar Supabase local (${reason}). Verifique Docker Desktop, portas e imagens locais. Nenhum reset foi solicitado.`,
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
    const interrupt = () => {
      process.exitCode = 130;
      child.kill("SIGINT");
    };
    const terminate = () => {
      process.exitCode = 143;
      child.kill("SIGTERM");
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
  });
}

export async function readLocalStatus() {
  const output = await runLocalCli("status");
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(
      "Supabase CLI retornou status JSON inválido. Nenhuma chave foi exibida.",
    );
  }
}
