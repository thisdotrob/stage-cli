import { z } from "zod";
import { DIFF_SIDE } from "./chapters.ts";

export const FEEDBACK_TARGET_TYPE = {
	FILE: "file",
	LINE: "line",
} as const;
export type FeedbackTargetType = (typeof FEEDBACK_TARGET_TYPE)[keyof typeof FEEDBACK_TARGET_TYPE];

export const FEEDBACK_COMMENT_STATUS = {
	DRAFT: "draft",
	SUBMITTED: "submitted",
} as const;
export type FeedbackCommentStatus =
	(typeof FEEDBACK_COMMENT_STATUS)[keyof typeof FEEDBACK_COMMENT_STATUS];

export const FEEDBACK_BODY_MAX_LENGTH = 20_000;

export const feedbackLineRangeSchema = z
	.strictObject({
		side: z.enum(DIFF_SIDE),
		startLine: z.number().int().positive(),
		endLine: z.number().int().positive(),
		endSide: z.enum(DIFF_SIDE).optional(),
	})
	.refine((v) => v.startLine <= v.endLine, {
		message: "endLine must be greater than or equal to startLine",
		path: ["endLine"],
	});
export type FeedbackLineRange = z.infer<typeof feedbackLineRangeSchema>;

const chapterIdSchema = z.string().min(1).optional();

export const feedbackFileTargetSchema = z.strictObject({
	type: z.literal(FEEDBACK_TARGET_TYPE.FILE),
	filePath: z.string().min(1),
	chapterId: chapterIdSchema,
});
export type FeedbackFileTarget = z.infer<typeof feedbackFileTargetSchema>;

export const feedbackLineTargetSchema = z.strictObject({
	type: z.literal(FEEDBACK_TARGET_TYPE.LINE),
	filePath: z.string().min(1),
	chapterId: chapterIdSchema,
	range: feedbackLineRangeSchema,
});
export type FeedbackLineTarget = z.infer<typeof feedbackLineTargetSchema>;

export const feedbackCommentTargetSchema = z.discriminatedUnion("type", [
	feedbackFileTargetSchema,
	feedbackLineTargetSchema,
]);
export type FeedbackCommentTarget = z.infer<typeof feedbackCommentTargetSchema>;

const feedbackBodySchema = z.string().trim().min(1).max(FEEDBACK_BODY_MAX_LENGTH);

export const CreateFeedbackCommentBodySchema = z.strictObject({
	target: feedbackCommentTargetSchema,
	body: feedbackBodySchema,
});
export type CreateFeedbackCommentBody = z.infer<typeof CreateFeedbackCommentBodySchema>;

export const UpdateFeedbackCommentBodySchema = z.strictObject({
	body: feedbackBodySchema,
});
export type UpdateFeedbackCommentBody = z.infer<typeof UpdateFeedbackCommentBodySchema>;

export const FeedbackCommentSchema = z.strictObject({
	id: z.string(),
	runId: z.string(),
	target: feedbackCommentTargetSchema,
	body: z.string(),
	status: z.enum(FEEDBACK_COMMENT_STATUS),
	createdAt: z.string(),
	updatedAt: z.string(),
	submittedAt: z.string().nullable(),
	submissionId: z.string().nullable(),
});
export type FeedbackComment = z.infer<typeof FeedbackCommentSchema>;

export const FeedbackCommentsResponseSchema = z.strictObject({
	comments: z.array(FeedbackCommentSchema),
});
export type FeedbackCommentsResponse = z.infer<typeof FeedbackCommentsResponseSchema>;

export const FeedbackCommentResponseSchema = z.strictObject({
	comment: FeedbackCommentSchema,
});
export type FeedbackCommentResponse = z.infer<typeof FeedbackCommentResponseSchema>;

export const FeedbackSubmissionSchema = z.strictObject({
	id: z.string(),
	runId: z.string(),
	submittedAt: z.string(),
	comments: z.array(FeedbackCommentSchema),
});
export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

export const FeedbackSubmissionResponseSchema = z.strictObject({
	submission: FeedbackSubmissionSchema,
});
export type FeedbackSubmissionResponse = z.infer<typeof FeedbackSubmissionResponseSchema>;
