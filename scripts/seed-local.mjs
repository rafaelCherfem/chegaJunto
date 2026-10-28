// Dados de teste para o Supabase LOCAL (mês atual e dois anteriores).
//
// Segurança: recusa rodar com vínculo remoto ou fora de localhost/127.0.0.1 (as mesmas
// travas de local-environment.mjs). A service key vem da CLI local, fica só em memória
// e serve apenas para criar o usuário de teste e o vínculo de responsável. Passageiros,
// diárias e caronas entram logados como o usuário de teste, e todo pagamento passa pelas
// RPCs do app (close_month, pay_charge). Nada é apagado: a auditoria financeira é
// append-only, então para recriar os dados use `npx supabase db reset --local --no-seed`.
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalProject,
  frontendEnv,
  readLocalStatus,
} from "./local-environment.mjs";

const TEST_EMAIL = "teste@rideledger.local";
const TEST_PASSWORD = "teste123456";
const TIME_ZONE = "America/Sao_Paulo";
const RESET_HINT =
  "Rode `npx supabase db reset --local --no-seed` e depois `npm run seed:local` de novo.";

const PASSENGERS = [
  { name: "Ana Beatriz Souza", rate: 18 },
  { name: "Carlos Eduardo Lima", rate: 25 },
  { name: "Marina Duarte", rate: 32 },
  { name: "João Pedro Alves", rate: 22 },
];

// outcome: pending (sem pagamento), partial (paga e lança outra diária depois),
// paid (paga por completo), refund (paga e apaga diárias depois: saldo a devolver).
const MONTHS = [
  {
    offset: -2,
    entries: [
      { rides: 9, outcome: "pending" },
      { rides: 14, outcome: "partial" },
      { rides: 8, outcome: "paid" },
      { rides: 12, outcome: "paid" },
    ],
  },
  {
    offset: -1,
    entries: [
      { rides: 11, outcome: "paid" },
      { rides: 13, outcome: "paid", received: 25 },
      { rides: 7, outcome: "paid" },
      { rides: 10, outcome: "paid" },
    ],
  },
  {
    offset: 0,
    entries: [
      { rides: 6, outcome: "pending", received: 15 },
      { rides: 9, outcome: "partial" },
      { rides: 7, outcome: "paid" },
      { rides: 11, outcome: "refund" },
    ],
  },
];

const STATE_BY_OUTCOME = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  refund: "Quitado com saldo a devolver",
};

const secrets = [];

function scrub(text) {
  let out = String(text);
  for (const secret of secrets) if (secret) out = out.split(secret).join("[oculto]");
  return out;
}

function unwrap(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url")).role;
  } catch {
    return undefined;
  }
}

const cents = (value) => Math.round(Number(value) * 100);
const money = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function todayInSaoPaulo() {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE })
    .format(new Date())
    .split("-")
    .map(Number);
  return { y, m, d };
}

function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Dias úteis do mês; no mês atual só até hoje, porque o banco recusa datas futuras.
function monthInfo(today, offset) {
  const base = new Date(Date.UTC(today.y, today.m - 1 + offset, 1));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  const next = new Date(Date.UTC(y, m, 1));
  const last = offset === 0 ? today.d : new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  for (let d = 1; d <= last; d++) {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(isoDate(y, m, d));
  }
  return {
    first: isoDate(y, m, 1),
    next: isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, 1),
    days,
  };
}

function spread(days, count) {
  return Array.from(
    { length: count },
    (_, i) => days[Math.floor((i * days.length) / count)],
  );
}

async function connect() {
  assertLocalProject();
  const status = await readLocalStatus();
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey } = frontendEnv(status);
  const serviceKey = status.SERVICE_ROLE_KEY;
  secrets.push(anonKey, serviceKey);
  if (typeof serviceKey !== "string" || jwtRole(serviceKey) !== "service_role") {
    throw new Error("SERVICE_ROLE_KEY local ausente ou inválida no status do Supabase.");
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    admin: createClient(url, serviceKey, options),
    user: createClient(url, anonKey, options),
  };
}

async function ensureTestUser(admin) {
  const list = unwrap(
    await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    "Listar usuários locais",
  );
  let found = list.users.find((u) => u.email === TEST_EMAIL);
  if (!found) {
    found = unwrap(
      await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      }),
      "Criar usuário de teste",
    ).user;
  }
  const link = unwrap(
    await admin
      .from("responsible_accounts")
      .select("user_id")
      .eq("user_id", found.id)
      .maybeSingle(),
    "Consultar conta de responsável",
  );
  if (!link) {
    unwrap(
      await admin.from("responsible_accounts").insert({ user_id: found.id }),
      "Vincular conta de responsável",
    );
  }
  return found.id;
}

async function signIn(user) {
  const { error } = await user.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) {
    throw new Error(
      "Não foi possível entrar como o usuário de teste (a senha local mudou?). Nada foi criado.",
    );
  }
}

async function counts(admin, userId) {
  const result = {};
  for (const table of [
    "passengers",
    "rides",
    "received_rides",
    "monthly_charges",
    "monthly_charge_events",
  ]) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw new Error(`Contar ${table}: ${error.message}`);
    result[table] = count;
  }
  return result;
}

async function chargeOf(user, passengerId, first) {
  return unwrap(
    await user
      .from("monthly_charges")
      .select("id,revision,total_amount,paid_amount,paid")
      .eq("passenger_id", passengerId)
      .eq("reference_month", first)
      .single(),
    "Ler cobrança",
  );
}

async function payOutstanding(user, passengerId, first) {
  const charge = await chargeOf(user, passengerId, first);
  unwrap(
    await user
      .rpc("pay_charge", { target_charge: charge.id, expected_revision: charge.revision })
      .single(),
    "Registrar pagamento",
  );
}

async function seedMonth(user, userId, passengers, today, plan) {
  const info = monthInfo(today, plan.offset);
  if (info.days.length < 4) {
    throw new Error(
      `Poucos dias úteis (${info.days.length}) no mês de ${info.first}. Rode a partir do dia 6.`,
    );
  }
  const picks = plan.entries.map((entry, index) => {
    const count = Math.min(entry.rides, info.days.length - 1);
    const days = spread(info.days, count);
    return {
      passenger: passengers[index],
      entry,
      days,
      spare: info.days.find((d) => !days.includes(d)),
    };
  });

  const rides = picks.flatMap(({ passenger, days }) =>
    days.map((ride_date, i) => ({
      user_id: userId,
      passenger_id: passenger.id,
      ride_date,
      rate_charged: passenger.rate + (i % 5 === 4 ? 6 : 0),
    })),
  );
  unwrap(await user.from("rides").insert(rides), "Inserir diárias");

  const received = picks
    .filter(({ entry }) => entry.received)
    .map(({ passenger, entry }) => ({
      user_id: userId,
      passenger_id: passenger.id,
      received_date: info.days[1],
      amount: entry.received,
    }));
  if (received.length) {
    unwrap(
      await user.from("received_rides").insert(received),
      "Inserir caronas recebidas",
    );
  }

  unwrap(await user.rpc("close_month", { month_date: info.first }), "Fechar mês");

  for (const { passenger, entry, spare } of picks) {
    if (entry.outcome === "pending") continue;
    await payOutstanding(user, passenger.id, info.first);
    if (entry.outcome === "partial") {
      unwrap(
        await user.from("rides").insert({
          user_id: userId,
          passenger_id: passenger.id,
          ride_date: spare,
          rate_charged: passenger.rate,
        }),
        "Inserir diária depois do pagamento",
      );
    }
    if (entry.outcome === "refund") {
      const last = unwrap(
        await user
          .from("rides")
          .select("id")
          .eq("passenger_id", passenger.id)
          .gte("ride_date", info.first)
          .lt("ride_date", info.next)
          .order("ride_date", { ascending: false })
          .limit(2),
        "Ler diárias a remover",
      );
      unwrap(
        await user
          .from("rides")
          .delete()
          .in(
            "id",
            last.map((r) => r.id),
          ),
        "Remover diárias depois do pagamento",
      );
    }
  }
}

function stateOf(charge) {
  const total = cents(charge.total_amount);
  const paid = cents(charge.paid_amount);
  if (!charge.paid) return paid === 0 ? "Pendente" : "Parcial";
  if (paid === total) return "Pago";
  return paid > total ? "Quitado com saldo a devolver" : "Quitado";
}

async function summarize(user, passengers, today) {
  const rows = [];
  const names = new Map(passengers.map((p) => [p.id, p.name]));
  for (const plan of MONTHS) {
    const info = monthInfo(today, plan.offset);
    const charges = unwrap(
      await user
        .from("monthly_charges")
        .select("passenger_id,total_amount,paid_amount,paid")
        .eq("reference_month", info.first),
      "Ler cobranças para o resumo",
    );
    plan.entries.forEach((entry, index) => {
      const passenger = passengers[index];
      const charge = charges.find((c) => c.passenger_id === passenger.id);
      const expected = STATE_BY_OUTCOME[entry.outcome];
      const found = charge ? stateOf(charge) : "sem cobrança";
      if (found !== expected) {
        throw new Error(
          `Estado inesperado de ${names.get(passenger.id)} em ${info.first}: esperado "${expected}", encontrado "${found}". ${RESET_HINT}`,
        );
      }
      const total = Number(charge.total_amount);
      const paid = Number(charge.paid_amount);
      rows.push({
        Mês: info.first.slice(0, 7),
        Passageiro: names.get(passenger.id),
        Total: money(total),
        Pago: money(paid),
        "A pagar": money(Math.max(total - paid, 0)),
        "Saldo a devolver": money(Math.max(paid - total, 0)),
        Estado: found,
      });
    });
  }
  console.table(rows);
}

async function main() {
  const { admin, user } = await connect();
  const userId = await ensureTestUser(admin);
  await signIn(user);
  const today = todayInSaoPaulo();

  const before = await counts(admin, userId);
  const existing = unwrap(
    await admin.from("passengers").select("id,name").eq("user_id", userId),
    "Consultar passageiros",
  );

  let passengers;
  if (existing.length === 0) {
    const inserted = unwrap(
      await user
        .from("passengers")
        .insert(
          PASSENGERS.map((p) => ({
            user_id: userId,
            name: p.name,
            default_daily_rate: p.rate,
          })),
        )
        .select("id,name"),
      "Inserir passageiros",
    );
    passengers = PASSENGERS.map((p) => ({
      ...p,
      id: inserted.find((row) => row.name === p.name).id,
    }));
    for (const plan of MONTHS) {
      await seedMonth(user, userId, passengers, today, plan);
    }
    console.log("Dados de teste criados.");
  } else {
    passengers = PASSENGERS.map((p) => ({
      ...p,
      id: existing.find((row) => row.name === p.name)?.id,
    }));
    if (existing.length !== PASSENGERS.length || passengers.some((p) => !p.id)) {
      throw new Error(
        `O usuário de teste já tem passageiros que não são os do seed. ${RESET_HINT}`,
      );
    }
    console.log("Seed já aplicado: nada foi criado. Conferindo o estado atual.");
  }

  await summarize(user, passengers, today);
  const after = await counts(admin, userId);
  console.log("Linhas do usuário de teste (antes -> depois):");
  for (const table of Object.keys(after)) {
    console.log(`  ${table}: ${before[table]} -> ${after[table]}`);
  }
}

main().catch((error) => {
  console.error(scrub(error.message));
  process.exitCode = 1;
});
