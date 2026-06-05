import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FeedbackSubmission } from "@stagereview/types/feedback";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFeedbackSink } from "../feedback-sink.js";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stage-cli-feedback-sink-"));
});

afterEach(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("feedback sink", () => {
	it("prints submitted feedback and appends it to the run JSONL file", async () => {
		const writes: string[] = [];
		const sink = createFeedbackSink("/repo/root", "run-1", {
			repoDataDir: tmpDir,
			output: { write: (chunk) => writes.push(chunk) },
		});
		const submission: FeedbackSubmission = {
			id: "submission-1",
			runId: "run-1",
			submittedAt: "2026-06-05T10:00:00.000Z",
			comments: [
				{
					id: "comment-1",
					runId: "run-1",
					target: { type: "file", filePath: "src/foo.ts" },
					body: "Please rename this.",
					status: "submitted",
					createdAt: "2026-06-05T09:59:00.000Z",
					updatedAt: "2026-06-05T10:00:00.000Z",
					submittedAt: "2026-06-05T10:00:00.000Z",
					submissionId: "submission-1",
				},
			],
		};

		await sink.deliver(submission);

		const payload = JSON.stringify(submission);
		expect(writes).toEqual([`STAGE_FEEDBACK_SUBMITTED ${payload}\n`]);
		await expect(fs.readFile(sink.feedbackFilePath, "utf8")).resolves.toBe(`${payload}\n`);
	});
});
