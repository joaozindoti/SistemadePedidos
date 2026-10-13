# Cardápio e pedidos — Sidney & Shirley Pizzaria

Cardápio online com pedido pelo celular, painel do balcão, tela da cozinha e
avisos de status pelo WhatsApp.

## Stack

- **Front:** Next.js 16 (App Router) + React, publicado na Vercel. Atenção: esta
  versão do Next tem mudanças de API; veja `AGENTS.md`.
- **Banco e auth:** Supabase (Postgres com RLS, Realtime, Vault).
- **Edge functions (Deno)** em `supabase/functions/`:
  - `create-order` — recebe o pedido do cardápio (público, sem JWT), valida,
    recalcula preços e grava tudo numa transação pela RPC `criar_pedido`.
  - `send-status-notification` — chamada pelo trigger de `orders` a cada troca
    de status; manda a mensagem ao cliente pela Evolution API.
  - `whatsapp-webhook` — recebe mensagens da Evolution API e responde com o link
    do cardápio (ou o aviso de loja fechada).
  - `whatsapp-connect` — conexão do número pelo painel (exige login).
- **WhatsApp:** Evolution API.

## Rodando o front localmente

```bash
npm install
npm run dev   # http://localhost:3000
```

Variáveis do front (`.env.local`, e as mesmas na Vercel):

| Variável | Para quê |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon (pública) |

Nunca coloque a service role key no front.

## Secrets das edge functions

Configurados com `npx supabase secrets set NOME=valor`. `SUPABASE_URL`,
`SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já vêm do Supabase.

| Secret | Usado por | Para quê |
| --- | --- | --- |
| `EVOLUTION_API_URL` | send-status-notification, whatsapp-webhook, whatsapp-connect | endereço da Evolution API |
| `EVOLUTION_API_KEY` | idem | chave da Evolution API |
| `EVOLUTION_INSTANCE_NAME` | idem | instância do WhatsApp da loja |
| `WHATSAPP_WEBHOOK_SECRET` | whatsapp-webhook | vai no header `x-webhook-secret` do webhook cadastrado na Evolution (veja abaixo) |
| `PIX_KEY` | send-status-notification | chave Pix enviada ao cliente. Vazia: a mensagem não traz chave e diz que a loja vai passar pela conversa |
| `PIX_KEY_LABEL` | send-status-notification | opcional; como a chave aparece na mensagem. Sem ele, aparece a chave crua |

O segredo que o trigger de status manda para `send-status-notification` fica no
Supabase Vault (`status_webhook_secret`), não em secret de function. A URL que o
trigger chama também pode ficar no Vault (`status_webhook_url`); sem ela, o
trigger usa a URL de produção de fallback.

### Webhook da Evolution (`whatsapp-webhook`)

O webhook é cadastrado à mão na Evolution (o `whatsapp-connect` só cria a
instância e gera o QR). Configure:

- URL: `https://<ref>.supabase.co/functions/v1/whatsapp-webhook` (sem `?secret=`);
- evento: só `MESSAGES_UPSERT` (a function ignora os outros de qualquer jeito);
- header `x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>`. Na Evolution API v2 isso
  vai no campo `webhook.headers` do `POST /webhook/set/<instância>`. Se a versão
  instalada não aceitar headers, mantenha `?secret=` na URL: a function ainda
  aceita, mas loga um aviso a cada chamada. Assim que o header estiver
  funcionando, tire o `?secret=` da URL, troque o `WHATSAPP_WEBHOOK_SECRET`
  (o valor antigo já passou por URL e pode estar em log) e remova o fallback
  da query em `whatsapp-webhook/index.ts`.

O segredo é comparado em tempo constante nas duas functions de webhook.

A function responde só a mensagens recebidas de conversa individual (ignora
grupos e mensagens enviadas pela própria loja), manda o link do cardápio no
máximo uma vez a cada 3 horas por telefone (RPC `registrar_envio_link`) e não
responde número fora do Brasil.

### Telefone canônico

`create-order` e `whatsapp-webhook` usam `supabase/functions/_shared/phone.ts`:
o telefone é gravado como `55` + DDD + número, com celular sempre com o 9
(13 dígitos; o 9 é inserido quando vem sem). Cadastros antigos sem o 9
continuam sendo achados pelo webhook, que procura as duas formas.

## Cargos de acesso (admin e cozinha)

O acesso ao painel é por `app_metadata.role`, que só o service role altera.
Conta logada sem cargo não acessa nada.

- `admin`: painel completo.
- `cozinha`: só a tela da cozinha.

No SQL Editor do Supabase:

```sql
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'  -- ou "cozinha"
 where email = 'EMAIL_DA_CONTA';
```

A pessoa precisa sair e entrar de novo para o token novo valer.

## Acesso ao painel: senha, sessão e MFA

- `supabase/config.toml` (`minimum_password_length = 10`) vale **só para o
  Supabase local**. Em produção, configure no painel do Supabase em
  Authentication → Providers → Email (tamanho mínimo 10 e, se possível,
  exigir letras e números) — o `db push` não leva isso.
- A sessão do painel fica num cookie de ~400 dias (padrão do `@supabase/ssr`,
  `lib/supabase/browserClient.ts`) e é renovada sozinha pelo refresh token, de
  propósito, para o tablet do balcão não pedir login. Quem limita é o servidor:
  em Authentication → Sessions dá para pôr timebox (ex.: 30 dias) e logout por
  inatividade (ex.: 7 dias).
- Ative MFA (TOTP) para as contas `admin` em Authentication → Multi-Factor.
  A tela de login ainda não pede o segundo fator; até isso existir, MFA
  protege só a conta no Supabase, não o painel.

## Testes das edge functions

Validação, cálculo do total, troco, regras de categoria, telefone e filtro
do webhook estão em módulos puros com testes Deno:

```bash
npm run test:functions    # = npx -y deno@2 test supabase/functions
npm run check:functions   # deno check das 4 functions
```

Se aparecer um `deno.lock` na raiz, pode apagar (já está no `.gitignore`).

Os testes do banco (pgTAP, em `supabase/tests/`: horário, policies por cargo,
travas do pedido, `criar_pedido`, notificação e link do WhatsApp) rodam no
Supabase local:

```bash
npx supabase start
npx supabase test db
```

## Ordem de deploy

Sempre nesta ordem, porque as functions dependem do schema novo e o front
depende das functions:

1. **Migration** — `npx supabase db push`
2. **Secrets e functions** — `npx supabase secrets set ...` e
   `npx supabase functions deploy ...`
3. **Push do front** — `git push` (a Vercel publica sozinha)

## Comandos de deploy (Fase 1)

Correções da vistoria de 2026-10-12 (status cancelado, gravação transacional do
pedido, idempotência, rate limit, chave Pix). Rode na raiz do projeto, com o
Supabase CLI já logado e linkado ao projeto:

```bash
# 1. Migration (status cancelado, CHECKs, idempotency_key, registrar_tentativa_pedido, criar_pedido)
npx supabase db push

# 2. Chave Pix e functions
npx supabase secrets set PIX_KEY=+55DDDNUMERO PIX_KEY_LABEL="(DDD) NÚMERO (tipo da chave, banco)"
npx supabase functions deploy create-order send-status-notification whatsapp-webhook

# 3. Front
git push
```

Não publique o `create-order` novo antes da migration: ele chama as RPCs
`criar_pedido` e `registrar_tentativa_pedido`, e sem elas todo pedido falha.

## Comandos de deploy (Fases 2 e 3)

Segunda leva da vistoria: erro de item esgotado com `code`/`ids`, telefone
canônico, webhook do WhatsApp só com `messages.upsert` e link no máximo a cada
3 h, segredo dos webhooks por header e comparado em tempo constante, resultado
do aviso de status gravado no pedido (`notificacao_status`), nome do cliente no
pedido (`orders.customer_name`), versões fixas nas functions. Se a Fase 1 ainda
não foi publicada, o `db push` aplica as duas migrations de uma vez; rode
também o `secrets set` da Fase 1.

```bash
# 1. Migration (customer_name, notificacao_*, registrar_envio_link, notify com search_path/Vault)
npx supabase db push

# 2. (Opcional) URL do trigger de status no Vault, no SQL Editor:
#    select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-status-notification',
#                               'status_webhook_url', 'URL chamada por notify_order_status_change()');

# 3. Functions (nenhum secret novo nesta fase)
npx supabase functions deploy create-order send-status-notification whatsapp-webhook whatsapp-connect

# 4. Front
git push
```

Depois do deploy:

- Reconfigure o webhook na Evolution com o header `x-webhook-secret` e tire o
  `?secret=` da URL (veja "Webhook da Evolution").
- Ajuste senha mínima, sessão e MFA no painel do Supabase (veja "Acesso ao
  painel").

Não publique as functions antes da migration: o `whatsapp-webhook` chama a RPC
`registrar_envio_link` e, sem ela, não manda mais o link do cardápio; o
`send-status-notification` grava em colunas que só existem depois dela.

## Pendências conhecidas

- **Seeds misturados com migrations:** `20260916190100_seed_cardapio_sidney_shirley.sql`
  e `20260920180100_seed_bebidas.sql` são dados, não schema, e algumas
  migrations antigas falham se forem reaplicadas. Num banco novo, rode tudo em
  ordem uma única vez; separar os seeds para `supabase/seed.sql` fica para depois.
- **Tabela `whatsapp_instances` sem uso:** criada no schema inicial, nenhuma
  function nem tela lê ou grava nela. Pode ser removida numa migration futura.
- **Telefones antigos:** a migration `20261012130000` põe o 9 nos celulares
  cadastrados sem ele, exceto quando a forma com 9 já existe. Nesses casos os
  dois cadastros continuam separados (a migration só avisa a contagem num
  `NOTICE`), e juntá-los fica para depois. O webhook procura as duas formas.
