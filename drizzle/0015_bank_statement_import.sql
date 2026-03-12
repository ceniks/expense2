CREATE TABLE `bank_accounts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `groupId` int,
  `name` varchar(100) NOT NULL,
  `bank` varchar(100) NOT NULL,
  `accountType` enum('checking','savings','credit') NOT NULL DEFAULT 'checking',
  `profile` enum('Pessoal','Empresa') NOT NULL DEFAULT 'Pessoal',
  `color` varchar(20) NOT NULL DEFAULT '#6366f1',
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

CREATE TABLE `bank_statement_imports` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `groupId` int,
  `accountId` int NOT NULL,
  `fileName` varchar(300) NOT NULL,
  `importedAt` timestamp NOT NULL DEFAULT (now()),
  `totalRows` int NOT NULL DEFAULT 0,
  `imported` int NOT NULL DEFAULT 0,
  `ignored` int NOT NULL DEFAULT 0,
  `fileUrl` text
);

CREATE TABLE `statement_rows` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `importId` int NOT NULL,
  `accountId` int NOT NULL,
  `userId` int NOT NULL,
  `groupId` int,
  `date` varchar(10) NOT NULL,
  `description` varchar(500) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `type` enum('debit','credit') NOT NULL,
  `suggestedCategory` varchar(100),
  `suggestedProfile` enum('Pessoal','Empresa'),
  `suggestedDescription` varchar(500),
  `confidence` decimal(3,2),
  `status` enum('pending','approved','ignored') NOT NULL DEFAULT 'pending',
  `isTransfer` boolean NOT NULL DEFAULT false,
  `transferPairId` int,
  `paymentId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
