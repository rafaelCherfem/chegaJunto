import { frontendEnv, readLocalStatus, runLocalCli } from "./local-environment.mjs";

try {
  console.log(
    "Iniciando serviços Supabase locais, sem reset. Chaves da CLI não serão exibidas.",
  );
  await runLocalCli("start");
  frontendEnv(await readLocalStatus());
  console.log("Supabase local disponível. Execute npm run dev:local.");
} catch (error) {
  console.error(error.message);
  process.exitCode ||= 1;
}
