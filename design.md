# Design — GastoPix (Rastreador de Pagamentos com IA)

## Identidade Visual

- **Nome do App:** GastoPix
- **Paleta de Cores:**
  - Primary: `#6C47FF` (roxo vibrante — moderno, financeiro)
  - Background Light: `#F8F7FF` / Dark: `#0F0E17`
  - Surface Light: `#FFFFFF` / Dark: `#1A1929`
  - Foreground Light: `#1A1A2E` / Dark: `#EEEEFF`
  - Muted Light: `#7B7A9A` / Dark: `#9898B8`
  - Success: `#22C55E` / Error: `#EF4444` / Warning: `#F59E0B`
  - Border Light: `#E5E3F5` / Dark: `#2E2C4A`
  - Accent (roxo claro): `#EDE9FF` light / `#2A2545` dark

## Telas

### 1. Home (Resumo do Mês)
- **Conteúdo:**
  - Card grande no topo com total gasto no mês atual
  - Barra de progresso ou mini gráfico de pizza por categoria
  - Lista dos últimos pagamentos (FlatList) com thumbnail do comprovante, descrição, valor e data
  - Botão flutuante (+) para adicionar novo pagamento
- **Funcionalidade:** Navegar para detalhe do pagamento ao tocar no item

### 2. Adicionar Pagamento
- **Conteúdo:**
  - Botão grande para tirar foto ou selecionar da galeria
  - Preview da imagem selecionada
  - Indicador de carregamento enquanto IA processa
  - Campos editáveis preenchidos pela IA: Descrição, Valor (R$), Data, Categoria
  - Botão "Salvar Pagamento"
- **Funcionalidade:** Upload de imagem → análise IA → preenchimento automático → edição manual → salvar

### 3. Relatório Mensal
- **Conteúdo:**
  - Seletor de mês/ano (navegação com setas)
  - Card de total do mês
  - Gráfico de pizza por categoria (react-native-svg)
  - Lista de categorias com valor e percentual
  - Botão para compartilhar/exportar relatório
- **Funcionalidade:** Visualizar gastos por mês, navegar entre meses

### 4. Detalhe do Pagamento
- **Conteúdo:**
  - Imagem do comprovante em tamanho maior
  - Todos os dados: descrição, valor, data, categoria, observação
  - Botão de editar e excluir
- **Funcionalidade:** Editar ou excluir pagamento

## Fluxos Principais

### Adicionar Pagamento
1. Usuário toca no botão (+) na Home
2. Tela de Adicionar abre
3. Usuário toca em "Selecionar Imagem" → galeria ou câmera
4. Imagem é enviada para o servidor → IA extrai dados
5. Campos são preenchidos automaticamente
6. Usuário revisa/edita e toca em "Salvar"
7. Pagamento salvo localmente → volta para Home atualizada

### Ver Relatório
1. Usuário toca na aba "Relatório"
2. Mês atual exibido com total e gráfico
3. Usuário navega entre meses com setas

## Navegação

- **Tab Bar (3 abas):**
  - Home (ícone: house.fill)
  - Adicionar (ícone: plus.circle.fill) — destaque central
  - Relatório (ícone: chart.pie.fill)

## Estilo Geral

- Cards com bordas arredondadas (rounded-2xl)
- Sombras suaves (shadow-sm)
- Tipografia clara: títulos bold, subtítulos semibold, corpo regular
- Modo claro e escuro automático
- Feedback háptico em ações primárias
