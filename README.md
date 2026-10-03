# RideLedger

Controle de diárias de carona, sem caderno.

## Testes locais

Node 24 foi utilizado nesta baseline. Instale as dependências com `npm ci`.

- `npm test`: Vitest em modo watch.
- `npm run test:run`: execução única da baseline e relatório de especificações TODO.
- `npm run typecheck`: TypeScript da aplicação, configurações e testes.
- `npm run lint`: ESLint.
- `npm run build`: build de produção.

Os testes em `tests/` usam serviços simulados, desabilitam fetch/XMLHttpRequest e
não carregam arquivos .env na configuração Vitest. Nunca informe credenciais,
URLs ou dados de produção aos testes. O build não conecta ao Supabase.

`monthlyTotals.ts` apenas extrai a soma decimal existente do service, sem mudar
contratos ou comportamento. A ausência de lançamentos continua produzindo mapa
vazio; isso ainda não reconcilia uma cobrança antiga. Os testes registram o erro
normal de ponto flutuante. A migração para centavos é uma etapa futura.

`session.characterization.test.tsx` foi convertido em regressão de isolamento na
Etapa 3. Usa AuthProvider, hooks, RoleRouter e QueryClient reais com Auth/services
simulados. Verifica transições, papéis, erros, requests e mutations tardias,
novo login, estado local e PDF sem acesso à rede.

`tests/future/` contém especificações `it.todo`: transições de quitação integral,
centavos, timezone America/Sao_Paulo, validação de futuro, fechamento vazio e flags.
TODO não significa teste aprovado ou cobertura. O conjunto padrão permanece verde;
nenhuma regra futura foi conectada à aplicação nesta etapa.
O TODO de sessão se refere agora ao E2E com Auth real e duas abas; o cenário com
eventos simulados está implementado nas regressões da Etapa 3.

## Banco local — Etapa 2B validada

Docker Desktop 29.0.1, contexto desktop-linux e backend WSL2 foram verificados.
Supabase CLI 2.119.0 está fixada como devDependency; PostgreSQL local: 17.11.
`supabase/config.toml` usa o identificador local rideledger, sem vínculo remoto.
`supabase/.gitignore` exclui .temp, .branches e arquivos locais de credenciais.

Com Docker Desktop ativo, no PowerShell:

```powershell
# Pare se este arquivo existir: indica vínculo remoto do CLI.
if (Test-Path supabase/.temp/project-ref) { throw 'Vínculo remoto encontrado' }
& .\node_modules\.bin\supabase.cmd start
& .\node_modules\.bin\supabase.cmd db reset --local --no-seed
& .\node_modules\.bin\supabase.cmd test db --local
```

O reset elimina exclusivamente os dados do banco local descartável. Não usar
login, link, --linked, db push, db pull ou connection strings remotas. Não copiar
.env nem dados de produção. Fixtures são sintéticas e terminam com ROLLBACK.

Duas reconstruções limpas 0001→0005 passaram, cada uma seguida de 152 asserções
pgTAP aprovadas, zero falhas/skipped/TODO. O primeiro ensaio revelou erros no teste:
aspas duplicadas em UPDATE direto e CTEs de escrita abaixo do nível superior.
Foram corrigidas quatro consultas, preservando as 152 asserções e a migration 0005.
A notice de pgTAP já instalado é esperada e não representa asserção skipped.

Inspeção efetiva: oito tabelas com RLS, 31 policies, oito PKs, UNIQUEs históricos,
cinco FKs compostas ON DELETE RESTRICT, 11 triggers e funções/grants previstos.
RLS A/B, relações cruzadas, identidade forjada, imutabilidade, conta sem vínculo,
passageiro, anônimo e FKs sob postgres passaram. A RPC rejeitou anon em execução
real; PUBLIC/anon não executam funções da 0005. authenticated executa apenas
is_responsible e redeem_passenger_invite entre essas funções; funções de trigger
não são executáveis por clientes. postgres/service_role conservam acesso técnico.
A função histórica set_updated_at conserva EXECUTE PUBLIC/anon/authenticated:
não é uma nova RPC administrativa e não foi alterada nesta etapa.

## Etapa 2 — papéis e isolamento (validada em banco local)

`0005_roles_and_isolation.sql` mantém 0001–0004 imutáveis. Destina-se à cadeia
completa em banco vazio; não promove usuários existentes nem faz backfill de papel.
`responsible_accounts` é a concessão administrativa explícita; `passenger_accounts`
continua sendo o vínculo de passageiro. A conta sem ambos fica sem acesso associado.
Conceder responsabilidade exige administrador confiável: nunca uma chamada do
frontend nem chave service_role na aplicação. O UUID precisa existir no Auth local.

A migration usa FKs compostas, RESTRICT nas dependências de passageiro e triggers
para imutabilidade e exclusividade de papel. `is_responsible` é SECURITY INVOKER.
A função de exclusividade é DEFINER para consultar e bloquear a identidade Auth,
serializando concessões dos dois papéis. Não tem EXECUTE para clientes. A RPC de
resgate conserva o contrato antigo e eleva privilégios apenas para vincular/consumir,
com nomes qualificados, search_path vazio e EXECUTE apenas para authenticated.

SELECT de cobrança continua exclusivo do responsável, conforme contrato atual do
portal. UPDATE de vínculo/convite não é concedido. SELECT de flags próprias foi
adicionado; repetição e retenção do histórico ainda serão outra etapa. CASCADE de
ride_flags ao excluir uma ride e demais cascatas Auth históricas permanecem para
revisão posterior. Exclusão completa ainda exige revisão; o novo RESTRICT pode
bloquear exclusões que antes eram aceitas pela interface.

`supabase/tests/0005_roles_and_isolation.test.sql` contém fixtures sintéticas e
asserções pgTAP de RLS, privilégios, INSERT/UPDATE cruzados, FKs sob postgres,
exclusividade, resgate e flags. Todo o teste termina com ROLLBACK.
Executado duas vezes com sucesso após reconstruções limpas locais.
Nenhum vínculo remoto foi criado.
Não publicar esta versão contra o schema antigo: a consulta de responsible_accounts
falhará e a interface fechará acesso. O responsável precisa ser provisionado no destino.

32 testes unitários/UI passaram na revisão inicial da Etapa 2. Os 20 da baseline e
14 TODO foram preservados. Na Etapa 3, todas as queries e mutations privadas
passaram a usar a fronteira de sessão e chaves por identidade.

A Etapa 2 está validada no banco local. Concorrência real de concessão/resgate e
preparação de migração/provisionamento em produção permanecem fora desta etapa.

## Etapa 3 — isolamento de sessão e cache

Todos os dados React Query atuais são privados. As chaves são centralizadas em
privateQueryKeys: `["private", userId, resource, ...parameters]`. Recursos:
passengers (lista/detalhe), rides (mês/passageiro), receivedRides, monthlyCharges,
passengerInvites, myPassengerAccount, accountAccess e rideFlags. Meses, filtros e
passengerId continuam nas chaves. Não há staleTime Infinity para identidade.
Todas as queries exigem usuário e Auth pronto; o staleTime padrão é 30 segundos.

AuthProvider trata mudança de user.id em qualquer evento Auth, não só no botão.
Revoga o escopo anterior, mostra estado neutro, cancela queries e limpa o
QueryClient inteiro, incluindo o cache de mutations. Publica a identidade nova
somente após cancelamento, descartando transições e getSession obsoletos. A árvore
de telas é remontada por geração, eliminando estado React privado anterior.
TOKEN_REFRESHED do mesmo usuário preserva a sessão. O router permanece externo
a essa fronteira para preservar navegação. RoleRouter usa a query de acesso
escopada, aguarda carregamento e continua fechando acesso em erro.

usePrivateQuery combina sinais de query e sessão; services passam AbortSignal
a PostgREST. Mesmo serviços que ignorem abort não podem publicar resultado antigo.
getCurrentUserId verifica a identidade esperada depois de getUser. Essa consulta
Auth não oferece o mesmo AbortSignal; sua resposta é validada antes de continuar.

usePrivateMutation revoga resultados tardios, desabilita retry e invalida somente
o prefixo do recurso da identidade capturada, se o escopo continuar ativo. Não há
optimistic updates. Leituras/escritas em múltiplos passos verificam o escopo antes
da próxima requisição; PDF verifica antes de download. Cadastro por convite
preserva a transição legítima e verifica a identidade do signup e o escopo antes
de resgatar/navegar. Nenhuma regra de convite/PDF/fechamento foi redesenhada.

Validação: 50 testes aprovados, 14 TODO futuros preservados; TypeScript, ESLint
dos arquivos alterados, build e diff-check. Cobertura inclui os oito cenários
obrigatórios A–H, hooks de todos os recursos, resposta antiga da mesma identidade
num novo login, mutation tardia, invalidação corrente, fechamento interrompido,
PDF tardio e continuidade segura de convite. Os testes usam mocks de Auth/rede:
não equivalem a um E2E de duas abas com servidor Auth real.

Limite: abort não desfaz escrita já aceita pelo servidor. Uma resposta tardia não
volta à UI/cache da nova sessão, mas o estado final no servidor pode exigir nova
consulta legítima. Logout exige que Supabase publique a mudança de sessão; falha
de signOut sem evento não é um logout confirmado. Migrations 0001–0005 e os
152 testes pgTAP não foram alterados nem reconstruídos nesta etapa.

Arquivos da Etapa 3:

- src/app/App.tsx; src/contexts/AuthContext.tsx.
- src/hooks/useAccountAccess.ts, useMonthlyCharges.ts, usePassengerAccount.ts,
  usePassengerInvites.ts, usePassengers.ts, usePrivateQuery.ts, useReceipt.ts,
  useReceivedRides.ts, useRideFlags.ts e useRides.ts.
- src/lib/privateQueryKeys.ts, sessionScope.ts e supabase.ts.
- src/services/accountAccess.service.ts, auth.service.ts, monthlyCharges.service.ts,
  passengerAccounts.service.ts, passengers.service.ts, receivedRides.service.ts,
  rideFlags.service.ts e rides.service.ts.
- src/pages/InviteRedemptionPage.tsx.
- tests/session.characterization.test.tsx, session.operations.test.ts,
  invite.session.test.tsx e accountAccess.service.test.ts; README.md.

RoleRouter.tsx mantém a implementação da Etapa 2; seu isolamento foi integrado
pela query escopada e fronteira Auth, com testes usando o componente real.
ESLint passou com zero erros e o aviso histórico de Fast Refresh em AuthContext.
Build passou com o aviso histórico de bundle grande.

## Checkpoint das Etapas 1–3

A cadeia 0001→0005 foi reconstruída novamente em Supabase local descartável:
152 asserções pgTAP aprovadas, zero falhas/skipped/TODO. Frontend: 50 aprovados,
14 TODO futuros. TypeScript, ESLint dos arquivos alterados, build e diff-check
passaram. O lint global conserva o erro histórico de require em tailwind.config.ts
e o aviso de Fast Refresh em AuthContext; o build conserva o aviso de bundle grande.

0001–0004 foram comparadas byte a byte ao checkout da base 25cd267; o conteúdo
versionado também é idêntico. A diferença entre o blob Git LF e o checkout CRLF
decorre exclusivamente da conversão do Git no Windows. 0005 é a única migration
nova. Foram revisados código, testes, config local, arquivos ignorados e lockfile:
nenhuma versão pré-existente do lockfile foi alterada. .temp e .branches do
Supabase, incluindo credenciais geradas localmente, ficam fora do commit.

Dependências novas de desenvolvimento, com versões instaladas:
Vitest 3.2.7; Testing Library React 16.3.3; Testing Library DOM 10.4.1;
jsdom 26.1.0; Supabase CLI 2.119.0.

Auditoria diagnóstica: 11 alertas de pacotes, nove altos e dois moderados,
nenhum crítico. Altos: brace-expansion, braces, chokidar, fast-glob, fast-uri,
js-yaml, micromatch, nanoid e tailwindcss. Moderados: vitest e @vitest/mocker.
Há alertas agregados por cadeia transitiva, não onze falhas independentes.

Os nove altos envolvem tooling de build/lint e versões já presentes na base.
npm audit --omit=dev ainda lista seis altos porque tailwindcss-animate, declarado
como dependency, mantém Tailwind/PostCSS e suas transitivas via peers. Isso não
prova execução desses pacotes no browser: a aplicação usa esse conjunto no build.
Não foi identificado uso dessas APIs afetadas no runtime da aplicação.

Vitest/@vitest/mocker foram introduzidos pela baseline e estão afetados por
[GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
A falha trata leitura de arquivos pelo servidor de mocks. O projeto usa jsdom,
sem browser mode, mockerPlugin ou interceptorPlugin configurados. A rota afetada
não está configurada; o alerta permanece como dívida de tooling. A correção oficial
exige Vitest 4.1.11 ou superior, sem backport para 3.x. Não foi feita atualização
major nem audit fix; reavaliar antes de habilitar plugins/browser mode ou expor
servidores de desenvolvimento.

Correções do checkpoint limitadas ao escopo: remoção de factory de chave não usada,
especificação explícita do TODO E2E real de sessão e atualização desta documentação.
Não foi implementada funcionalidade nova. Persistem os limites documentados de
concorrência real, E2E de Auth, escrita já aceita pelo servidor e preparo de produção.
