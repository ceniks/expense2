CREATE TABLE `ai_settings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `groupId` int,
  `provider` enum('manus','claude','gemini','gpt') NOT NULL DEFAULT 'manus',
  `apiKey` varchar(500),
  `model` varchar(100),
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
