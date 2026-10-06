import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertLocalProject,
  frontendEnv,
  projectRoot,
  readLocalStatus,
} from "./local-environment.mjs";

async function startViteChild() {
  assertLocalProject();
  // Impede que .env locais sobreponham o fluxo ou exponham outras VITE_*.
  const { createServer } = await import("vite");
  const server = await createServer({ envDir: false, server: { host: "127.0.0.1" } });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
    if (process.connected) process.disconnect();
  };
  process.on("message", (message) => {
    if (message === "shutdown") void close();
  });
  process.once("disconnect", () => {
    void close();
  });
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  await server.listen();
  server.printUrls();
}

async function main() {
  if (process.argv[2] === "--vite-child" && process.send) {
    await startViteChild();
    return;
  }
  const env = frontendEnv(await readLocalStatus());
  assertLocalProject();
  console.log(
    "Preview usando somente Supabase local; variáveis públicas fornecidas em memória.",
  );
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "--vite-child"],
    {
      cwd: projectRoot,
      env,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      windowsHide: true,
    },
  );
  let exitCode;
  let deadline;
  const stop = (code) => {
    exitCode = code;
    if (child.connected) child.send("shutdown");
    deadline ??= setTimeout(() => child.kill(), 10_000);
    deadline.unref();
  };
  const interrupt = () => stop(130);
  const terminate = () => stop(143);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  child.once("error", () => {
    console.error("Não foi possível iniciar o processo local do Vite.");
    process.exitCode = 1;
  });
  child.once("close", (code) => {
    clearTimeout(deadline);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    process.exitCode = exitCode ?? code ?? 1;
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode ||= 1;
});
