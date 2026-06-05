import {
	type CreateFeedbackCommentBody,
	type FeedbackComment,
	FeedbackCommentResponseSchema,
	FeedbackCommentsResponseSchema,
	type FeedbackSubmission,
	FeedbackSubmissionResponseSchema,
	type UpdateFeedbackCommentBody,
} from "@stagereview/types/feedback";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { jsonFetch } from "./use-view-state";

const FEEDBACK_ROOT = "feedback";

export function feedbackQueryKey(runId: string): readonly unknown[] {
	return [FEEDBACK_ROOT, runId];
}

async function fetchFeedback(runId: string): Promise<FeedbackComment[]> {
	const raw = await jsonFetch<unknown>(`/api/runs/${encodeURIComponent(runId)}/feedback`);
	return FeedbackCommentsResponseSchema.parse(raw).comments;
}

function feedbackPath(runId: string, suffix = ""): string {
	return `/api/runs/${encodeURIComponent(runId)}/feedback${suffix}`;
}

function jsonRequest(method: "POST" | "PATCH", body?: unknown): RequestInit {
	return {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	};
}

async function createFeedback(
	runId: string,
	body: CreateFeedbackCommentBody,
): Promise<FeedbackComment> {
	const raw = await jsonFetch<unknown>(feedbackPath(runId), jsonRequest("POST", body));
	return FeedbackCommentResponseSchema.parse(raw).comment;
}

async function updateFeedback(
	runId: string,
	commentId: string,
	body: UpdateFeedbackCommentBody,
): Promise<FeedbackComment> {
	const raw = await jsonFetch<unknown>(
		feedbackPath(runId, `/${encodeURIComponent(commentId)}`),
		jsonRequest("PATCH", body),
	);
	return FeedbackCommentResponseSchema.parse(raw).comment;
}

async function deleteFeedback(runId: string, commentId: string): Promise<void> {
	await jsonFetch<unknown>(feedbackPath(runId, `/${encodeURIComponent(commentId)}`), {
		method: "DELETE",
	});
}

async function submitFeedback(runId: string): Promise<FeedbackSubmission> {
	const raw = await jsonFetch<unknown>(feedbackPath(runId, "/submit"), { method: "POST" });
	return FeedbackSubmissionResponseSchema.parse(raw).submission;
}

export interface UseFeedbackResult {
	comments: FeedbackComment[];
	draftComments: FeedbackComment[];
	submittedComments: FeedbackComment[];
	draftCount: number;
	isLoading: boolean;
	error: unknown;
	createComment: (body: CreateFeedbackCommentBody) => Promise<FeedbackComment>;
	updateComment: (commentId: string, body: UpdateFeedbackCommentBody) => Promise<FeedbackComment>;
	deleteComment: (commentId: string) => Promise<void>;
	submitFeedback: () => Promise<FeedbackSubmission>;
	isCreating: boolean;
	isUpdating: boolean;
	isDeleting: boolean;
	isSubmitting: boolean;
}

export function useFeedback(runId: string): UseFeedbackResult {
	const queryClient = useQueryClient();
	const queryKey = useMemo(() => feedbackQueryKey(runId), [runId]);
	const { data, isLoading, error } = useQuery<FeedbackComment[]>({
		queryKey,
		queryFn: () => fetchFeedback(runId),
		enabled: runId !== "",
	});

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey });
	};

	const createMutation = useMutation({
		mutationFn: (body: CreateFeedbackCommentBody) => createFeedback(runId, body),
		onSettled: invalidate,
	});
	const updateMutation = useMutation({
		mutationFn: ({ commentId, body }: { commentId: string; body: UpdateFeedbackCommentBody }) =>
			updateFeedback(runId, commentId, body),
		onSettled: invalidate,
	});
	const deleteMutation = useMutation({
		mutationFn: (commentId: string) => deleteFeedback(runId, commentId),
		onSettled: invalidate,
	});
	const submitMutation = useMutation({
		mutationFn: () => submitFeedback(runId),
		onSettled: invalidate,
	});

	const comments = data ?? [];
	const draftComments = useMemo(
		() => comments.filter((comment) => comment.status === "draft"),
		[comments],
	);
	const submittedComments = useMemo(
		() => comments.filter((comment) => comment.status === "submitted"),
		[comments],
	);

	return {
		comments,
		draftComments,
		submittedComments,
		draftCount: draftComments.length,
		isLoading,
		error,
		createComment: createMutation.mutateAsync,
		updateComment: (commentId, body) => updateMutation.mutateAsync({ commentId, body }),
		deleteComment: deleteMutation.mutateAsync,
		submitFeedback: submitMutation.mutateAsync,
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isSubmitting: submitMutation.isPending,
	};
}

export function countFeedbackByPath(comments: readonly FeedbackComment[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const comment of comments) {
		const count = counts.get(comment.target.filePath) ?? 0;
		counts.set(comment.target.filePath, count + 1);
	}
	return counts;
}

export function groupFeedbackByPath(
	comments: readonly FeedbackComment[],
): Map<string, FeedbackComment[]> {
	const grouped = new Map<string, FeedbackComment[]>();
	for (const comment of comments) {
		const list = grouped.get(comment.target.filePath);
		if (list) list.push(comment);
		else grouped.set(comment.target.filePath, [comment]);
	}
	return grouped;
}
