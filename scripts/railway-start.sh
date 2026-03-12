#!/bin/bash
# Não usar set -e para que erros de migração não parem o servidor

echo "=== GastoPix Railway Start ==="

# Rodar migrações do banco antes de iniciar o servidor
if [ -n "$DATABASE_URL" ]; then
  echo "[1/2] Rodando migrações do banco de dados..."
  pnpm run db:push && echo "Migrações concluídas." || echo "AVISO: Migrações falharam (pode ser normal se já estiverem aplicadas). Continuando..."
else
  echo "[1/2] DATABASE_URL não definida, pulando migrações."
fi

# Iniciar o servidor (.mjs garante que o Node trate como ESM)
echo "[2/2] Iniciando servidor..."
NODE_ENV=production node dist/index.mjs
