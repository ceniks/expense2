# GastoPix — Deploy no Railway

## O que foi preparado no código

- `railway.json` — configuração automática de build e deploy
- `scripts/railway-build.sh` — script que compila frontend + backend + roda migrações
- `server/_core/index.ts` — servidor agora serve o frontend estático em produção

---

## Passo a passo

### 1. Criar conta e projeto no Railway

1. Acesse [railway.app](https://railway.app) e clique em **Login with GitHub**
2. Clique em **New Project → Deploy from GitHub repo**
3. Selecione o repositório do GastoPix
4. O Railway detecta o `railway.json` automaticamente

### 2. Adicionar banco de dados MySQL

1. No projeto, clique em **+ New Service → Database → MySQL**
2. O Railway cria o banco e gera a variável `DATABASE_URL` automaticamente
3. Essa variável já fica disponível para o serviço Node.js

### 3. Configurar variáveis de ambiente

No serviço Node.js, vá em **Variables** e adicione:

| Variável | Onde obter |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | Gerado pelo Railway (já disponível) |
| `JWT_SECRET` | Copiar do painel Manus (Settings > Secrets) |
| `VITE_APP_ID` | Copiar do painel Manus |
| `OAUTH_SERVER_URL` | Copiar do painel Manus |
| `OWNER_OPEN_ID` | Copiar do painel Manus |
| `BUILT_IN_FORGE_API_KEY` | Copiar do painel Manus |
| `BUILT_IN_FORGE_API_URL` | Copiar do painel Manus |
| `S3_ENDPOINT` | URL do Cloudflare R2 |
| `S3_ACCESS_KEY_ID` | Credencial R2 |
| `S3_SECRET_ACCESS_KEY` | Credencial R2 |
| `S3_BUCKET_NAME` | `gastopix-files` |
| `S3_PUBLIC_URL` | URL pública do bucket R2 |
| `S3_REGION` | `auto` |

### 4. Gerar domínio público

1. No serviço Node.js → **Settings → Networking → Generate Domain**
2. Você receberá uma URL como `gastopix.up.railway.app`
3. Esse será o endereço do site

### 5. Verificar o deploy

Após o build (5–10 minutos), acesse:
```
https://gastopix.up.railway.app/api/health
```
Se retornar `{"ok":true}`, o servidor está funcionando.

Acesse a URL raiz para ver o site:
```
https://gastopix.up.railway.app
```

---

## Configurar Cloudflare R2 (armazenamento de PDFs e imagens)

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**
2. Clique em **Create bucket** → nome: `gastopix-files`
3. Vá em **Manage R2 API Tokens → Create API Token**
4. Permissão: **Object Read & Write** para o bucket `gastopix-files`
5. Copie **Account ID**, **Access Key ID** e **Secret Access Key**
6. Em **Settings** do bucket → ative **Public Access** → copie a URL pública

---

## Domínio personalizado (opcional)

Se quiser usar `gastopix.seudominio.com.br`:
1. No Railway → **Settings → Networking → Custom Domain**
2. Adicione seu domínio e siga as instruções para configurar o DNS

---

## Custo estimado

| Serviço | Custo |
|---|---|
| Railway (servidor + banco MySQL) | ~US$ 5–10/mês |
| Cloudflare R2 (até 10 GB) | Gratuito |
| **Total** | **~US$ 5–10/mês** |
