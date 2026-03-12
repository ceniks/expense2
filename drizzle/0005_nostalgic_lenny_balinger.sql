CREATE TABLE `financings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int,
	`name` varchar(300) NOT NULL,
	`totalAmount` decimal(12,2) NOT NULL,
	`installmentAmount` decimal(12,2) NOT NULL,
	`totalInstallments` int NOT NULL,
	`paidInstallments` int NOT NULL DEFAULT 0,
	`startDate` varchar(10) NOT NULL,
	`dueDay` int NOT NULL,
	`category` varchar(100) NOT NULL DEFAULT 'Financiamento',
	`profile` enum('Pessoal','Empresa') NOT NULL DEFAULT 'Pessoal',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_bill_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`billId` int NOT NULL,
	`userId` int NOT NULL,
	`yearMonth` varchar(7) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`paymentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthly_bill_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_bills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int,
	`name` varchar(300) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`dueDay` int NOT NULL,
	`category` varchar(100) NOT NULL DEFAULT 'Contas',
	`profile` enum('Pessoal','Empresa') NOT NULL DEFAULT 'Pessoal',
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_bills_id` PRIMARY KEY(`id`)
);
