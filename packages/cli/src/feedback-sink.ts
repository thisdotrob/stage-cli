import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { FeedbackSubmission } from "@stagereview/types/feedback";
import { getRepoDataDir } from "./db/path.js";

export interface FeedbackSink {
	feedbackFilePath: string;
	deliver: (submission: FeedbackSubmission) => Promise<void>;
}

interface WritableOutput {
	write: (chunk: string) => unknown;
}

interface FeedbackSinkOptions {
	output?: WritableOutput;
	repoDataDir?: string;
}

export function createFeedbackSink(
	repoRoot: string,
	runId: string,
	opts: FeedbackSinkOptions = {},
): FeedbackSink {
	const feedbackDir = path.join(opts.repoDataDir ?? getRepoDataDir(repoRoot), "feedback");
	mkdirSync(feedbackDir, { recursive: true });
	const feedbackFilePath = path.join(feedbackDir, `${runId}.jsonl`);
	const output = opts.output ?? process.stdout;

	return {
		feedbackFilePath,
		deliver: async (submission) => {
			const payload = JSON.stringify(submission);
			output.write(`STAGE_FEEDBACK_SUBMITTED ${payload}\n`);
			await fs.appendFile(feedbackFilePath, `${payload}\n`, "utf8");
		},
	};
}
