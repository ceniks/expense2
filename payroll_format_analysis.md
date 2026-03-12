# Análise do Formato do Holerite PDF

## Estrutura do PDF
- PDF com 23 páginas, cada holerite tem 2 vias (duplicata)
- Cada funcionário ocupa 2 páginas (via 1 + via 2 idênticas)
- Total: ~11-12 funcionários por PDF

## Campos do Holerite (por funcionário)

### Cabeçalho
- Empresa: L E FASHION EIRELI
- Endereço: AVENIDA TUCUNARÉ 574, BARUERI - SP
- CNPJ: 36.682.719/0001-05
- Tipo: RECIBO DE PAGAMENTO MENSAL
- Competência: Fevereiro/2026

### Dados do Funcionário
- Código (número interno)
- Nome completo
- CBO (código de ocupação)
- Cargo (segunda linha)

### Tabela de Vencimentos e Descontos
Cada linha tem: Código | Descrição | Referência | Vencimentos | Descontos

Exemplos de vencimentos:
- 1 - Salário (referência = dias trabalhados)
- 5 - D.S.R. Sobre Horas Extras
- 24 - Comissão
- 161 - Abono Pecuniário Mês Anterior
- 162 - 1/3 Abono Pecuniário Mês Ant.
- 194 - Horas Extras 60%
- 270 - Férias No Mês
- 271 - 1/3 de Férias no Mês
- 338 - Créd Prov eConsignado (Adiant)

Exemplos de descontos:
- 11 - INSS Sobre Salário
- 12 - Adiantamento Anterior
- 39 - Faltas (Dias)
- 53 - Liquido de Férias
- 109 - Desc. Vale Transporte
- 112 - D.S.R. Sobre Comissão
- 167 - Liquido Férias Mês Anterior
- 218 - Empréstimo eConsignado
- 322 - INSS Férias Mês -Recibo
- 340/341/342 - Empréstimo eConsignado Contr 2/3/4
- 1008 - Desc. Adiantamento
- 1012 - DSR sob Atrasos/Falta
- 1049 - Faltas (horas)
- 1077 - Pensão Alimenticia (%)

### Rodapé
- Total Vencimentos
- Total Descontos
- Total Líquido
- Salário Base
- Sal.Contr.INSS
- Base Calculo FGTS
- FGTS do MES
- Base Calculo IRRF
- Faixa IRRF

## Campos a Extrair para o Sistema
- employeeName: Nome do funcionário
- position: Cargo
- baseSalary: Salário Base (rodapé)
- netSalary: Total Líquido
- advanceAmount: valor do "Adiantamento Anterior" (desconto código 12) ou "Desc. Adiantamento" (código 1008)
- vtDaily: Desc. Vale Transporte / dias de referência (código 109)
- competenceMonth/Year: da competência no cabeçalho
