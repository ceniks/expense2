# GastoPix — TODO

- [x] Configurar tema de cores (roxo vibrante)
- [x] Configurar navegação com 3 abas (Home, Adicionar, Relatório)
- [x] Adicionar ícones ao icon-symbol.tsx
- [x] Tela Home: card de total do mês, lista de pagamentos recentes, botão (+)
- [x] Tela Adicionar Pagamento: seletor de imagem (câmera/galeria), preview, campos editáveis, botão salvar
- [x] Tela Relatório Mensal: seletor de mês, total, gráfico de pizza, lista por categoria
- [x] Tela Detalhe do Pagamento: imagem ampliada, dados, editar/excluir
- [x] Integração com IA no servidor para análise de imagem de comprovante
- [x] Armazenamento local com AsyncStorage (CRUD de pagamentos)
- [x] Gráfico de pizza por categoria (react-native-svg)
- [x] Compartilhar/exportar relatório mensal
- [x] Gerar e configurar logo do app
- [x] Atualizar app.config.ts com nome e logo

## Novas funcionalidades

- [x] Perfis: separar pagamentos entre "Empresa" e "Pessoal"
- [x] Seletor de perfil na Home e no Relatório (filtro por perfil)
- [x] Campo de perfil na tela Adicionar e Detalhe do pagamento
- [x] Tela de Configurações com gerenciamento de categorias
- [x] Criar categoria personalizada (nome + cor)
- [x] Editar categoria personalizada
- [x] Excluir categoria personalizada
- [x] Categorias personalizadas persistidas no AsyncStorage
- [x] Integrar categorias personalizadas na tela Adicionar e Detalhe
- [x] Aba de Configurações na tab bar

## Ajustes v2

- [x] Relatório: clicar em categoria expande lista de pagamentos daquela categoria
- [x] Relatório: cada pagamento expandido mostra descrição, valor, data e botão excluir
- [x] Home: botão de exclusão rápida nos itens da lista (swipe ou ícone)

## Bugs v3

- [x] IA: em comprovantes Pix, extrair nome do destinatário ("Para") e não do remetente ("De")
- [x] Tela Adicionar: limpar imagem e formulário completamente após salvar pagamento

## Exportação de dados v4

- [x] Exportar todos os pagamentos em CSV
- [x] Exportar todos os pagamentos em XLS (Excel)
- [x] Exportar todos os pagamentos em PDF (relatório formatado)
- [x] Filtro de exportação por perfil (Pessoal / Empresa / Todos)
- [x] Filtro de exportação por período (mês específico ou todos)
- [x] Compartilhar arquivo exportado via WhatsApp, e-mail ou salvar no celular
- [x] Botão de exportação na tela de Relatório

## Busca v5

- [x] Barra de busca na Home para filtrar pagamentos por descrição, categoria ou valor
- [x] Resultados em tempo real enquanto digita
- [x] Limpar busca com botão X

## Sincronização em Nuvem v6

- [x] Criar tabelas no banco de dados: payments, categories por usuário
- [x] Rotas tRPC no servidor: CRUD de payments e categories
- [x] Upload de imagens de comprovantes para S3
- [x] Tela de login com Google/Apple (OAuth)
- [x] Migrar contexto de pagamentos do AsyncStorage para API do servidor
- [x] Cache local para funcionamento offline
- [x] Interface web responsiva para uso no computador (layout com sidebar)
- [x] Dados sincronizados em tempo real entre celular e browser

## Bugs v7

- [x] Login OAuth: erro "invalid redirect_uri: scheme 'exp' not allowed" no Expo Go — corrigido com WebBrowser.openAuthSessionAsync

## Bugs v8

- [x] Web: sidebar não aparece no computador — corrigida movendo para o layout raiz

## Sidebar recolhível v9

- [x] Sidebar web com botão de toggle para ocultar/mostrar
- [x] Modo compacto (só ícones, sem labels) quando recolhida
- [x] Estado da sidebar persistido (lembrar se estava aberta ou fechada)
- [x] No celular via browser, iniciar recolhida por padrão

## Compartilhamento de dados entre usuários v10

- [x] Schema: tabela shared_groups (id, name, inviteCode, createdByUserId)
- [x] Schema: tabela group_members (groupId, userId, joinedAt)
- [x] Schema: migrar payments e categories para usar groupId em vez de userId direto
- [x] Rota tRPC: criar grupo compartilhado
- [x] Rota tRPC: entrar em grupo via código de convite
- [x] Rota tRPC: listar membros do grupo
- [x] Rota tRPC: sair do grupo
- [x] Rota tRPC: regenerar código de convite
- [x] UI: seção "Compartilhamento" nas Configurações
- [x] UI: botão "Criar grupo" e exibir código de convite
- [x] UI: campo para entrar em grupo com código
- [x] UI: lista de membros do grupo com opção de sair
- [x] Adaptar queries de payments para buscar por groupId
- [x] Adaptar queries de categories para buscar por groupId
- [x] Migração automática: usuários existentes entram em grupo individual próprio

## Bugs v11

- [x] Bug: edição de categoria no web (computador) não salva e não fecha o modal ao clicar em Salvar

## Módulo de Notas Fiscais v12

- [x] Schema: tabela invoices (id, groupId, userId, supplierName, totalAmount, issueDate, description, imageUrl, profile, createdAt)
- [x] Schema: tabela invoice_installments (id, invoiceId, installmentNumber, totalInstallments, amount, dueDate, paidAt, paymentId)
- [x] Rota tRPC: analisar NF via IA (extrair fornecedor, valor total, data, nº parcelas sugerido)
- [x] Rota tRPC: criar NF com parcelas automáticas
- [x] Rota tRPC: listar NFs do grupo
- [x] Rota tRPC: marcar parcela como paga (cria Payment vinculado)
- [x] Rota tRPC: desmarcar parcela como paga (remove Payment vinculado)
- [x] Rota tRPC: excluir NF e suas parcelas
- [x] UI: aba "Notas Fiscais" na navegação
- [x] UI: botão de upload de NF (câmera ou galeria)
- [x] UI: modal de revisão dos dados extraídos pela IA + seletor de nº de parcelas (1-6)
- [x] UI: seletor de datas de vencimento para cada parcela
- [x] UI: lista de NFs com status (parcelas pagas / total)
- [x] UI: expandir NF para ver lista de parcelas com status e datas
- [x] UI: botão "Marcar como pago" em cada parcela pendente
- [x] UI: parcelas pagas aparecem na lista de pagamentos normais
- [x] UI: badge de parcelas vencidas (data ultrapassada e não paga)

## Suporte a PDF em Notas Fiscais

- [x] Seleção de arquivo PDF via document picker
- [x] Conversão da primeira página do PDF em imagem (base64) no cliente
- [x] Envio da imagem gerada para análise pela IA
- [x] Botão "Analisar NF" aceita tanto imagem quanto PDF

## Bug: Extração de PDF pela IA retorna dados incorretos

- [x] Converter PDF para imagem no servidor antes de enviar ao LLM (LLM não lê PDF diretamente)
- [x] Usar poppler/pdftoppm para renderizar a primeira página do PDF como PNG
- [x] Enviar a imagem gerada ao LLM em vez da URL do PDF

## Bug: IA não extrai duplicatas reais da NF

- [x] Atualizar prompt do LLM para extrair seção DUPLICATAS (número, vencimento, valor de cada parcela)
- [x] Retornar array de installments reais no JSON da IA (em vez de suggestedInstallments)
- [x] Modal de revisão: exibir parcelas reais com datas e valores individuais editáveis
- [x] Fallback: se não houver duplicatas, manter seletor de 1-6 parcelas como antes

## Agenda de Pagamentos (NF)

- [x] Rota tRPC: listar todas as parcelas pendentes do grupo, ordenadas por vencimento
- [x] Tela "Agenda": aba dedicada com seções Hoje / Esta Semana / Este Mês / Próximos Meses
- [x] Card de parcela: nome do fornecedor, número da parcela, valor, data de vencimento, badge de status
- [x] Badge de status: Vencido (vermelho), Hoje (laranja), Esta semana (amarelo), Futuro (cinza), Pago (verde)
- [x] Botão "Pagar" inline em cada card para marcar como paga sem sair da tela
- [x] Resumo no topo: total a pagar hoje, esta semana e este mês
- [x] Seção "Pagamentos Realizados" ao final com parcelas já pagas
- [x] Aba de Agenda visível no tab bar e sidebar web

## Bug + Feature: Nota Fiscal

- [x] Bug: botão "Excluir NF" não funciona na tela de Notas Fiscais
- [x] Feature: edição de nota fiscal (fornecedor, valor, data, descrição, categoria, perfil, parcelas)
- [x] Rota tRPC: updateInvoice para atualizar dados da NF e suas parcelas

## Melhorias Notas Fiscais v2

- [x] Categorias da NF: usar categorias dinâmicas do banco (igual ao adicionar pagamento)
- [x] Datas na NF: exibir e aceitar no formato brasileiro DD/MM/AAAA

## Máscara de Data

- [x] Componente DateInput com máscara automática DD/MM/AAAA
- [x] Aplicar DateInput em todos os campos de data em invoices.tsx (emissão, vencimentos, pagamento)

## Busca e Filtro na Agenda

- [x] Barra de pesquisa por nome/fornecedor na Agenda
- [x] Filtro por categoria (chips horizontais) na Agenda
- [x] Soma automática dos valores das parcelas filtradas exibida no topo
- [x] Limpar filtros com um toque

## Bug + Features: Agenda e Notas Fiscais

- [x] Bug: chips de categoria na Agenda cortados/não clicáveis na web (ScrollView horizontal com Pressable)
- [x] Feature: busca por nome na tela de Notas Fiscais
- [x] Feature: filtro por data (período) na tela de Notas Fiscais

## Melhorias Busca Notas Fiscais v3

- [x] Totalizador: ao buscar por nome, exibir soma de totalAmount de todas as NFs encontradas
- [x] Filtros rápidos: chips "Este Mês", "Último Mês", "Últimos 90 Dias", "Este Ano"
- [x] Filtros rápidos preenchem automaticamente os campos De/Até

## Ordenação de Notas Fiscais

- [x] Seletor de ordenação: Data de Emissão (↓ mais recente / ↑ mais antiga) e Data de Adição (↓ mais recente / ↑ mais antiga)
- [x] Ordenação aplicada sobre a lista já filtrada
- [x] Estado de ordenação persistido durante a sessão

## Financiamentos e Contas Mensais v13

- [x] Schema: tabela financings (id, userId, groupId, name, totalAmount, installmentAmount, totalInstallments, paidInstallments, startDate, dueDay, category, profile, notes, createdAt)
- [x] Schema: tabela monthly_bills (id, userId, groupId, name, amount, dueDay, category, profile, isActive, notes, createdAt)
- [x] Migração do banco para criar as novas tabelas
- [x] Rota tRPC: CRUD de financiamentos
- [x] Rota tRPC: registrar pagamento de parcela de financiamento
- [x] Rota tRPC: CRUD de contas mensais
- [x] Rota tRPC: registrar pagamento de conta mensal do mês atual
- [x] UI: nova aba "Financ." na navegação
- [x] UI: tela com duas seções — Financiamentos e Contas Mensais
- [x] UI: card de financiamento com nome, parcelas pagas/total, valor parcela, próximo vencimento, valor total devido
- [x] UI: modal de cadastro de financiamento (nome, valor total, nº parcelas até 240, valor parcela, dia vencimento, parcelas já pagas, data início, categoria, perfil, observações)
- [x] UI: barra de progresso de parcelas pagas no card de financiamento
- [x] UI: botão "Registrar Pagamento" no card de financiamento
- [x] UI: card de conta mensal com nome, valor, dia vencimento, status do mês atual
- [x] UI: modal de cadastro de conta mensal (nome, valor, dia vencimento, categoria, perfil, observações)
- [x] UI: botão "Pagar" na conta mensal para registrar pagamento do mês
- [x] UI: ícone e entrada na sidebar web

## Ajuste Financiamentos v14

- [x] Remover campo "Valor total" do formulário de cadastro de financiamento
- [x] Calcular automaticamente: total financiado = parcela × total de parcelas
- [x] Calcular automaticamente: saldo devedor = parcela × parcelas restantes
- [x] Remover totalAmount do card (exibir apenas os valores calculados)

## Categorias dinâmicas em Compromissos v15

- [ ] Usar categorias do banco (igual Configurações) nos formulários de Financiamentos e Contas Mensais
- [ ] Remover lista fixa de categorias da tela de Compromissos

## Bugs v16

- [x] Categorias criadas em Configurações não aparecem imediatamente em Compromissos (cache tRPC não invalida)
- [x] Erro "banco de dados indisponível" ao criar conta no Railway (DATABASE_URL não configurada no serviço Node.js)

## Bugs v17

- [x] Bug: erro interno ao criar conta no Railway mesmo após DATABASE_URL configurada (JWT_SECRET com fallback, logs de erro melhorados)
- [x] Bug: botão de excluir pagamento na Home não funciona (Alert.alert não funciona no web — substituído por modal customizado)

## Bugs v18

- [x] Bug: "crypto is not defined" ao fazer login/cadastro no Railway (polyfill globalThis.crypto adicionado no topo do servidor)

## Bugs v19

- [x] Bug: data dos pagamentos usa UTC em vez de horário de São Paulo (UTC-3), causando data errada à noite (getTodayBR() adicionado em utils.ts, usado em add.tsx e schedule.tsx)

## Feature: Exportar/Importar Dados

- [x] Endpoint tRPC importData em lote (pagamentos, categorias, financiamentos, contas mensais)
- [x] Botão "Exportar dados" em Configurações (gera JSON com todos os dados locais)
- [x] Botão "Importar dados" em Configurações (lê JSON e sobe para o servidor)

## Bugs v20

- [x] Bug: sidebar lateral não aparece no web/desktop no Railway (WebLayout duplicado removido do tabs/_layout.tsx)

## Bugs v21

- [x] Bug: após login por email/senha no Railway, sidebar não aparece — 3 causas corrigidas:
  1. JWT com name vazio causava falha na verificação (verifySession agora aceita name vazio)
  2. Usuários email/senha tentavam sync via OAuth (authenticateRequest pula OAuth para email_*)
  3. Após login no web, router.replace não re-executava useAuth (agora faz window.location.href reload)

## Bugs v22

- [x] Bug: botão de login recarrega a página sem fazer login — corrigido:
  1. Substituiu window.location.href por refreshAuth() + router.replace()
  2. cookies.ts não define domain em plataformas públicas (railway.app, manus.space, etc.) para evitar rejeio de cookie pelo browser

## Bugs v23

- [x] Bug: sidebar lateral não aparece após login bem-sucedido no Railway — criado AuthContext global (auth-context.tsx) para compartilhar estado de autenticação entre WebSidebar, login.tsx e settings.tsx

## Bugs v24

- [x] Bug: importação de dados demora mais de 3 minutos — otimizado para inserções em lote (1 query por tipo de dado em vez de N queries sequenciais)

## Bugs v25

- [x] Bug: exportação de relatórios (PDF, CSV, XLS) não faz nada ao clicar — expo-sharing não funciona no web; substituído por download via Blob/URL.createObjectURL no browser e PDF abre em nova aba para impressão

## Feature v26

- [x] Financiamentos aparecem na agenda de pagamentos (com data de vencimento da parcela)
- [x] Contas mensais aparecem na agenda de pagamentos (com data de vencimento)
- [x] Verificar: contas mensais recorrentes aparecem automaticamente todo mês sem recadastrar (getUnifiedSchedule gera entradas para os próximos 3 meses automaticamente)

## Bugs + Features v27

- [x] Bug: agenda mostra contas mensais de meses passados — corrigido para mostrar apenas mês atual + próximos 3 meses
- [x] Feature: botão de editar item na agenda (abre modal orientando para a aba correta)
- [x] Feature: botão de excluir item na agenda (modal de confirmação + delete no banco)

## Features + Bugs v28

- [x] Feature: filtros por tipo na agenda (Nota Fiscal, Financiamento, Conta Mensal) adicionados como chips acima dos chips de categoria
- [x] Feature: totais da agenda já mostram apenas saldo a pagar (itens pagos vão para seção separada)
- [x] Bug: saldo da semana maior que o do mês — endOfWeek() ultrapassava o fim do mês; corrigido para nunca ir além do último dia do mês

## Bugs v29

- [ ] Bug: financiamentos aparecem em "Próximos Meses" em vez de "Este Mês" na agenda (data de vencimento calculada errada)
- [ ] Bug: semana maior que mês nos totais da agenda (endOfWeek ainda ultrapassa o mês)
- [ ] Feature: remover linha "Total pendente" do resumo da agenda (mostrar apenas Hoje, Semana, Mês)

## Bugs v30

- [x] Bug: botão de excluir financiamento e conta mensal não funciona (Alert.alert substituído por modal customizado)

## Bug v31 — Datas de financiamento

- [x] Bug: financiamento com parcelas já pagas calcula próxima parcela no futuro em vez do mês atual
- [x] Remover campo "Data de início" do formulário de financiamento
- [x] Próxima parcela = mês atual (ou próximo se dia já passou), independente de parcelas já pagas

## Feature: NFs por e-mail via Mailgun v32

- [x] Tabela pending_invoices no banco de dados
- [x] Webhook /api/mailgun/inbound para receber e-mails
- [x] Extração de dados do PDF via IA (fornecedor, valor, parcelas, datas)
- [x] Endpoints tRPC: listar, aprovar e rejeitar NFs pendentes
- [x] Banner de NFs pendentes na tela de Notas Fiscais
- [x] Modal de revisão de NF pendente com campos editáveis
- [ ] Configurar rota de inbound no Mailgun apontando para o webhook do Railway

## Filtros de Período nas Notas Fiscais v32

- [x] Chips de filtro rápido visíveis: Todas, Este Mês, Mês Passado, Este Ano
- [x] Cada chip exibe a soma total das NFs do período
- [x] Chip ativo destaca em roxo com texto branco
- [x] Filtro de período integrado com busca por nome e filtro de data manual
- [x] Botão Limpar reseta também o filtro de período

## Marcar parcela como "Já paga anteriormente" v33

- [x] Campo alreadyPaid (boolean) na tabela invoice_installments
- [x] Endpoint tRPC: markAsAlreadyPaid — marca a parcela sem criar Payment
- [x] Endpoint tRPC: unmarkAlreadyPaid — desfaz o "já pago"
- [x] UI: botão "Já foi pago" nas parcelas vencidas (diferente do botão "Pagar")
- [x] UI: parcelas marcadas como "já pagas" aparecem com badge cinza "Pago ant."
- [x] Excluir do relatório e do totalizador da Agenda parcelas com alreadyPaid=true (não criam Payment)

## Bug v34

- [x] Parcelas marcadas como "Pago ant." (alreadyPaid=1) ainda aparecem como pendentes na Agenda — corrigido em getUnifiedSchedule e getInstallmentSchedule

## Aba Funcionários v35

- [ ] Tabela `employees` no banco: nome, cargo, salário base, admissão, chave PIX, VT diário, VA mensal, dia pagamento adiantamento (padrão 20), dia pagamento salário (padrão 5)
- [ ] Tabela `employee_payments` no banco: funcionário, mês/ano, valor adiantamento, valor salário líquido, VA, VT, status (pendente/pago), paymentId vinculado
- [ ] Endpoints tRPC: create, list, update, delete employee
- [ ] Endpoints tRPC: getMonthlyPayroll, markAdvancePaid, markSalaryPaid
- [ ] Tela de Funcionários: lista de cards com nome, cargo, salário base
- [ ] Modal de cadastro/edição: nome completo, cargo, salário base, admissão, chave PIX, VT diário, VA mensal
- [ ] Folha mensal: card por funcionário com adiantamento (dia 20) e salário líquido + VA + VT (dia 05), botão Pagar para cada
- [ ] Integrar pagamentos de funcionários na Agenda como itens recorrentes mensais
- [ ] Ao pagar, criar registro em payments (categoria "Folha de Pagamento") para aparecer no Relatório

## Aba Funcionários v35

- [x] Tabelas employees e employee_payments no banco
- [x] Endpoints tRPC: create, update, delete, listPayroll, updatePayroll, markAdvancePaid, markSalaryPaid
- [x] Tela de Funcionários com aba Folha do Mês e aba Funcionários
- [x] Cadastro com nome completo, cargo, salário base, data de admissão, chave PIX, VT diário, VA mensal, dias de pagamento
- [x] Folha mensal: adiantamento (dia 20) + salário líquido (dia 05) + VT + VA, editáveis por mês
- [x] Botões Pagar/Pago para adiantamento e salário separados
- [x] Integração com Agenda (adiantamento e salário aparecem como itens recorrentes)
- [x] Pagamentos marcados vão para Relatórios como categoria "Folha de Pagamento"
- [x] Aba Funcionários na tab bar e sidebar web

## Bug v36

- [x] Aba Funcionários não aparece no app após deploy — faltava o link na sidebar web

## Análise de Holerites PDF por IA v37

- [ ] Tabela pending_payrolls no banco (holerites aguardando revisão)
- [ ] Webhook Mailgun para receber e-mails com múltiplos PDFs de holerite
- [ ] IA extrai todos os campos do holerite (nome, cargo, salário base, VT, VA, adiantamento, salário líquido, competência)
- [ ] Se funcionário não existir, criar cadastro automaticamente
- [ ] Tela de revisão de holerites pendentes na aba Funcionários
- [ ] Resumo de pagamento mostra apenas Salário Líquido + Adiantamento
- [ ] Confirmar holerite: atualiza folha do mês com valores extraídos
- [ ] Rejeitar holerite: descarta sem criar registros

## Bug v37

- [x] Tela de Funcionários não mostra o endereço de e-mail para envio de holerites em PDF — adicionado card informativo com e-mail e botão Copiar

## Upload Direto de Holerite v38

- [x] Endpoint POST /api/payroll/upload para receber PDF diretamente do app
- [x] Botão "Enviar PDF" na tela de Funcionários (abre document picker)
- [x] Suporte a múltiplos PDFs em um único upload
- [x] PDF processado pela IA e entra no fluxo de revisão existente (pending_payrolls)

## Bug v39

- [ ] Upload de holerite falha com "usuário sem grupo configurado" — groupId não lido corretamente do user

## Melhoria v40

- [x] Usar pdf-parse para extrair texto do PDF de holerite e processar múltiplos funcionários de uma vez
- [x] Ignorar segunda via (duplicata) de cada holerite no PDF (instrução explícita no prompt da IA)
- [x] Corrigir erro "usuário sem grupo configurado" — userId enviado no header, groupId buscado via group_members

## Reestruturação Pagamentos Funcionários v41

- [x] Atualizar tabela employee_payments: separar tipo adiantamento (dia 20) e salário (dia 05)
- [x] Salário dia 05: campos salário líquido, VT diário, VA diário, dias úteis; calcular total automaticamente
- [x] Adiantamento dia 20: campo único de valor
- [x] Ao criar pagamento, buscar funcionário cadastrado (não digitar nome manualmente)
- [x] Atualizar endpoints tRPC para nova estrutura
- [x] Reescrever tela de Funcionários com novo fluxo de pagamentos
- [x] Integrar novos pagamentos na Agenda e Relatórios

## Melhorias Folha de Pagamento v42

- [x] Botão "Novo Pagamento" na aba Folha do Mês
- [x] Modal de seleção de tipo: Adiantamento (dia 20) ou Salário (dia 05)
- [x] Seletor de funcionário no modal de novo pagamento
- [x] Campos específicos por tipo (valor único para adiantamento; salário líquido + VT/VA + dias úteis para salário)
- [x] Botão Excluir funcionário na aba Funcionários com modal de confirmação

## Bug v43 — Excluir folha de pagamento

- [x] Endpoint tRPC deletePayroll para excluir um registro de employee_payments
- [x] Botão excluir no PayrollCard (ícone de lixeira ou link "Excluir")
- [x] Modal de confirmação antes de excluir a folha
- [x] Invalidar cache após exclusão para atualizar a lista

## Bug v44 — Exclusão de folha não funciona

- [x] Investigar por que o deletePayroll não exclui o registro
- [x] Causa: listMonthlyPayroll recria automaticamente o registro após exclusão
- [x] Solução: zerar os valores (advanceAmount, netSalary, VT, VA) e remover pagamentos vinculados em vez de excluir

## Melhoria v45 — Ordenação alfabética de funcionários

- [x] Ordenar lista de funcionários por nome (A-Z) na query listEmployees
- [x] Ordenar lista da Folha do Mês por nome (A-Z) na query listMonthlyPayroll

## Bug v46 — Aprovação de holerite não cadastra funcionário nem lança folha

- [x] Investigar função approvePayroll no backend
- [x] Causa: schema Drizzle usava camelCase mas banco tem snake_case nas colunas de pending_payrolls
- [x] Corrigir schema Drizzle para mapear colunas snake_case corretamente
- [x] Corrigir lançamento da folha com vtDaily, vaDaily e workingDays preenchidos

## Bug v47 — Upload de PDF de holerite parou de funcionar após correção do schema

- [x] Investigar o erro no upload de PDF após a mudança do schema Drizzle (snake_case)
- [x] Causa: pdf-parse foi atualizado para v2 com API incompatível (não aceita mais buffer, só URL)
- [x] Solução: substituir pdf-parse pelo pdftotext (poppler-utils) via child_process.execFile
- [x] Validar que o upload volta a funcionar corretamente (dados extraídos com sucesso)

## Bug v48 — Upload de PDF continua falhando (regressão)

- [x] Causa: pdftotext funciona localmente mas pode falhar em produção; quando pdftotext retorna vazio, a IA recebia texto vazio e não conseguia extrair dados
- [x] Solução: restaurado o fallback de imagem base64 quando pdftotext falha ou retorna < 50 chars
- [x] Fluxo: tenta pdftotext (rápido e preciso) → se falhar, usa imagem base64 (que funcionava antes)

## Bug v49 — Upload de PDF persiste com erro "0 de 1 processado"

- [x] Diagnosticar erro real nos logs do servidor durante upload
- [x] Causa: endpoint usava X-User-Id header mas não autenticava via cookie/Bearer token; usuário logado não tinha o userId correto sendo enviado
- [x] Correção: endpoint agora usa sdk.authenticateRequest() para autenticar via cookie/Bearer token (igual aos outros endpoints tRPC)
- [x] Frontend agora envia Bearer token no header Authorization para plataforma nativa

## Bug v50 — Upload de PDF ainda falha "0 de 1 processado" (persiste após v49)

- [x] Diagnosticar com debugging agent — hipóteses: buffer vazio, auth falhando, ou LLM falhando
- [x] Tornar S3 upload non-blocking (se falhar, continua com base64)
- [x] Adicionar logging detalhado em todo o fluxo (auth, file details, LLM response)
- [x] Frontend agora mostra o erro específico quando processamento falha
- [x] Validar buffer antes de processar (rejeitar se vazio)
- [x] Causa real: pdftotext (poppler-utils) não existe em produção; fallback de imagem base64 não funciona com Gemini
- [x] Solução: substituir pdftotext por pdfjs-dist (npm, funciona em qualquer Node.js sem deps do sistema)

## Bug v51 — Holerite processado com sucesso mas não aparece na tela

- [x] Causa: mesmo bug v50 — pdftotext falhava em produção, fallback de imagem não funcionava com Gemini
- [x] Solução: pdfjs-dist extrai texto corretamente (40k chars, 23 páginas, 20 funcionários)
- [x] Testado com PDF real: todos os funcionários extraídos com salário líquido e adiantamento

## Bug v52 — Insert pending_payrolls falha por FK constraint de employee_id

- [x] Causa: employee_id encontrado no banco pode não existir na tabela employees de produção (FK inválida)
- [x] Solução: employeeId não é mais enviado no insert — será vinculado na aprovação
- [x] Testado: 20 funcionários inseridos com sucesso sem FK constraint

## Bug v53 — Insert pending_payrolls ainda falha em produção

- [ ] Verificar schema real da tabela no banco de produção (SHOW CREATE TABLE)
- [ ] Identificar qual constraint está causando o erro
- [ ] Corrigir o insert ou fazer migration para ajustar o schema

## Módulo de Funcionários v35

- [x] Schema DB: tabelas employees, employee_payments, pending_payrolls
- [x] Routers servidor: CRUD employees, folha mensal, adiantamento, holerite PDF IA
- [x] Aba Funcionários: listagem com busca e botão de cadastro
- [x] Aba Funcionários: formulário de cadastro/edição (nome, cargo, admissão, pix, salário base)
- [x] Aba Funcionários: excluir funcionário
- [x] Folha do Mês: tela com pagamentos dia 05 (salário líquido + VT + VA + outros) e adiantamento dia 20
- [x] Folha do Mês: marcar como pago (lança em payments categoria Salários)
- [x] Leitor de holerite PDF por IA: upload, conversão em imagem, extração por LLM
- [x] Leitor de holerite: auto-cadastrar funcionário se não existir
- [x] Leitor de holerite: lançar pagamento do holerite
- [x] Sidebar web e tab layout: adicionar aba Funcionários

## VT e VA padrão no cadastro de funcionários v56

- [ ] Schema: adicionar colunas vtDaily e vaDaily na tabela employees
- [ ] db.ts: incluir vtDaily e vaDaily nas funções createEmployee e updateEmployee
- [ ] Routers: expor vtDaily e vaDaily no CRUD de employees
- [ ] UI: campos VT diário e VA diário no formulário de cadastro/edição
- [ ] Folha do mês: pré-preencher vtDaily e vaDaily do funcionário ao criar registro mensal
