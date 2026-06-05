CREATE TABLE `feedback_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`runId` text NOT NULL,
	`target` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submittedAt` text,
	`submissionId` text,
	FOREIGN KEY (`runId`) REFERENCES `chapter_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_comment_run_id_idx` ON `feedback_comment` (`runId`);--> statement-breakpoint
CREATE INDEX `feedback_comment_submission_id_idx` ON `feedback_comment` (`submissionId`);