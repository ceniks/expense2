ALTER TABLE `employee_payments` ADD `workingDays` int DEFAULT 22;--> statement-breakpoint
ALTER TABLE `employee_payments` ADD `vtDaily` decimal(12,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `employee_payments` ADD `vaDaily` decimal(12,2) DEFAULT '0';