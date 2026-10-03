import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

// Fixed disposable LOCAL container only. No remote URLs, credentials or links.
if (existsSync("supabase/.temp/project-ref")) throw new Error("Remote link forbidden");
const args = [
  "exec",
  "-i",
  "supabase_db_rideledger",
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
];
function sql(query) {
  const result = spawnSync("docker", args, { input: query, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error("Local SQL validation failed: " + result.stderr);
  return result.stdout.trim();
}
const owner = "51000000-0000-0000-0000-000000000001";
const first = "51000000-0000-0000-0000-000000000002";
const second = "51000000-0000-0000-0000-000000000003";
const passenger = "52000000-0000-0000-0000-000000000001";
const token = "f".repeat(64); // Public synthetic fixture, never a real invitation.
const children = [];
function session(query, keepOpen = false) {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  let out = "",
    err = "";
  child.stdout.on("data", (data) => {
    out += data;
  });
  child.stderr.on("data", (data) => {
    err += data;
  });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out: out.trim(), err }));
  });
  if (keepOpen) child.stdin.write(query);
  else child.stdin.end(query);
  return { child, done, output: () => out };
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  const end = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("Concurrency barrier timed out");
    await pause(50);
  }
}
function cleanup() {
  sql(`delete from public.passenger_invites where passenger_id='${passenger}';
    delete from public.passenger_accounts where passenger_id='${passenger}';
    delete from public.passengers where id='${passenger}';
    delete from public.responsible_accounts where user_id='${owner}';
    delete from auth.users where id in ('${owner}','${first}','${second}');`);
}
try {
  cleanup();
  sql(`insert into auth.users(id,email) values('${owner}','race-owner@example.test'),('${first}','race-a@example.test'),('${second}','race-b@example.test');
    insert into public.responsible_accounts(user_id) values('${owner}');
    insert into public.passengers(id,user_id,name,default_daily_rate) values('${passenger}','${owner}','Synthetic concurrent target',10);
    set role authenticated; set request.jwt.claim.sub='${owner}';
    select public.create_passenger_invite('${passenger}','${token}');`);
  const blocker = session(
    `begin; select id from public.passengers where id='${passenger}' for update;\nselect 'BARRIER_READY';\n`,
    true,
  );
  await until(() => blocker.output().includes("BARRIER_READY"));
  const requests = [first, second].map((id, n) =>
    session(`set application_name='invite-race-${n}';
    set role authenticated; set request.jwt.claim.sub='${id}';
    select public.redeem_passenger_invite('${token}');`),
  );
  await until(
    () =>
      sql(
        "select count(*) from pg_stat_activity where application_name like 'invite-race-%' and wait_event_type='Lock'",
      ) === "2",
  );
  blocker.child.stdin.end("commit;\n");
  await blocker.done;
  const results = await Promise.all(requests.map((request) => request.done));
  assert.equal(results.filter((r) => r.code === 0).length, 1);
  assert.equal(
    results.filter((r) => r.code !== 0 && r.err.includes("INVITE_USED")).length,
    1,
  );
  assert.equal(
    sql(
      `select count(*) from public.passenger_accounts where passenger_id='${passenger}'`,
    ),
    "1",
  );
  assert.equal(
    sql(`select count(*) from public.passenger_invites i join public.passenger_accounts a on a.passenger_id=i.passenger_id
    where i.passenger_id='${passenger}' and i.used and i.used_at is not null and i.used_by=a.user_id and i.revoked_at is null`),
    "1",
  );
  console.log(
    "LOCAL concurrency PASS: both requests blocked at shared barrier; 1 success, 1 INVITE_USED; 1 coherent link/consumption.",
  );
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  cleanup();
}
