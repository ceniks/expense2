CREATE TABLE `employee_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`userId` int NOT NULL,
	`groupId` int,
	`yearMonth` varchar(7) NOT NULL,
	`advanceAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`netSalary` decimal(12,2) NOT NULL DEFAULT '0',
	`vtAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`vaAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`advancePaidAt` timestamp,
	`advancePaymentId` int,
	`salaryPaidAt` timestamp,
	`salaryPaymentId` int,
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
	`baseSalary` decimal(12,2) NOT NULL,
	`admissionDate` varchar(10) NOT NULL,
	`pixKey` varchar(300) NOT NULL DEFAULT '',
	`dailyVT` decimal(8,2) NOT NULL DEFAULT '0',
	`monthlyVA` decimal(8,2) NOT NULL DEFAULT '0',
	`advanceDay` int NOT NULL DEFAULT 20,
	`salaryDay` int NOT NULL DEFAULT 5,
	`workingDaysPerMonth` int NOT NULL DEFAULT 22,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
