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

## Salvar e carregar listas (Cloudflare KV)

Cada página de lista (Campo Mourão, Cianorte, Ubiratã) tem os botões **"☁️ Salvar"** e
**"☁️ Carregar"**, além dos botões antigos de salvar/carregar `.json` direto no
computador. Não depende de nenhuma conta externa (nada de OneDrive/Microsoft) — os
arquivos ficam guardados no mesmo KV que já armazena os usuários (`USERS_KV`), então não
é preciso criar namespace nem configurar nenhum secret novo.

**Como funciona:**

- Ao clicar em **"☁️ Salvar"**, o sistema pergunta o nome do arquivo (já vem sugerido
  algo como `campomourao_2026-07-14`, mas pode digitar qualquer nome).
- Cada lista só enxerga (salva e lista) os **próprios arquivos** — o JSON de Campo Mourão
  nunca aparece misturado com o de Cianorte ou Ubiratã, mesmo estando no mesmo KV, porque
  cada arquivo é guardado com uma chave prefixada pela região
  (`lista:<regiao>:<nome>.json`).
- Ao clicar em **"☁️ Carregar"**, aparece a lista de arquivos já salvos daquela região
  (mais recentes primeiro) para escolher.
- Só quem tem permissão de acesso àquela lista (ou é admin) consegue salvar/carregar os
  arquivos dela — a mesma regra de permissão que já protege a página em si.

Não há nenhum passo extra de configuração: assim que o deploy estiver no ar com o
`USERS_KV` já vinculado (passo 6 acima), salvar e carregar já funcionam.
