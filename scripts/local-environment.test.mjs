import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertLocalProject,
  frontendEnv,
  projectRoot,
  runLocalCli,
} from "./local-environment.mjs";

const token = (role) =>
  `fixture.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fixture`;
const status = {
  API_URL: "http://127.0.0.1:54321",
  ANON_KEY: token("anon"),
  SERVICE_ROLE_KEY: "fixture-admin",
};

function fixture(t) {
  const root = mkdtempSync(join(projectRoot, ".preview-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("aceita exclusivamente endpoints loopback com porta", () => {
  for (const API_URL of [
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "https://localhost:54321/",
  ]) {
    assert.equal(frontendEnv({ ...status, API_URL }, {}).VITE_SUPABASE_URL, API_URL);
  }
});

test("recusa remotos, host disfarçado, credenciais, paths e portas inválidas", () => {
  for (const API_URL of [
    "https://example.test",
    "http://localhost.evil.test:54321",
    "http://127.1:54321",
    "http://[::1]:54321",
    "http://user:pass@localhost:54321",
    "http://localhost:54321/path",
    "http://localhost:54321?target=remote",
    "file:///tmp",
    "http://localhost",
    "http://localhost:99999",
    "http://localhost:0",
    null,
  ]) {
    assert.throws(() => frontendEnv({ ...status, API_URL }, {}));
  }
});

test("recusa chave ausente, malformada e papel administrativo sem imprimir valor", () => {
  for (const ANON_KEY of [
    undefined,
    "",
    "invalid",
    token("service_role"),
    token("authenticated"),
  ]) {
    assert.throws(() => frontendEnv({ ...status, ANON_KEY }, {}), /ANON_KEY/);
  }
});

test("injeta somente as duas VITE necessárias e elimina credenciais Supabase herdadas", () => {
  const env = frontendEnv(status, {
    PATH: "fixture-path",
    VITE_SUPABASE_URL: "https://remote.test",
    VITE_SERVICE_ROLE_KEY: "fixture-admin",
    VITE_OTHER: "fixture",
    SUPABASE_ACCESS_TOKEN: "fixture",
    SERVICE_ROLE_KEY: "fixture-admin",
    ANON_KEY: "fixture",
    API_URL: "https://remote.test",
  });
  assert.deepEqual(Object.keys(env).sort(), [
    "PATH",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_URL",
  ]);
  assert.equal(env.VITE_SUPABASE_URL, status.API_URL);
  assert.equal(env.VITE_SUPABASE_ANON_KEY, status.ANON_KEY);
});

test("project-ref bloqueia antes de localizar/executar qualquer CLI", async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
  writeFileSync(join(root, "supabase", ".temp", "project-ref"), "fixture-remote");
  assert.throws(() => assertLocalProject(root), /Vínculo remoto/);
  await assert.rejects(runLocalCli("status", root), /Vínculo remoto/);
  await assert.rejects(runLocalCli("start", root), /Vínculo remoto/);
});

test("ausência da CLI tem instrução de instalação e comandos remotos são recusados", async (t) => {
  const root = fixture(t);
  await assert.rejects(runLocalCli("status", root), /Execute npm ci/);
  await assert.rejects(runLocalCli("link", root), /não permitido/);
  await assert.rejects(runLocalCli("reset", root), /não permitido/);
});

test("CLI indisponível não vaza stdout/stderr e explica recuperação", async (t) => {
  const root = fixture(t);
  const dir = join(root, "node_modules", "supabase", "dist");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "supabase.js"),
    'console.log("fixture-private-stdout"); console.error("fixture-private-stderr"); process.exit(1);',
  );
  await assert.rejects(runLocalCli("status", root), (error) => {
    assert.match(error.message, /npm run supabase:start/);
    assert.doesNotMatch(error.message, /fixture-private/);
    return true;
  });
  await assert.rejects(runLocalCli("start", root), (error) => {
    assert.match(error.message, /Nenhum reset/);
    assert.doesNotMatch(error.message, /fixture-private/);
    return true;
  });
});
