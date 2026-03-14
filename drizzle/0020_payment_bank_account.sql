ALTER TABLE `payments` ADD COLUMN `bankAccountId` int;

-- Backfill automático: preenche bankAccountId para pagamentos já aprovados via extrato
UPDATE `payments` p
INNER JOIN `statement_rows` sr ON sr.paymentId = p.id
SET p.bankAccountId = sr.accountId
WHERE p.bankAccountId IS NULL;
