CREATE TABLE `employee_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`userId` int NOT NULL,
	`groupId` int,
	`yearMonth` varchar(7) NOT NULL,
	`advanceAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`advancePaidAt` timestamp,
	`advancePaymentId` int,
	`netSalary` decimal(12,2) NOT NULL DEFAULT '0',
	`vtDaily` decimal(8,2) NOT NULL DEFAULT '0',
	`vaDaily` decimal(8,2) NOT NULL DEFAULT '0',
	`workingDays` int NOT NULL DEFAULT 22,
	`otherBenefits` decimal(12,2) NOT NULL DEFAULT '0',
	`salaryPaidAt` timestamp,
	`salaryPaymentId` int,
	`pdfUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int,
	`fullName` varchar(300) NOT NULL,
	`role` varchar(100) NOT NULL DEFAULT '',
	`baseSalary` decimal(12,2) NOT NULL DEFAULT '0',
	`admissionDate` varchar(10) NOT NULL DEFAULT '',
	`pixKey` varchar(300) NOT NULL DEFAULT '',
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pending_payrolls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`employeeId` int,
	`employeeName` varchar(300) NOT NULL,
	`position` varchar(100),
	`baseSalary` decimal(12,2),
	`netSalary` decimal(12,2),
	`advanceAmount` decimal(12,2),
	`vtDaily` decimal(8,2),
	`competenceMonth` int,
	`competenceYear` int,
	`rawData` json,
	`pdfUrl` varchar(500),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pending_payrolls_id` PRIMARY KEY(`id`)
);
