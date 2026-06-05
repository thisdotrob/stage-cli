import type { FeedbackCommentTarget } from "@stagereview/types/feedback";
import { FEEDBACK_COMMENT_STATUS } from "@stagereview/types/feedback";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { chapterRun } from "./chapter-run.js";
import { baseColumns } from "./columns.js";

export const feedbackComment = sqliteTable(
	"feedback_comment",
	{
		...baseColumns(),
		runId: text()
			.notNull()
			.references(() => chapterRun.id, { onDelete: "cascade" }),
		target: text({ mode: "json" }).$type<FeedbackCommentTarget>().notNull(),
		body: text().notNull(),
		status: text({
			enum: [FEEDBACK_COMMENT_STATUS.DRAFT, FEEDBACK_COMMENT_STATUS.SUBMITTED],
		})
			.notNull()
			.default(FEEDBACK_COMMENT_STATUS.DRAFT),
		submittedAt: text(),
		submissionId: text(),
	},
	(table) => [
		index("feedback_comment_run_id_idx").on(table.runId),
		index("feedback_comment_submission_id_idx").on(table.submissionId),
	],
);

export type FeedbackCommentRow = typeof feedbackComment.$inferSelect;
export type FeedbackCommentInsert = typeof feedbackComment.$inferInsert;
