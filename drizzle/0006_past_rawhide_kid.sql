CREATE TABLE `pending_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int,
	`supplierName` varchar(300),
	`totalAmount` decimal(12,2),
	`issueDate` varchar(10),
	`description` text,
	`imageUrl` text,
	`category` varchar(100) NOT NULL DEFAULT 'Outros',
	`profile` enum('Pessoal','Empresa') NOT NULL DEFAULT 'Empresa',
	`installmentsJson` text,
	`fromEmail` varchar(320),
	`emailSubject` varchar(500),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pending_invoices_id` PRIMARY KEY(`id`)
);
