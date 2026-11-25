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
  // Quinto passageiro: um ciclo livre que cruza meses (ver seedCycle).
  { name: "Fernanda Rocha", rate: 28 },
  // Sexto passageiro: o caso real do ciclo em aberto (ver seedOpenCycle).
  { name: "Paulo Ribeiro", rate: 20 },
];
const MONTHLY_PASSENGERS = 4; // os quatro primeiros seguem os MONTHS; o quinto usa close_cycle.
const OPEN_CYCLE_PASSENGER = 5; // o sexto fica com o ciclo em aberto (extensível).

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
    // Diárias do sexto passageiro neste mês: o close_month deste mês cria a cobrança de mês inteiro
    // que depois fica em aberto (ver seedOpenCycle). Ele não tem diária em outro mês antes disso.
    openCycleRides: 8,
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

// Adiantamento de valor livre (register_payment), sempre como o usuário de teste: a revisão
// é lida de novo a cada pagamento, porque cada um sobe a revisão da cobrança.
async function registerFreePayment(user, chargeId, amount, context) {
  const { data: current } = await user
    .from("monthly_charges")
    .select("revision")
    .eq("id", chargeId)
    .single();
  unwrap(
    await user
      .rpc("register_payment", {
        target_charge: chargeId,
        payment_amount: amount,
        expected_revision: current.revision,
      })
      .single(),
    context,
  );
}

// Dois adiantamentos do ciclo livre (Fernanda) e o segundo do ciclo em aberto (Paulo).
const CYCLE_ADVANCES = [10, 8.5];
const OPEN_CYCLE_SECOND_ADVANCE = 10.5;

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
  if (plan.openCycleRides) {
    const openPassenger = passengers[OPEN_CYCLE_PASSENGER];
    for (const ride_date of spread(info.days, Math.min(plan.openCycleRides, info.days.length))) {
      rides.push({
        user_id: userId,
        passenger_id: openPassenger.id,
        ride_date,
        rate_charged: openPassenger.rate,
      });
    }
  }
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

// Ciclo livre do quinto passageiro: diárias dos dias úteis do primeiro dia útil do mês
// anterior até hoje (menos um dia deixado de fora), close_cycle(hoje), um pagamento e,
// depois dele, a diária que faltava dentro do ciclo já fechado (pagamento parcial).
// Entra DEPOIS dos meses: se tivesse diária antes, o close_month dos outros a incluiria.
function cycleWindow(today) {
  const previous = monthInfo(today, -1);
  const current = monthInfo(today, 0);
  const days = [...previous.days, ...current.days];
  const spare = days[Math.floor(days.length / 2)];
  return {
    start: days[0],
    end: isoDate(today.y, today.m, today.d),
    days,
    spare,
  };
}

async function seedCycle(user, userId, passenger, today) {
  const window = cycleWindow(today);
  if (window.days.length < 6) {
    throw new Error(`Poucos dias úteis (${window.days.length}) para o ciclo livre. Rode a partir do dia 6.`);
  }
  const rides = window.days
    .filter((d) => d !== window.spare)
    .map((ride_date) => ({
      user_id: userId,
      passenger_id: passenger.id,
      ride_date,
      rate_charged: passenger.rate,
    }));
  unwrap(await user.from("rides").insert(rides), "Inserir diárias do ciclo livre");

  const summary = unwrap(
    await user.rpc("close_cycle", { end_date: window.end }),
    "Fechar ciclo",
  );
  const mine = summary.find((row) => row.passenger_id === passenger.id);
  if (!mine || mine.status !== "CLOSED") {
    throw new Error(
      `close_cycle não fechou o ciclo do quinto passageiro (status ${mine?.status ?? "ausente"}). ${RESET_HINT}`,
    );
  }
  unwrap(
    await user
      .rpc("pay_charge", { target_charge: mine.charge_id, expected_revision: 1 })
      .single(),
    "Registrar pagamento do ciclo",
  );
  unwrap(
    await user.from("rides").insert({
      user_id: userId,
      passenger_id: passenger.id,
      ride_date: window.spare,
      rate_charged: passenger.rate,
    }),
    "Inserir diária dentro do ciclo fechado",
  );
  // Depois da diária que faltava, dois adiantamentos de valor livre sobre o que ficou em aberto.
  for (const amount of CYCLE_ADVANCES) {
    await registerFreePayment(user, mine.charge_id, amount, "Registrar adiantamento do ciclo livre");
  }
}

// Último dia do mês de uma faixa de monthInfo (o dia anterior ao primeiro do mês seguinte).
function lastDayOf(info) {
  const [y, m] = info.next.split("-").map(Number);
  // info.next é o dia 1 do mês seguinte; o "dia 0" dele é o último dia do mês da faixa.
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

// Caso real: o mês da conversão fica ABERTO e cresce. O sexto passageiro fecha o mês anterior
// (close_month, igual aos outros), a cobrança dele é marcada como extensível e, depois, entram
// diárias do mês atual e um pagamento parcial. Resultado: um ciclo "do dia 1 do mês anterior até
// hoje" com total vivo, parte já paga e o resto a pagar.
// A marcação é um UPDATE com a service key do Supabase LOCAL (a mesma trava do resto do seed);
// em produção ela é feita à mão por scripts/marcar-extensivel-producao.sql.
// Entra DEPOIS dos meses e do ciclo livre: com um ciclo extensível, close_month passa a recusar.
async function seedOpenCycle(admin, user, userId, passenger, today) {
  const previous = monthInfo(today, -1);
  const current = monthInfo(today, 0);
  const charge = await chargeOf(user, passenger.id, previous.first);
  const marked = unwrap(
    await admin
      .from("monthly_charges")
      .update({ extensible: true })
      .eq("id", charge.id)
      .eq("user_id", userId)
      .eq("extensible", false)
      .select("id"),
    "Marcar o ciclo como em aberto",
  );
  if (marked.length !== 1) {
    throw new Error(`Não foi possível marcar o ciclo de ${passenger.name} como em aberto. ${RESET_HINT}`);
  }
  const days = current.days.slice(0, Math.min(4, current.days.length));
  if (days.length < 2) {
    throw new Error(`Poucos dias úteis (${days.length}) no mês atual para o ciclo em aberto. Rode a partir do dia 3.`);
  }
  unwrap(
    await user.from("rides").insert(
      days.map((ride_date) => ({
        user_id: userId,
        passenger_id: passenger.id,
        ride_date,
        rate_charged: passenger.rate,
      })),
    ),
    "Inserir diárias do ciclo em aberto",
  );
  const live = await chargeOf(user, passenger.id, previous.first);
  const amount = Math.floor(Number(live.total_amount) / 2);
  unwrap(
    await user
      .rpc("register_payment", {
        target_charge: live.id,
        payment_amount: amount,
        expected_revision: live.revision,
      })
      .single(),
    "Registrar pagamento parcial do ciclo em aberto",
  );
  await registerFreePayment(user, live.id, OPEN_CYCLE_SECOND_ADVANCE, "Registrar o segundo adiantamento do ciclo em aberto");
}

// Pagamentos em vigor (PAYMENT sem CANCEL) de uma cobrança, direto dos eventos.
async function paymentsOf(user, chargeId) {
  const events = unwrap(
    await user
      .from("monthly_charge_events")
      .select("id,kind,signed_amount,related_payment_id")
      .eq("monthly_charge_id", chargeId)
      .in("kind", ["PAYMENT", "CANCEL"]),
    "Ler os pagamentos da cobrança",
  );
  const cancelled = new Set(events.filter((e) => e.kind === "CANCEL").map((e) => e.related_payment_id));
  const live = events.filter((e) => e.kind === "PAYMENT" && !cancelled.has(e.id));
  return { count: live.length, cents: live.reduce((sum, e) => sum + cents(e.signed_amount), 0) };
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
  // Ciclo livre do quinto passageiro: confere período e estado esperados.
  const cyclePassenger = passengers[MONTHLY_PASSENGERS];
  const window = cycleWindow(today);
  const cycle = unwrap(
    await user
      .from("monthly_charges")
      .select("id,total_amount,paid_amount,paid,period_start,period_end")
      .eq("passenger_id", cyclePassenger.id),
    "Ler o ciclo livre para o resumo",
  );
  const found = cycle.length === 1 ? stateOf(cycle[0]) : `${cycle.length} cobranças`;
  if (
    cycle.length !== 1 ||
    cycle[0].period_start !== window.start ||
    cycle[0].period_end !== window.end ||
    found !== "Parcial"
  ) {
    throw new Error(
      `Ciclo livre de ${cyclePassenger.name} fora do esperado (${window.start} a ${window.end}, "Parcial"); encontrado: ${found}. ${RESET_HINT}`,
    );
  }
  // Pagamento integral + dois adiantamentos; o que falta é a diária de depois menos os adiantamentos.
  const cyclePayments = await paymentsOf(user, cycle[0].id);
  const advances = CYCLE_ADVANCES.reduce((sum, amount) => sum + cents(amount), 0);
  if (
    cyclePayments.count !== 1 + CYCLE_ADVANCES.length ||
    cyclePayments.cents !== cents(cycle[0].paid_amount) ||
    cents(cycle[0].total_amount) - cents(cycle[0].paid_amount) !== cents(cyclePassenger.rate) - advances
  ) {
    throw new Error(
      `Adiantamentos de ${cyclePassenger.name} fora do esperado (${1 + CYCLE_ADVANCES.length} pagamentos somando o pago, faltando ${money(cyclePassenger.rate - advances / 100)}). ${RESET_HINT}`,
    );
  }
  const total = Number(cycle[0].total_amount);
  const paid = Number(cycle[0].paid_amount);
  rows.push({
    Mês: `${window.start} a ${window.end}`,
    Passageiro: cyclePassenger.name,
    Total: money(total),
    Pago: money(paid),
    "A pagar": money(Math.max(total - paid, 0)),
    "Saldo a devolver": money(Math.max(paid - total, 0)),
    Estado: found,
  });
  // Ciclo em aberto do sexto passageiro: extensível, com o total vivo e pagamento parcial.
  const openPassenger = passengers[OPEN_CYCLE_PASSENGER];
  const previous = monthInfo(today, -1);
  const open = unwrap(
    await user
      .from("monthly_charges")
      .select("id,total_amount,paid_amount,paid,period_start,period_end,extensible")
      .eq("passenger_id", openPassenger.id),
    "Ler o ciclo em aberto para o resumo",
  );
  const openRides = unwrap(
    await user.from("rides").select("rate_charged").eq("passenger_id", openPassenger.id),
    "Ler as diárias do ciclo em aberto",
  );
  const liveTotal = openRides.reduce((sum, ride) => sum + cents(ride.rate_charged), 0);
  const openState = open.length === 1 ? stateOf(open[0]) : `${open.length} cobranças`;
  if (
    open.length !== 1 ||
    open[0].extensible !== true ||
    open[0].period_start !== previous.first ||
    open[0].period_end !== lastDayOf(previous) ||
    cents(open[0].total_amount) !== liveTotal ||
    openState !== "Parcial"
  ) {
    throw new Error(
      `Ciclo em aberto de ${openPassenger.name} fora do esperado (extensível desde ${previous.first}, total vivo ${money(liveTotal / 100)}, "Parcial"); encontrado: ${openState}. ${RESET_HINT}`,
    );
  }
  // Primeiro pagamento = metade do total (arredondada para baixo) e o segundo adiantamento fixo.
  const openPayments = await paymentsOf(user, open[0].id);
  if (
    openPayments.count !== 2 ||
    openPayments.cents !== cents(open[0].paid_amount) ||
    cents(open[0].paid_amount) !== Math.floor(Number(open[0].total_amount) / 2) * 100 + cents(OPEN_CYCLE_SECOND_ADVANCE)
  ) {
    throw new Error(
      `Adiantamentos de ${openPassenger.name} fora do esperado (2 pagamentos, o segundo de ${money(OPEN_CYCLE_SECOND_ADVANCE)}). ${RESET_HINT}`,
    );
  }
  const openTotal = Number(open[0].total_amount);
  const openPaid = Number(open[0].paid_amount);
  rows.push({
    Mês: `${previous.first} a hoje (em aberto)`,
    Passageiro: openPassenger.name,
    Total: money(openTotal),
    Pago: money(openPaid),
    "A pagar": money(Math.max(openTotal - openPaid, 0)),
    "Saldo a devolver": money(Math.max(openPaid - openTotal, 0)),
    Estado: openState,
  });
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
    await seedCycle(user, userId, passengers[MONTHLY_PASSENGERS], today);
    await seedOpenCycle(admin, user, userId, passengers[OPEN_CYCLE_PASSENGER], today);
    console.log("Dados de teste criados.");
  } else {
    passengers = PASSENGERS.map((p) => ({
      ...p,
      id: existing.find((row) => row.name === p.name)?.id,
    }));
    if (existing.length !== PASSENGERS.length) {
      throw new Error(
        `O banco local tem ${existing.length} passageiro(s) e este seed espera ${PASSENGERS.length} (o seed ganhou o ciclo livre do quinto passageiro). Os dados são de uma versão anterior do seed e não dá para completá-los sem apagar. ${RESET_HINT}`,
      );
    }
    if (passengers.some((p) => !p.id)) {
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
