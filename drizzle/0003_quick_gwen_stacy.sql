CREATE TABLE `invoice_installments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`installmentNumber` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`dueDate` varchar(10) NOT NULL,
	`paidAt` timestamp,
	`paymentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_installments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int,
	`supplierName` varchar(300) NOT NULL,
	`totalAmount` decimal(12,2) NOT NULL,
	`issueDate` varchar(10) NOT NULL,
	`description` text,
	`imageUrl` text,
	`profile` enum('Pessoal','Empresa') NOT NULL DEFAULT 'Empresa',
	`category` varchar(100) NOT NULL DEFAULT 'Outros',
	`totalInstallments` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
