# Sistema de Login + Cadastro — versão Cloudflare Pages

Mesma funcionalidade da versão Netlify (cadastro com confirmação por e-mail, login,
papéis ADMIN/usuário padrão, proteção das páginas de lista por token), só que rodando
inteiramente no Cloudflare Pages — hospedagem, "functions" e banco de dados.

## O que mudou em relação à versão Netlify

| Peça | Netlify | Cloudflare |
|---|---|---|
| Hospedagem das páginas | Netlify | Cloudflare Pages |
| Functions | `netlify/functions/*.js` | `functions/api/*.js` |
| Banco de dados | Netlify Blobs | Cloudflare KV |
| Hash de senha | bcrypt | PBKDF2 (Web Crypto) — bcrypt é pesado demais pro limite de CPU do Workers |
| Assinatura do token de sessão | `crypto` do Node | Web Crypto (`crypto.subtle`) — Workers não tem o módulo `crypto` do Node |
| Envio de e-mail | Gmail via SMTP (Nodemailer) | Resend via API HTTP — Workers não permite conexão SMTP direta |

Pro navegador (as páginas HTML), muda muito pouco: só o endereço que elas chamam, que
virou `/api/...` em vez de `/.netlify/functions/...`.

## Passo a passo para publicar

### 1. Crie uma conta no Resend (para envio de e-mail)
1. Acesse https://resend.com e crie uma conta grátis (até 3.000 e-mails/mês, 100/dia).
2. No painel, vá em **API Keys** → **Create API Key** → copie a chave (começa com `re_`).
3. Sem domínio próprio configurado, os e-mails saem do endereço de teste
   `onboarding@resend.dev` — funciona normalmente para o código de confirmação, só que
   com uma aparência mais "genérica". Se um dia você tiver um domínio, dá pra configurar
   lá dentro (Domains → Add Domain) para os e-mails saírem de um endereço seu.

### 2. Crie uma conta no Cloudflare (se ainda não tiver)
https://dash.cloudflare.com/sign-up — grátis, não precisa cartão.

### 3. Suba esta pasta para o GitHub
Mesma lógica de antes: crie um repositório novo (ou use um separado do do Netlify) e
suba todo o conteúdo desta pasta pra raiz dele (`public/`, `functions/`, `wrangler.toml`,
`README.md`).

### 4. Crie o namespace do KV (o "banco de dados")
1. No painel do Cloudflare, procure no menu lateral por **"Storage & Databases"**
   (Armazenamento e Bancos de Dados) → clique em **"Workers KV"**.
   (Se você não achar "KV" dentro de "Workers & Pages", é porque a Cloudflare moveu esse
   item pra essa seção separada — é comum a interface mudar de lugar de vez em quando.)
2. **Create instance** (ou "Create a namespace") → dê o nome `users` (ou o nome que
   quiser) → **Create**.

### 5. Importe o projeto no Cloudflare Pages
1. **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git**.
2. Autorize o Cloudflare a acessar o GitHub, selecione o repositório.
3. Em **Build settings**:
   - Framework preset: **None**
   - Build command: (deixe vazio)
   - Build output directory: **public**
4. Clique em **Save and Deploy**. O primeiro deploy provavelmente vai falhar ou
   funcionar parcialmente — normal, porque as variáveis de ambiente e o KV ainda não
   estão conectados. Vamos configurar isso agora.

### 6. Conectar o KV ao projeto
1. Ainda no painel do Cloudflare, vá em **Workers & Pages** → selecione o seu projeto
   (o site, não o namespace do KV) → **Settings** → **Bindings** (antes ficava dentro de
   uma aba "Functions", mas a Cloudflare simplificou e agora é só "Bindings" direto).
2. **Add** → **KV namespace**:
   - Variable name: `USERS_KV` (tem que ser exatamente esse nome, é o que o código usa).
   - KV namespace: selecione o `users` que você criou no passo 4.
3. Salve e **refaça o deploy** do projeto (Bindings novos só valem a partir do próximo
   deploy — vá em **Deployments** → nos três pontinhos do último deploy → **Retry
   deployment**, ou dê um novo commit no GitHub).

### 7. Configurar as variáveis de ambiente
Ainda em **Settings** → procure por **"Environment variables"** ou, se a interface já
tiver mudado quando você for configurar, por **"Variables and Secrets"** (a Cloudflare
tem renomeado essa seção de vez em quando — é a mesma coisa) → adicione (na aba
**Production**, e também em **Preview** se quiser testar por lá):

| Nome | Valor |
|---|---|
| `RESEND_API_KEY` | a chave gerada no passo 1 (começa com `re_`) |
| `RESEND_FROM_EMAIL` | deixe em branco para usar `onboarding@resend.dev`, ou coloque um e-mail do seu domínio verificado no Resend |
| `SESSION_SECRET` | qualquer texto longo e aleatório só seu, ex: `xK9vL2qP8mZ4wR7tY1jN6bH3dF0sA5c9` |

Se aparecer a opção de marcar como **"Secret"** (em vez de texto simples), use-a para o
`RESEND_API_KEY` e o `SESSION_SECRET` — é mais seguro e funciona igual.

### 8. Novo deploy
Depois de configurar o KV e as variáveis, force um novo deploy: **Deployments** → nos
três pontinhos do último deploy → **Retry deployment** (ou basta dar um novo commit no
GitHub, que ele publica sozinho).

### 9. Teste
- `seuprojeto.pages.dev/cadastro.html` — cadastre um e-mail seu, confirme o código.
- `seuprojeto.pages.dev/login.html` com `bruno07dacosta@gmail.com` / `Bruno123` — deve
  cair direto no painel admin (a conta é criada automaticamente no primeiro login, igual
  na versão Netlify).
- No painel, atribua uma lista pro seu cadastro de teste e confira o login dele.

## Sobre créditos/limites no Cloudflare

O plano grátis do Cloudflare Pages não cobra por deploy (diferente do Netlify no modelo
de créditos). Os limites do plano grátis são por **requisição das functions**: hoje é
bem generoso (dezenas de milhares por dia), então pro tamanho desse projeto (uma lista
de congregação) dificilmente vai bater no teto. Ainda assim, limites de serviços grátis
mudam com o tempo — vale conferir a página oficial de preços do Cloudflare Workers se
tiver dúvida sobre o número atual.

## Domínio próprio (opcional)
Depois de publicado, dá pra apontar um domínio seu (tipo `listas.suaigreja.com.br`) pro
projeto, em **Custom domains**, dentro do próprio projeto no Cloudflare Pages.

## Integração com OneDrive (uma única conta, pra todo mundo)

Cada página de lista tem os botões **"☁️ Salvar no OneDrive"** e **"☁️ Carregar do
OneDrive"**, além dos botões antigos de salvar/carregar `.json` no computador. Todo mundo
salva sempre na **mesma conta OneDrive** (a sua), numa pasta chamada `ListasCCB`, com o
nome no formato `regiao_AAAA-MM-DD.json` (ex: `campomourao_2026-07-11.json`).

Quem autoriza é só **você, uma única vez**. Depois disso, o próprio sistema renova o
acesso sozinho (guardando o token no mesmo KV que já guarda os usuários) — nenhum usuário
vê tela de login da Microsoft.

**Sobre o Azure:** registrar um app é **gratuito**, sem cartão e sem "créditos" — é só um
cadastro técnico necessário porque é assim que a Microsoft exige que qualquer aplicativo
peça acesso a arquivos de alguém.

### Passo 1 — Registrar o app no Azure

1. Acesse https://portal.azure.com (qualquer conta Microsoft/Outlook/Hotmail serve).
2. Busque **"Registros de aplicativo"** (App registrations) na busca do topo.
3. **Novo registro**:
   - Nome: `Sistema Listas CCB` (ou o que preferir).
   - Tipos de conta com suporte: **"Contas em qualquer diretório organizacional e
     contas pessoais da Microsoft"**.
   - Redirecionar URI: tipo **Web**, valor: `https://SEUPROJETO.pages.dev/onedrive-setup.html`
     (troque pelo endereço real do seu projeto no Cloudflare Pages).
   - **Registrar**.
4. Copie o **"ID do aplicativo (cliente)"** → vira a variável `ONEDRIVE_CLIENT_ID`.
5. **Certificados e segredos** → **Novo segredo do cliente** → copie o **Valor** gerado
   → vira a variável `ONEDRIVE_CLIENT_SECRET`.
6. **Permissões de API** → **Adicionar uma permissão** → **Microsoft Graph** →
   **Permissões delegadas** → marque `Files.ReadWrite` e `offline_access` → **Adicionar**.

### Passo 2 — Autorizar (só você, uma vez)

Monte esta URL (troque `SEU_CLIENT_ID` e `SEUPROJETO`) e abra no navegador:

```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=SEU_CLIENT_ID&response_type=code&redirect_uri=https%3A%2F%2FSEUPROJETO.pages.dev%2Fonedrive-setup.html&response_mode=query&scope=offline_access%20Files.ReadWrite
```

Faça login com a conta Microsoft onde você quer que os arquivos sejam salvos, autorize, e
você cai na página `onedrive-setup.html`, que mostra um código — copie ele (expira rápido).

### Passo 3 — Trocar o código por um token

```bash
curl -X POST https://login.microsoftonline.com/common/oauth2/v2.0/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=SEU_CLIENT_ID" \
  -d "client_secret=SEU_CLIENT_SECRET" \
  -d "grant_type=authorization_code" \
  -d "code=O_CODIGO_QUE_VOCE_COPIOU" \
  -d "redirect_uri=https://SEUPROJETO.pages.dev/onedrive-setup.html" \
  -d "scope=offline_access Files.ReadWrite"
```

(Sem terminal à mão? Rode o mesmo comando em https://reqbin.com/curl ou no Postman.)

Copie o valor do campo **`refresh_token`** da resposta.

### Passo 4 — Variáveis de ambiente no Cloudflare

Em **Settings** → **Environment variables** (ou **Variables and Secrets**, dependendo da
versão da interface) do projeto, adicione:

| Nome | Valor |
|---|---|
| `ONEDRIVE_CLIENT_ID` | o Client ID do Passo 1 |
| `ONEDRIVE_CLIENT_SECRET` | o Client Secret do Passo 1 |
| `ONEDRIVE_REFRESH_TOKEN_INICIAL` | o `refresh_token` do Passo 3 |

Depois de salvar, force um novo deploy (Deployments → Retry deployment). A partir do
primeiro uso, o sistema guarda o token renovado sozinho dentro do KV (`USERS_KV`), então
essa variável só importa pro pontapé inicial.

### Testando

Abra qualquer lista, clique em **"☁️ Salvar no OneDrive"** — não deve pedir login
nenhum, só confirmar que salvou. Confira em onedrive.com, na pasta **ListasCCB**.
