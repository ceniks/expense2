CREATE TABLE `pending_payrolls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`employeeId` int,
	`employeeName` varchar(255) NOT NULL,
	`position` varchar(255),
	`baseSalary` decimal(12,2),
	`netSalary` decimal(12,2),
	`advanceAmount` decimal(12,2),
	`vtDaily` decimal(8,2),
	`vaMonthly` decimal(8,2),
	`competenceMonth` int,
	`competenceYear` int,
	`rawData` json,
	`pdfUrl` varchar(500),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pending_payrolls_id` PRIMARY KEY(`id`)
);
