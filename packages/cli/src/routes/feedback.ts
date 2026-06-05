import { randomUUID } from "node:crypto";
import {
	type CreateFeedbackCommentBody,
	CreateFeedbackCommentBodySchema,
	FEEDBACK_COMMENT_STATUS,
	type FeedbackComment,
	type FeedbackSubmission,
	type UpdateFeedbackCommentBody,
	UpdateFeedbackCommentBodySchema,
} from "@stagereview/types/feedback";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { StageDb } from "../db/client.js";
import { chapter, chapterRun, feedbackComment } from "../db/schema/index.js";
import type { Route } from "../server.js";
import { readJsonBody, writeJson } from "./json.js";

interface FeedbackRoutesOptions {
	deliverSubmission?: (submission: FeedbackSubmission) => Promise<void>;
	onSubmitted?: () => void;
}

type FeedbackCommentRow = typeof feedbackComment.$inferSelect;

export function feedbackRoutes(db: StageDb, opts: FeedbackRoutesOptions = {}): Route[] {
	return [
		{
			method: "GET",
			pattern: "/api/runs/:runId/feedback",
			handler: (_req, res, params) => {
				const runId = requireRunId(res, params.runId);
				if (!runId) return;
				if (!runExists(db, runId)) {
					writeJson(res, 404, { error: `Run ${runId} not found` });
					return;
				}

				const comments = db
					.select()
					.from(feedbackComment)
					.where(eq(feedbackComment.runId, runId))
					.orderBy(asc(feedbackComment.createdAt))
					.all()
					.map(mapFeedbackComment);
				writeJson(res, 200, { comments });
			},
		},
		{
			method: "POST",
			pattern: "/api/runs/:runId/feedback",
			handler: async (req, res, params) => {
				const runId = requireRunId(res, params.runId);
				if (!runId) return;
				if (!runExists(db, runId)) {
					writeJson(res, 404, { error: `Run ${runId} not found` });
					return;
				}

				const parsed = await parseBody<CreateFeedbackCommentBody>(
					req,
					res,
					CreateFeedbackCommentBodySchema,
					"Invalid feedback comment body",
				);
				if (!parsed) return;
				if (!targetBelongsToRun(db, runId, parsed.target.chapterId)) {
					writeJson(res, 400, { error: "Feedback target chapter does not belong to this run" });
					return;
				}

				const [row] = db
					.insert(feedbackComment)
					.values({
						runId,
						target: parsed.target,
						body: parsed.body,
						status: FEEDBACK_COMMENT_STATUS.DRAFT,
					})
					.returning()
					.all();
				if (!row) throw new Error("feedback_comment insert returned no row");
				writeJson(res, 201, { comment: mapFeedbackComment(row) });
			},
		},
		{
			method: "PATCH",
			pattern: "/api/runs/:runId/feedback/:commentId",
			handler: async (req, res, params) => {
				const resolved = requireRunAndCommentId(res, params.runId, params.commentId);
				if (!resolved) return;
				const existing = findComment(db, resolved.runId, resolved.commentId);
				if (!existing) {
					writeJson(res, 404, { error: `Feedback comment ${resolved.commentId} not found` });
					return;
				}
				if (existing.status !== FEEDBACK_COMMENT_STATUS.DRAFT) {
					writeJson(res, 409, { error: "Submitted feedback comments cannot be edited" });
					return;
				}

				const parsed = await parseBody<UpdateFeedbackCommentBody>(
					req,
					res,
					UpdateFeedbackCommentBodySchema,
					"Invalid feedback update body",
				);
				if (!parsed) return;

				const [row] = db
					.update(feedbackComment)
					.set({ body: parsed.body })
					.where(eq(feedbackComment.id, resolved.commentId))
					.returning()
					.all();
				if (!row) throw new Error("feedback_comment update returned no row");
				writeJson(res, 200, { comment: mapFeedbackComment(row) });
			},
		},
		{
			method: "DELETE",
			pattern: "/api/runs/:runId/feedback/:commentId",
			handler: (_req, res, params) => {
				const resolved = requireRunAndCommentId(res, params.runId, params.commentId);
				if (!resolved) return;
				const existing = findComment(db, resolved.runId, resolved.commentId);
				if (!existing) {
					writeJson(res, 200, {});
					return;
				}
				if (existing.status !== FEEDBACK_COMMENT_STATUS.DRAFT) {
					writeJson(res, 409, { error: "Submitted feedback comments cannot be deleted" });
					return;
				}
				db.delete(feedbackComment).where(eq(feedbackComment.id, resolved.commentId)).run();
				writeJson(res, 200, {});
			},
		},
		{
			method: "POST",
			pattern: "/api/runs/:runId/feedback/submit",
			handler: async (_req, res, params) => {
				const runId = requireRunId(res, params.runId);
				if (!runId) return;
				if (!runExists(db, runId)) {
					writeJson(res, 404, { error: `Run ${runId} not found` });
					return;
				}

				const submission = submitDraftFeedback(db, runId);
				if (!submission) {
					writeJson(res, 400, { error: "No draft feedback comments to submit" });
					return;
				}

				await opts.deliverSubmission?.(submission);
				writeJson(res, 200, { submission });
				opts.onSubmitted?.();
			},
		},
	];
}

function requireRunId(
	res: Parameters<Route["handler"]>[1],
	runId: string | undefined,
): string | null {
	if (runId) return runId;
	writeJson(res, 400, { error: "Missing runId" });
	return null;
}

function requireRunAndCommentId(
	res: Parameters<Route["handler"]>[1],
	runId: string | undefined,
	commentId: string | undefined,
): { runId: string; commentId: string } | null {
	const resolvedRunId = requireRunId(res, runId);
	if (!resolvedRunId) return null;
	if (commentId) return { runId: resolvedRunId, commentId };
	writeJson(res, 400, { error: "Missing commentId" });
	return null;
}

async function parseBody<T>(
	req: Parameters<Route["handler"]>[0],
	res: Parameters<Route["handler"]>[1],
	schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
	errorMessage: string,
): Promise<T | null> {
	let raw: unknown;
	try {
		raw = await readJsonBody(req);
	} catch (err) {
		writeJson(res, 400, { error: err instanceof Error ? err.message : "Invalid JSON body" });
		return null;
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		writeJson(res, 400, { error: errorMessage });
		return null;
	}
	return parsed.data;
}

function runExists(db: StageDb, runId: string): boolean {
	const rows = db
		.select({ id: chapterRun.id })
		.from(chapterRun)
		.where(eq(chapterRun.id, runId))
		.limit(1)
		.all();
	return rows.length > 0;
}

function targetBelongsToRun(db: StageDb, runId: string, chapterId: string | undefined): boolean {
	if (!chapterId) return true;
	const rows = db
		.select({ id: chapter.id })
		.from(chapter)
		.where(and(eq(chapter.id, chapterId), eq(chapter.runId, runId)))
		.limit(1)
		.all();
	return rows.length > 0;
}

function findComment(
	db: StageDb,
	runId: string,
	commentId: string,
): FeedbackCommentRow | undefined {
	const [row] = db
		.select()
		.from(feedbackComment)
		.where(and(eq(feedbackComment.id, commentId), eq(feedbackComment.runId, runId)))
		.limit(1)
		.all();
	return row;
}

function submitDraftFeedback(db: StageDb, runId: string): FeedbackSubmission | null {
	const submittedAt = new Date().toISOString();
	const submissionId = randomUUID();

	return db.transaction((tx) => {
		const drafts = tx
			.select({ id: feedbackComment.id })
			.from(feedbackComment)
			.where(
				and(
					eq(feedbackComment.runId, runId),
					eq(feedbackComment.status, FEEDBACK_COMMENT_STATUS.DRAFT),
				),
			)
			.orderBy(asc(feedbackComment.createdAt))
			.all();
		if (drafts.length === 0) return null;

		const draftIds = drafts.map((row) => row.id);
		const rows = tx
			.update(feedbackComment)
			.set({
				status: FEEDBACK_COMMENT_STATUS.SUBMITTED,
				submittedAt,
				submissionId,
			})
			.where(inArray(feedbackComment.id, draftIds))
			.returning()
			.all();
		const byId = new Map(rows.map((row) => [row.id, row]));
		const comments = draftIds.map((id) => {
			const row = byId.get(id);
			if (!row) throw new Error(`Missing submitted feedback row ${id}`);
			return mapFeedbackComment(row);
		});
		return { id: submissionId, runId, submittedAt, comments };
	});
}

function mapFeedbackComment(row: FeedbackCommentRow): FeedbackComment {
	return {
		id: row.id,
		runId: row.runId,
		target: row.target,
		body: row.body,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		submittedAt: row.submittedAt,
		submissionId: row.submissionId,
	};
}
