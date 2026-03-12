#!/bin/bash
set -e

echo "=== GastoPix Railway Build ==="

# 1. Instalar dependências
echo "[1/4] Instalando dependências..."
pnpm install --frozen-lockfile

# 2. Limpar cache do Metro/NativeWind para evitar erros de SHA-1
echo "[2/4] Limpando cache do Metro..."
rm -rf node_modules/react-native-css-interop/.cache
rm -rf /tmp/metro-*
rm -rf /tmp/haste-*

# 3. Build do frontend Expo Web
# As variáveis EXPO_PUBLIC_* são embutidas no bundle em tempo de build (não em runtime).
# Por isso precisam ser passadas explicitamente aqui usando os valores do Railway Variables.
echo "[3/4] Compilando frontend (Expo Web)..."

# Determinar o domínio público (Railway injeta RAILWAY_PUBLIC_DOMAIN automaticamente)
RAILWAY_DOMAIN="${RAILWAY_PUBLIC_DOMAIN:-expensetrackerai-production.up.railway.app}"
API_URL="https://${RAILWAY_DOMAIN}"

# Passar todas as variáveis necessárias para o Expo durante o build
EXPO_PUBLIC_OAUTH_PORTAL_URL="https://manus.im" \
EXPO_PUBLIC_OAUTH_SERVER_URL="https://api.manus.im" \
EXPO_PUBLIC_APP_ID="AjMw55p7jRc9aMyZzMJuCD" \
EXPO_PUBLIC_OWNER_OPEN_ID="XFTP6j7JmLYMxCZX7YhPqx" \
EXPO_PUBLIC_OWNER_NAME="Luis Henrique" \
EXPO_PUBLIC_API_BASE_URL="" \
npx expo export --platform web --output-dir dist/web --clear

# 4. Build do servidor Node.js
# Usando extensão .mjs para garantir que o Node trate como ESM (sem precisar de "type":"module" no package.json)
echo "[4/4] Compilando servidor (Node.js)..."
node_modules/.bin/esbuild server/_core/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outfile=dist/index.mjs

echo "=== Build concluído com sucesso ==="
echo "NOTA: As migrações do banco serão executadas automaticamente ao iniciar o servidor."
