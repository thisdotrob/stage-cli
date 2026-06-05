import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
	FeedbackCommentResponseSchema,
	FeedbackCommentsResponseSchema,
	type FeedbackSubmission,
	FeedbackSubmissionResponseSchema,
} from "@stagereview/types/feedback";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db/client.js";
import { chapter, feedbackComment } from "../db/schema/index.js";
import { feedbackRoutes } from "../routes/feedback.js";
import { insertChaptersFile } from "../runs/import-chapters.js";
import { LOOPBACK_HOST, type ServerHandle, startServer } from "../server.js";
import { makeFixture, makeRepoContext } from "./fixtures.js";

let tmpDir: string;
let dbPath: string;
let webDist: string;
const handles: ServerHandle[] = [];

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stage-cli-feedback-"));
	dbPath = path.join(tmpDir, "db.sqlite");
	webDist = path.join(tmpDir, "web-dist");
	await fs.mkdir(webDist);
	await fs.writeFile(path.join(webDist, "index.html"), "<html></html>");
	closeDb();
});

afterEach(async () => {
	while (handles.length > 0) {
		const h = handles.pop();
		if (h) await h.close();
	}
	closeDb();
	await fs.rm(tmpDir, { recursive: true, force: true });
});

async function startWithRoutes(deliveries: FeedbackSubmission[] = []): Promise<ServerHandle> {
	const db = getDb({ dbPath });
	const handle = await startServer({
		webDistPath: webDist,
		routes: [
			...feedbackRoutes(db, {
				deliverSubmission: async (submission) => {
					deliveries.push(submission);
				},
			}),
		],
	});
	handles.push(handle);
	return handle;
}

interface JsonResponse {
	status: number;
	body: unknown;
}

function request(
	port: number,
	method: string,
	requestPath: string,
	body?: unknown,
): Promise<JsonResponse> {
	const payload = body === undefined ? "" : JSON.stringify(body);
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				hostname: LOOPBACK_HOST,
				port,
				method,
				path: requestPath,
				agent: false,
				headers:
					payload.length > 0
						? {
								"Content-Type": "application/json",
								"Content-Length": Buffer.byteLength(payload).toString(),
							}
						: undefined,
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (c: Buffer) => chunks.push(c));
				res.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : null });
				});
			},
		);
		req.on("error", reject);
		if (payload) req.write(payload);
		req.end();
	});
}

function seedRun(): { runId: string; chapterId: string } {
	const db = getDb({ dbPath });
	const result = insertChaptersFile(db, makeFixture(), makeRepoContext());
	const [chapterRow] = db
		.select()
		.from(chapter)
		.where(eq(chapter.runId, result.runId))
		.limit(1)
		.all();
	if (!chapterRow) throw new Error("seed: missing chapter");
	return { runId: chapterRow.runId, chapterId: chapterRow.id };
}

describe("feedback API", () => {
	it("creates draft file and line feedback comments and returns them oldest-first", async () => {
		const { runId, chapterId } = seedRun();
		const { port } = await startWithRoutes();

		const file = await request(port, "POST", `/api/runs/${runId}/feedback`, {
			target: { type: "file", filePath: "src/foo.ts", chapterId },
			body: "This file needs a clearer name.",
		});
		expect(file.status).toBe(201);

		const line = await request(port, "POST", `/api/runs/${runId}/feedback`, {
			target: {
				type: "line",
				filePath: "src/foo.ts",
				chapterId,
				range: { side: "additions", startLine: 2, endLine: 3 },
			},
			body: "Please simplify this branch.",
		});
		expect(line.status).toBe(201);

		const res = await request(port, "GET", `/api/runs/${runId}/feedback`);
		expect(res.status).toBe(200);
		const body = FeedbackCommentsResponseSchema.parse(res.body);
		expect(body.comments.map((comment) => comment.body)).toEqual([
			"This file needs a clearer name.",
			"Please simplify this branch.",
		]);
		expect(body.comments.map((comment) => comment.status)).toEqual(["draft", "draft"]);
		expect(body.comments.map((comment) => comment.target.type)).toEqual(["file", "line"]);
	});

	it("edits and deletes only draft feedback", async () => {
		const { runId, chapterId } = seedRun();
		const { port } = await startWithRoutes();

		const created = await request(port, "POST", `/api/runs/${runId}/feedback`, {
			target: { type: "file", filePath: "src/foo.ts", chapterId },
			body: "Initial note.",
		});
		const createdBody = FeedbackCommentResponseSchema.parse(created.body);
		const commentId = createdBody.comment.id;

		const edited = await request(port, "PATCH", `/api/runs/${runId}/feedback/${commentId}`, {
			body: "Edited note.",
		});
		expect(edited.status).toBe(200);
		expect(FeedbackCommentResponseSchema.parse(edited.body).comment.body).toBe("Edited note.");

		const deleted = await request(port, "DELETE", `/api/runs/${runId}/feedback/${commentId}`);
		expect(deleted.status).toBe(200);

		const res = await request(port, "GET", `/api/runs/${runId}/feedback`);
		expect(FeedbackCommentsResponseSchema.parse(res.body).comments).toHaveLength(0);
	});

	it("submits all drafts as one delivered immutable batch", async () => {
		const { runId, chapterId } = seedRun();
		const deliveries: FeedbackSubmission[] = [];
		const { port } = await startWithRoutes(deliveries);

		await request(port, "POST", `/api/runs/${runId}/feedback`, {
			target: { type: "file", filePath: "src/foo.ts", chapterId },
			body: "First note.",
		});
		const second = await request(port, "POST", `/api/runs/${runId}/feedback`, {
			target: { type: "file", filePath: "src/bar.ts" },
			body: "Second note.",
		});
		const secondId = FeedbackCommentResponseSchema.parse(second.body).comment.id;

		const submitted = await request(port, "POST", `/api/runs/${runId}/feedback/submit`);
		expect(submitted.status).toBe(200);
		const submission = FeedbackSubmissionResponseSchema.parse(submitted.body).submission;
		expect(submission.comments.map((comment) => comment.body)).toEqual([
			"First note.",
			"Second note.",
		]);
		expect(submission.comments.every((comment) => comment.status === "submitted")).toBe(true);
		expect(deliveries).toEqual([submission]);

		const db = getDb({ dbPath });
		const rows = db.select().from(feedbackComment).where(eq(feedbackComment.runId, runId)).all();
		expect(rows.map((row) => row.submissionId)).toEqual([submission.id, submission.id]);

		const edit = await request(port, "PATCH", `/api/runs/${runId}/feedback/${secondId}`, {
			body: "Should not edit.",
		});
		expect(edit.status).toBe(409);

		const del = await request(port, "DELETE", `/api/runs/${runId}/feedback/${secondId}`);
		expect(del.status).toBe(409);

		const emptySubmit = await request(port, "POST", `/api/runs/${runId}/feedback/submit`);
		expect(emptySubmit.status).toBe(400);
	});

	it("rejects comments targeting a chapter from another run", async () => {
		const first = seedRun();
		const second = seedRun();
		const { port } = await startWithRoutes();

		const res = await request(port, "POST", `/api/runs/${first.runId}/feedback`, {
			target: { type: "file", filePath: "src/foo.ts", chapterId: second.chapterId },
			body: "Wrong run.",
		});

		expect(res.status).toBe(400);
	});
});
