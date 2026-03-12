CREATE TABLE `statement_rules` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `groupId` int,
  `pattern` varchar(300) NOT NULL,
  `category` varchar(100) NOT NULL,
  `profile` enum('Pessoal','Empresa') NOT NULL,
  `suggestedDescription` varchar(500),
  `usageCount` int NOT NULL DEFAULT 1,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_user_pattern` (`userId`, `pattern`)
);
