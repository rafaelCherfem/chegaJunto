import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (existsSync("supabase/.temp/project-ref")) throw new Error("Remote link forbidden");
// Status credentials remain in memory and are never printed or written.
const status = JSON.parse(
  execFileSync(
    "cmd.exe",
    ["/d", "/s", "/c", "node_modules\\.bin\\supabase.cmd status --output json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ),
);
assert.equal(status.API_URL, "http://127.0.0.1:54321");
const client = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
function sql(query) {
  const result = spawnSync(
    "docker",
    [
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
    ],
    { input: query, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("Local fixture SQL failed");
  return result.stdout.trim();
}
const owner = "61000000-0000-0000-0000-000000000001";
const target = "62000000-0000-0000-0000-000000000001";
const mailbox = `local-invite-confirm-${Date.now()}`;
const email = mailbox + "@example.test";
const token = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
function cleanup() {
  sql(`delete from public.passenger_invites where passenger_id='${target}';
    delete from public.passenger_accounts where passenger_id='${target}';
    delete from public.passengers where id='${target}';
    delete from public.responsible_accounts where user_id='${owner}';
    delete from auth.users where id='${owner}' or email='${email}';`);
}
try {
  cleanup();
  sql(`insert into auth.users(id,email) values('${owner}','local-confirm-owner@example.test');
    insert into public.responsible_accounts(user_id) values('${owner}');
    insert into public.passengers(id,user_id,name,default_daily_rate) values('${target}','${owner}','Synthetic email confirmation target',10);
    set role authenticated; set request.jwt.claim.sub='${owner}';
    select public.create_passenger_invite('${target}','${token}');`);
  const signup = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: "http://127.0.0.1:5173/convite" },
  });
  assert.equal(signup.error, null);
  assert.equal(
    signup.data.session,
    null,
    "Email confirmation must leave signup unauthenticated",
  );
  const id = signup.data.user?.id;
  assert.ok(id);
  assert.ok(
    (await client.auth.signInWithPassword({ email, password })).error,
    "Unconfirmed login must fail",
  );
  assert.ok(
    (await client.rpc("redeem_passenger_invite", { invite_code: token })).error,
    "Anon redemption must fail",
  );
  assert.equal(
    sql(`select used from public.passenger_invites where passenger_id='${target}'`),
    "f",
  );
  let messages = [];
  for (let n = 0; n < 40 && !messages.length; n++) {
    const inbox = await (await fetch("http://127.0.0.1:54324/api/v1/messages")).json();
    messages = inbox.messages.filter((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    if (!messages.length) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(messages.length, "Local confirmation email received");
  const message = await (
    await fetch(`http://127.0.0.1:54324/api/v1/message/${messages[0].ID}`)
  ).json();
  const href = message.HTML.match(
    /href="([^"]+\/auth\/v1\/verify[^"]+)"/,
  )?.[1]?.replaceAll("&amp;", "&");
  assert.ok(href, "Confirmation link found in local mailbox");
  const confirmation = new URL(href);
  assert.equal(confirmation.origin, "http://127.0.0.1:54321");
  assert.equal(
    confirmation.searchParams.get("redirect_to"),
    "http://127.0.0.1:5173/convite",
  );
  assert.ok(
    !confirmation.href.includes(token),
    "Invite bearer is absent from confirmation URL",
  );
  const verified = await fetch(confirmation, { redirect: "manual" });
  assert.ok([302, 303].includes(verified.status));
  const destination = new URL(verified.headers.get("location"));
  assert.equal(destination.origin, "http://127.0.0.1:5173");
  assert.equal(destination.pathname, "/convite");
  assert.ok(!new URLSearchParams(destination.hash.slice(1)).has("error"));
  const login = await client.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null);
  assert.equal(login.data.user.id, id);
  assert.equal(
    (await client.rpc("redeem_passenger_invite", { invite_code: token })).error,
    null,
  );
  assert.equal(
    sql(`select count(*) from public.passenger_invites i join public.passenger_accounts a on a.passenger_id=i.passenger_id
    where i.passenger_id='${target}' and i.used and i.used_at is not null and i.used_by='${id}' and a.user_id='${id}'`),
    "1",
  );
  console.log(
    "LOCAL email confirmation PASS: signup without session; no early consumption; real mailbox/verification redirect; confirmed login; coherent redemption.",
  );
} finally {
  await client.auth.signOut();
  cleanup();
}
