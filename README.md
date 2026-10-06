# RideLedger

Controle de diárias de carona, sem caderno.

## Preview local

Com Node e as dependências instaladas (`npm ci`): abra o Docker Desktop e,
na raiz deste worktree, execute:

```sh
npm run supabase:start
npm run dev:local
```

Abra a URL local indicada pelo Vite (normalmente `http://127.0.0.1:5173`).
Se o Supabase já está ativo, basta `npm run dev:local`. Ctrl+C encerra o
preview; os serviços e dados Supabase continuam disponíveis.

A CLI Supabase fixada no projeto fornece dinamicamente API_URL e ANON_KEY.
O launcher aceita apenas localhost/127.0.0.1, recusa `supabase/.temp/project-ref`
e passa somente as duas variáveis públicas ao Vite, sem gravar ou exibir chaves.
Não use credenciais de produção. `.env.local` não é necessário e os arquivos
`.env` são ignorados por este fluxo; a validação da aplicação permanece intacta.

`supabase:start` inicia explicitamente os serviços locais e reutiliza os volumes
existentes, sem reset. Em um ambiente ainda vazio, a CLI pode inicializar o banco
com as migrations locais. Os dois worktrees usam o mesmo project_id `rideledger`
e compartilham o ambiente Docker local. Para preview, não execute os comandos de
reconstrução/reset descritos nas evidências históricas abaixo. `dev:local` apenas
consulta o status e inicia o frontend; não inicia o banco, não modifica dados/Auth
e nunca usa SERVICE_ROLE_KEY no frontend.

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


## Etapa 4 — ciclo de vida dos convites

Implementação local, sem deploy: a migration 0006 substitui o código em claro por
SHA-256 (pgcrypto). Tokens novos usam 32 bytes de crypto.getRandomValues: 256 bits,
64 caracteres hexadecimais URL-safe. O banco guarda apenas token_hash; a lista
não fornece o token bruto. O responsável recebe o link uma vez, em memória:
`/convite#token=...`. O fragmento não é enviado nas requisições de navegação nem
como Referer. O token chega à RPC pelo corpo autenticado da requisição. Não há
logs de aplicação com o token, e erros inesperados são sanitizados.

created_at, expires_at, used_at/used_by e revoked_at representam Pendente, Usado,
Expirado e Revogado. expires_at é exatamente created_at + 168 horas, garantido
por constraint e RPC, independente de timezone/DST. Resgate usa clock_timestamp,
incluindo tempo gasto esperando locks. Revogação própria é idempotente para
convite já revogado; usado não pode ser revogado. Criar novo convite revoga o
anterior ainda não usado, inclusive expirado: há um índice único parcial por
passageiro para impedir dois pendentes. Um alvo já vinculado não pode ser convidado.

RPCs create_passenger_invite, revoke_passenger_invite e redeem_passenger_invite
usam SECURITY DEFINER (necessário para alterações negadas diretamente aos clientes),
search_path vazio e objetos qualificados. PUBLIC/anon não executam; authenticated
executa, com auth.uid e papel explícito validados internamente. Responsável lê
somente seus convites por RLS, sem INSERT/UPDATE/DELETE direto. Passageiro/unlinked
não lista. FKs compostas e exclusividade responsible/passenger permanecem.

Criação/revogação/resgate serializam pelo lock do passageiro antes do convite.
Resgate também trava auth.users para exclusividade de papel. Vínculo e consumo
ocorrem na mesma transação, com UNIQUE(passenger_id) como segunda barreira.
Usuário já vinculado não troca de owner por convite. O fluxo mantém queries,
mutations e respostas tardias escopadas por sessão, inclusive na criação/revogação.

A página aceita conta existente ou cadastro. Signup sem sessão não consome o
convite. Token de continuidade fica apenas em sessionStorage, com prazo máximo
de sete dias e remoção no sucesso; não vai para localStorage nem para emailRedirectTo.
Confirmação retorna a /convite e recupera o token no mesmo contexto de navegador.
O usuário confirma explicitamente a conta pelo botão Usar convite. Em outra aba
sem sessionStorage compartilhado ou outro navegador, deve reabrir o link original.
O banco continua sendo a autoridade para a expiração. A configuração LOCAL usa
127.0.0.1:5173, permite /convite também em localhost:5173 e exige confirmação de
email. Uma implantação futura precisa configurar o domínio/redirect permitido no
Auth remoto; isso não foi executado nesta etapa.

0001–0005 permanecem intactas. A 0006 invalida códigos legados fracos pendentes,
preserva consumo histórico e elimina a coluna code. Antes de qualquer implantação
em dados reais, será necessária revisão/back-up e verificação das constraints em
linhas antigas (inclusive used_at fora dos sete dias ou timestamps contraditórios).
Nenhum backfill automático de responsible é introduzido.

Testes: as 152 asserções anteriores permanecem, com fixtures hash/contrato de
INSERT adaptadas à 0006; a fixture de FK usa alvo sem convite prévio para impedir
que UNIQUE mascare a FK. Há 59 novas asserções pgTAP. Frontend tem 82 testes
aprovados (50 anteriores + 32 novos), mantendo 14 TODO futuros. Os testes de
service exercitam mapeamento real dos códigos SQL e sanitização de erros de rede;
as regressões de sessão e signup anteriores continuam passando.

Scripts reprodutíveis, exclusivos do container/URLs locais e sem credenciais
persistidas ou impressas:

```sh
supabase db reset --local --yes
supabase test db --local
node scripts/test-invite-concurrency.mjs
node scripts/test-invite-confirmation.mjs
npm run test:run
npm run typecheck
npm run build
git diff --check
```

O teste concorrente abre duas conexões psql distintas, confirma ambas esperando
no mesmo lock, libera a barreira e exige um sucesso/um INVITE_USED, com exatamente
um vínculo e used_at/used_by coerentes. O teste de email usa Auth/SMTP/Mailpit
locais reais: sessão nula antes de confirmar, resgate anônimo negado, link real de
confirmação/redirect, login e RPC. Ambos limpam fixtures SQL sintéticas ao terminar.
Isso complementa RTL; não substitui E2E visual de navegador nem exercita produção.

Não há rate limit próprio de resgate nesta etapa (tokens têm alta entropia), nem
mudanças financeiras, flags, PDF, exclusão/desvinculação final ou dependências.
Abort não desfaz escrita já aceita pelo servidor. Tokens são credenciais bearer:
quem recebe um link válido pode resgatá-lo numa conta elegível; a proteção de XSS
e de observabilidade de infraestrutura permanece necessária. A lista deriva status
com relógio do dispositivo; a RPC sempre decide validade pelo relógio do banco.


Validação final da Etapa 4: duas reconstruções limpas 0001→0006 aprovadas,
211/211 pgTAP em cada uma (152 anteriores + 59 novos; zero failed/skipped/TODO),
concorrência real e confirmação real de email aprovadas em ambas. Frontend:
82 aprovados + 14 TODO futuros. TypeScript, ESLint dos arquivos alterados, build
e git diff --check aprovados. Build conserva somente o aviso de bundle >500 kB.
Sem dependências novas, commit, push ou acesso à produção. HEAD preservado:
0b91d2b81be2ae74858796d7611f4dec1610ff23, branch hardening/security-reliability.

Fluxo antigo revisado: Math.random gerava oito caracteres de alfabeto de 32
símbolos (40 bits nominais, sem fonte criptográfica), armazenados em code e no
caminho /convite/:code. Não havia expiração/revogação, a UI tratava qualquer
convite não usado como pendente, impedia conta já autenticada e exigia reabertura
manual após confirmação. A RPC da 0005 já tinha transação/locking e isolamento
de papéis; estes controles foram mantidos. Não foi encontrado logging explícito
do código no frontend antigo; o caminho podia chegar aos logs de navegação.

Arquivos da Etapa 4 (22; 14 modificados e oito novos):

```text
README.md
scripts/test-invite-concurrency.mjs
scripts/test-invite-confirmation.mjs
src/app/App.tsx
src/components/passengers/PassengerInvitePanel.tsx
src/hooks/usePassengerInvites.ts
src/lib/mappers.ts
src/pages/InviteRedemptionPage.tsx
src/services/auth.service.ts
src/services/passengerAccounts.service.ts
src/types/database.ts
src/types/entities.ts
src/utils/inviteCode.ts
src/utils/inviteStatus.ts
src/utils/pendingInvite.ts
supabase/config.toml
supabase/migrations/0006_invite_lifecycle.sql
supabase/tests/0005_roles_and_isolation.test.sql
supabase/tests/0006_invite_lifecycle.test.sql
tests/invite.lifecycle.test.tsx
tests/invite.service.test.ts
tests/invite.session.test.tsx
```


## Etapa 5 — datas e competência (validação de banco pendente)

Datas de negócio são datas civis Gregorianas YYYY-MM-DD, anos 0001–9999; não são
instantes UTC. utils/date centraliza validação estrita (incluindo bissextos),
comparação, competência YYYY-MM, reference_month YYYY-MM-01, início do mês seguinte,
navegação de mês, formatação e hoje em America/Sao_Paulo via Intl.formatToParts.
Nenhuma dependência foi adicionada ou atualizada. date-fns permanece instalado,
mas saiu dos dois filtros mensais; não há mais new Date(referenceMonth).

Problemas identificados: hoje e mês atual seguiam o dispositivo; os services
somavam um mês a uma data interpretada como UTC e formatavam o resultado no
horário local (podiam excluir o último dia); recebimentos sempre consultavam o
mês atual; não havia bloqueio real de datas futuras, nem validação de data/competência.
RidesPage já derivava o mês da seleção, e essa regra foi preservada.

Diária/compensação aceita hoje e retroativo, mas rejeita data inválida ou futura
antes de consultar/gravar. Inputs têm max com hoje em São Paulo, a compensação
valida também via schema e ambos os services repetem a proteção. O erro FUTURE_DATE
do banco é traduzido mesmo se o relógio do browser tiver permitido a data.
Os hooks desabilitam a consulta para seleção inválida/futura. Compensações consulta
a competência selecionada e mantém essa data após salvar. Fechamento apenas ganhou
validação de entrada canônica; cálculos, pagamento e versionamento não mudaram.
Todas as consultas DATE usam gte(primeiro dia) e lt(primeiro dia do próximo mês).

A migration 0007 (0001–0006 intactas) adiciona triggers BEFORE INSERT/UPDATE da
coluna civil para bloquear futuro com clock_timestamp AT TIME ZONE America/Sao_Paulo,
independentemente do timezone SQL. A função é invoker, search_path vazio, sem
EXECUTE direto dos clientes. CHECKs estáticos garantem datas civis representáveis e
reference_month no dia 01. Não há CHECK temporal dependente de CURRENT_DATE.
A migration recusa datas futuras históricas e constraints incompatíveis; não
reescreve registros. Qualquer preparo para dados reais continua sendo etapa futura.

Frontend: 138 testes aprovados (82 anteriores + 56 novos); as 11 asserções da
baseline de data continuam, com o caso de hoje atualizado à regra aprovada.
Quatro TODOs de datas agora são regressões executáveis; restam 10 TODO futuros.
Foram executados os 67 testes de datas/helpers/services/páginas em processos
UTC, America/Sao_Paulo e Asia/Tokyo: todos passaram nas três configurações.
Há 58 novas asserções pgTAP planejadas para INSERT/UPDATE hoje/ontem/amanhã,
UTC/São Paulo/Tóquio, bissexto, intervalos mensais e competência canônica.
Elas AINDA NÃO foram executadas: Docker estava parado e o Desktop iniciado
registrou erro ao iniciar o engine. A tentativa de reset não reconstruiu o banco.
As duas reconstruções 0001→0007 e os pgTAP (211 anteriores + 58 novos esperados)
continuam pendentes. Etapa 5 NÃO VALIDADA até concluir essa parte.

TypeScript, ESLint dos arquivos alterados, build e diff-check passaram.
O build conserva o aviso de bundle >500 kB. Nenhum commit/push/deploy foi feito.

Revisão de ocorrências remanescentes em src:
- utils/date: new Date() obtém um instante, projetado explicitamente em São Paulo;
- monthlyCharges.service: new Date().toISOString() em paid_at é timestamp de evento,
  seguro/intencional; nenhuma mudança no fluxo de pagamento;
- rideFlags.service: resolved_at é timestamp de evento, seguro e fora do escopo;
- PassengerInvitePanel: new Date(expiresAt) apresenta um timestamptz, seguro para
  instante; a apresentação local de convites permanece fora do escopo;
- tipos/mappers: ride_date, received_date e reference_month permanecem strings DATE,
  sem conversão UTC; geração de PDF usa os helpers compartilhados, sem edição de PDF;
- não há gráficos/estatísticas com outra lógica temporal nem date-fns usado em src.

Limites: relógio do dispositivo ainda pode estar incorreto, mas o banco decide
admissão; telas longamente abertas podem precisar de atualização após a virada
civil. DATE no PostgreSQL normaliza representações de entrada aceitas pelo próprio
tipo; o frontend exige texto canônico. Futuras competências podem ser navegadas,
mas não permitem criar diárias/compensações futuras. A reconstrução descartável
não substitui análise de compatibilidade de dados reais. Não houve mudanças em
convites, RLS, flags, exclusão, cálculo financeiro ou arquivos de PDF.

Arquivos da Etapa 5 (17: 12 modificados e cinco novos):

```text
README.md
src/hooks/useReceivedRides.ts
src/hooks/useRides.ts
src/pages/CompensationsPage.tsx
src/pages/RidesPage.tsx
src/schemas/receivedRide.schema.ts
src/services/monthlyCharges.service.ts
src/services/receivedRides.service.ts
src/services/rides.service.ts
src/utils/date.ts
supabase/migrations/0007_date_integrity.sql
supabase/tests/0007_date_integrity.test.sql
tests/date.integrity.test.ts
tests/date.pages.test.tsx
tests/date.services.test.ts
tests/date.test.ts
tests/future/hardening.spec.test.ts
```

## Etapa 6 — fechamento financeiro e pagamentos (VALIDADA LOCALMENTE)

Estado em 2026-10-03: ETAPA 6 VALIDADA em Supabase/PostgreSQL exclusivamente local. Nenhum commit/push/deploy. Validação local não aplica a migration em produção.

### Investigação e modelo

Antes, o frontend lia diárias/compensações em chamadas separadas, somava números decimais e fazia upsert das cobranças. Passageiros sem lançamentos atuais não entravam no recálculo, deixando valores antigos. O upsert não reconciliava a quitação com o novo total. Marcar pagamento aceitava valor e horário do navegador; desmarcar sobrescrevia os dados. UI/PDF tratavam saldo negativo como ausência de dívida e inferiam pagamentos parciais. Não existiam locks, versão ou histórico financeiro.

A migration nova `0008_financial_integrity.sql` implementa o cálculo NUMERIC a partir dos lançamentos persistidos. O domínio de cálculo do frontend usa centavos inteiros seguros; `toCents` valida a representação decimal, sem Math.round para esconder precisão inválida. Valores decimais de transporte e formatação são convertidos nas bordas. Valores não finitos são rejeitados. As oito caracterizações de totais continuam existindo, agora com expectativas em centavos, incluindo 0,10 + 0,20 = 30.

Saldo positivo indica passageiro devedor; negativo indica responsável devedor; zero significa ausência de obrigação. Meses são independentes, sem transporte ou pagamentos parciais. Zero fica efetivamente quitado, sem evento de pagamento ou pagamento ativo para cancelar.

`monthly_charges` mantém a projeção atual, revision, active_payment_id e recalculated_at. `monthly_charge_events` mantém eventos PAYMENT, CANCEL e REOPEN, com valor assinado, competência, identidade do responsável/passageiro, versão e horário do servidor. CANCEL/REOPEN apontam para a quitação original. Clientes normais não podem inserir, atualizar ou apagar eventos, nem escrever diretamente nas cobranças. O histórico permite distinguir nunca paga, quitada, cancelada manualmente e reaberta automaticamente.

RPCs externas: `close_month`, `recalculate_charge`, `pay_charge`, `cancel_charge_payment`. Todas verificam authenticated/responsável e owner. Não recebem valor, status ou horário do cliente. Pagamento recebe a versão esperada; cancelamento recebe o identificador exato da quitação ativa. Repetição da mesma operação é idempotente, sem duplicar eventos; um cancelamento antigo não pode afetar uma nova quitação.

Lock transacional por responsável, adquirido antes de acessar a cobrança. Escritas normais autenticadas em rides/received_rides adquirem o mesmo lock em trigger BEFORE STATEMENT, antes dos locks de linha. Operações financeiras exigem READ COMMITTED para snapshots atualizados depois da espera. As RPCs usam SECURITY DEFINER com search_path vazio, objetos de aplicação qualificados e EXECUTE negado a PUBLIC/anon; helpers internos também não são executáveis por authenticated. Eventos têm RLS de leitura restrita ao responsável correto. A chave composta mantém owner, passageiro e competência coerentes.

Fechamento inclui passageiros com diárias, compensações OU cobrança existente. Excluir todos os lançamentos mantém o fechamento e recalcula zero. Criação/edição/exclusão de lançamentos atualiza cobranças já fechadas na mesma transação; competências ainda não fechadas continuam como prévia. Alterar a tarifa padrão não modifica diárias históricas. O caminho administrativo privilegiado dos fixtures não dispara atualização automática: o recálculo explícito sempre lê os dados persistidos atuais.

Paga + mesmo total preserva a quitação e versão. Novo total diferente incrementa a versão e remove a quitação ativa da projeção, preservando o evento original e criando REOPEN; não cria CANCEL. Novo total não zero fica pendente, incluindo aumento, redução e troca de direção. Novo total zero fica sem obrigação. Cancelamento manual registra CANCEL, preserva o PAYMENT original e reabre a obrigação não zero com nova versão, sem alterar os lançamentos ou o total.

A UI mantém o desenho existente, representa a direção da dívida, permite pagamento/cancelamento de saldos positivos e negativos e não exibe pagamento de zero. Cobrança desatualizada não pode ser paga/cancelada na UI. O comprovante consome a mesma semântica, sem saldo parcial fictício. Mutations preservam o escopo private/userId e guardas de sessão. Escritas em lançamentos invalidam também monthlyCharges no escopo capturado.

### Evidência executada

Após uma execução inicial aprovada, as assertions do script foram ampliadas para comprovar versão, projeção, valores persistidos, unicidade e preservação de todos os eventos por cenário. Os oito TODOs financeiros cobertos foram retirados. Depois desses ajustes foram executadas DUAS reconstruções limpas completas com a versão final dos testes.

| Verificação | Primeira reconstrução final | Segunda reconstrução final |
| --- | --- | --- |
| Migrations 0001→0008 | PASS, todas aplicadas em banco vazio | PASS, todas aplicadas em banco vazio |
| pgTAP | 353/353, 0 failures/skip/TODO | 353/353, 0 failures/skip/TODO |
| Asserções anteriores | 269 preservadas | 269 preservadas |
| Asserções novas | 84 aprovadas | 84 aprovadas |
| Concorrência PostgreSQL real | 7/7 com duas sessões bloqueadas em barreira | 7/7 com duas sessões bloqueadas em barreira |
| Deadlock/duplicação | Nenhum | Nenhum |

Resultados observados das duas sessões por cenário (OK é sucesso; STALE é rejeição esperada de operação antiga com STALE_OBLIGATION, não falha do teste):

| Cenário | Sessões da primeira execução final | Sessões da segunda execução final | Estado final em ambas | PAYMENT/CANCEL/REOPEN |
| --- | --- | --- | --- | --- |
| A fechamento simultâneo | OK / OK | OK / OK | revisão 1, +10,00, pendente, sem pagamento ativo | 0/0/0 |
| B pagamento duplicado | OK / OK | OK / OK | revisão 1, +10,00, paga, um pagamento ativo | 1/0/0 |
| C pagamento versus recálculo | STALE / OK | STALE / OK | revisão 4, +20,00, pendente, sem pagamento ativo | 3/2/1 |
| D edição versus fechamento | OK / OK | OK / OK | revisão 5, +30,00, pendente, sem pagamento ativo | 3/2/1 |
| E cancelamento duplicado | OK / OK | OK / OK | revisão 2, +10,00, pendente, sem pagamento ativo | 1/1/0 |
| F pagamento versus cancelamento | OK / OK | OK / OK | revisão 3, +10,00, pendente, sem pagamento ativo | 2/2/0 |
| G nova quitação versus cancelamento antigo | OK / OK | OK / STALE | revisão 3, +10,00, paga, nova quitação ativa | 3/2/0 |

As contagens são cumulativas, na ordem de execução A, B, E, F, G, C, D. Em G, a resposta ao cancelamento antigo depende da ordem de aquisição do lock: repetição idempotente antes da nova quitação ou rejeição após ela. O estado financeiro final é o mesmo: nova quitação preservada. Não há duas reversões ou pagamentos da mesma revisão.

O script confere as duas sessões, rejeita qualquer erro não esperado (incluindo deadlock/timeout), compara o saldo com lançamentos persistidos, valida a revisão exata e a projeção paid/paid_amount/paid_at/active_payment_id. Também verifica contagens de eventos, unicidade por revisão/quitação, referência e sinal do evento original, horário, owner/passageiro/competência e imutabilidade dos eventos já observados. A tentativa adicional de cancelar uma quitação antiga preservou a quitação nova. Os fixtures foram removidos ao final: rides, received_rides, monthly_charges, monthly_charge_events e sessões finance-race remanescentes = 0.

No pgTAP foram efetivamente comprovados: NUMERIC/centavos exatos; positivo/negativo/zero; somente diárias; somente compensações; múltiplos lançamentos; exclusão de tudo→zero com fechamento preservado; paga+mesmo total→paga; aumento/redução→pendente; paga→zero sem obrigação; mudanças de direção→pendente; quitação integral positiva e negativa; rejeição de pagamento/cancelamento de zero; repetição idempotente; PAYMENT intacto após CANCEL/REOPEN; reabertura automática diferente de cancelamento manual; bloqueio de versão/quitação antiga; outro owner, passageiro, unlinked e anon rejeitados; RLS/grants e competências inválidas.

- Frontend: **177 aprovados + 2 TODO**, após as duas reconstruções. Baseline de 177 aprovados mantido.
- TODOs: oito financeiros removidos somente após comprovação real. Cobertura: centavos em monthlyTotals/financial.ui; sinal e zero em financial.ui/0008 pgTAP; quitação/versionamento/recálculo/histórico/exclusão/independência entre meses em 0008 pgTAP; concorrência no script real. Restam Auth real em duas abas e flags, fora do escopo.
- TypeScript: PASS.
- ESLint dos arquivos alterados TS/TSX/MJS: PASS.
- Build: PASS, com aviso existente de bundle acima de 500 kB.
- git diff --check: PASS.
- Correções na migration/RPC/implementação durante esta validação: **nenhuma**. Apenas assertions/evidência de testes reforçadas, TODOs cobertos retirados e este registro atualizado.
- Migrations 0001–0007: intactas em comparação com HEAD, considerando normalização de finais de linha; 0008 é a única migration nova.
- Nenhum padrão de segredo adicionado identificado no diff/arquivos novos. Supabase .temp/start-secrets e dist permanecem ignorados; nenhum temporário ou credencial local incluído.

### Riscos e estado de revisão

A migration falha explicitamente se encontrar quitações preexistentes: histórico legado exige plano de migração separado, sem inventar eventos ou sobrescrever dados. O lock por responsável prioriza consistência e serializa operações em competências diferentes do mesmo responsável. Exceder numeric(10,2) falha na transação, sem arredondamento de totais. Nenhuma migration ou mudança de dados foi aplicada em produção.

Branch hardening/security-reliability, HEAD 3cf230609f34c0fa50aa396c48bb10441e56ddf6, staging vazio, **32 arquivos locais** para revisão (31 do baseline + tests/future/hardening.spec.test.ts, cuja alteração reflete os TODOs implementados). Nenhum commit/push; main permanece 25cd2673bbe2b0742139efdcd9075b540c67e9f8. Produção e Vercel intocados, sem vínculo com Supabase remoto.

### Arquivos locais desta etapa

- `README.md`
- `scripts/test-financial-concurrency.mjs`
- `src/components/charges/MonthlyChargeCard.tsx`
- `src/hooks/useMonthlyCharges.ts`
- `src/hooks/usePrivateQuery.ts`
- `src/hooks/useReceivedRides.ts`
- `src/hooks/useRides.ts`
- `src/lib/mappers.ts`
- `src/pages/MonthlyClosingPage.tsx`
- `src/pages/PassengerPortalPage.tsx`
- `src/schemas/receivedRide.schema.ts`
- `src/services/monthlyCharges.service.ts`
- `src/services/passengers.service.ts`
- `src/services/pdf.service.ts`
- `src/services/receivedRides.service.ts`
- `src/types/database.ts`
- `src/types/entities.ts`
- `src/utils/money.ts`
- `src/utils/monthlyTotals.ts`
- `supabase/migrations/0008_financial_integrity.sql`
- `supabase/tests/0005_roles_and_isolation.test.sql`
- `supabase/tests/0007_date_integrity.test.sql`
- `supabase/tests/0008_financial_integrity.test.sql`
- `tests/date.services.test.ts`
- `tests/financial.hooks.test.tsx`
- `tests/financial.page.test.tsx`
- `tests/financial.services.test.ts`
- `tests/financial.ui.test.tsx`
- `tests/future/hardening.spec.test.ts`
- `tests/monthlyTotals.test.ts`
- `tests/session.characterization.test.tsx`
- `tests/session.operations.test.ts`
