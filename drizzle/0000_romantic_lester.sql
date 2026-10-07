CREATE TABLE `private_access_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_private_attempts_expires` ON `private_access_attempts` (`expires`);--> statement-breakpoint
CREATE TABLE `private_access_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_private_sessions_expires` ON `private_access_sessions` (`expires`);