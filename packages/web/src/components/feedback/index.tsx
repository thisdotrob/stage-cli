import type {
	CreateFeedbackCommentBody,
	FeedbackComment,
	FeedbackCommentTarget,
} from "@stagereview/types/feedback";
import { Loader2, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type FeedbackComposerState =
	| {
			mode: "create";
			target: CreateFeedbackCommentBody["target"];
	  }
	| {
			mode: "edit";
			comment: FeedbackComment;
	  };

interface FeedbackComposerDialogProps {
	state: FeedbackComposerState | null;
	isSaving: boolean;
	onSubmit: (body: string) => Promise<void>;
	onClose: () => void;
}

export function FeedbackComposerDialog({
	state,
	isSaving,
	onSubmit,
	onClose,
}: FeedbackComposerDialogProps) {
	const [body, setBody] = useState("");
	const textareaId = useId();
	const open = state !== null;
	const target = state?.mode === "create" ? state.target : state?.comment.target;
	const trimmed = body.trim();

	useEffect(() => {
		if (!state) {
			setBody("");
			return;
		}
		setBody(state.mode === "edit" ? state.comment.body : "");
	}, [state]);

	const handleSubmit = async () => {
		if (!trimmed || isSaving) return;
		await onSubmit(trimmed);
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
			<DialogContent className="gap-4 sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{state?.mode === "edit" ? "Edit feedback" : "Add feedback"}</DialogTitle>
					<DialogDescription>
						{target ? formatFeedbackTarget(target) : "Feedback"}
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-2">
					<label htmlFor={textareaId} className="font-medium text-sm">
						Comment
					</label>
					<textarea
						id={textareaId}
						value={body}
						onChange={(event) => setBody(event.target.value)}
						className="min-h-32 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						placeholder="Describe what should change."
						disabled={isSaving}
					/>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button type="button" onClick={handleSubmit} disabled={!trimmed || isSaving}>
						{isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
						{state?.mode === "edit" ? "Save" : "Add"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface FeedbackCommentListProps {
	comments: FeedbackComment[];
	onEdit: (comment: FeedbackComment) => void;
	onDelete: (comment: FeedbackComment) => void;
	className?: string;
	compact?: boolean;
}

export function FeedbackCommentList({
	comments,
	onEdit,
	onDelete,
	className,
	compact = false,
}: FeedbackCommentListProps) {
	if (comments.length === 0) return null;
	return (
		<div className={cn("space-y-2", className)}>
			{comments.map((comment) => (
				<FeedbackCommentCard
					key={comment.id}
					comment={comment}
					onEdit={onEdit}
					onDelete={onDelete}
					compact={compact}
				/>
			))}
		</div>
	);
}

interface FeedbackCommentCardProps {
	comment: FeedbackComment;
	onEdit: (comment: FeedbackComment) => void;
	onDelete: (comment: FeedbackComment) => void;
	compact?: boolean;
}

export function FeedbackCommentCard({
	comment,
	onEdit,
	onDelete,
	compact = false,
}: FeedbackCommentCardProps) {
	const isDraft = comment.status === "draft";
	return (
		<div
			className={cn(
				"rounded-lg border border-border bg-background text-foreground shadow-sm",
				compact ? "px-3 py-2" : "p-3",
			)}
		>
			<div className="mb-2 flex items-center gap-2">
				<MessageSquare className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
					{formatFeedbackTarget(comment.target)}
				</span>
				<span
					className={cn(
						"rounded-md px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide",
						isDraft
							? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
							: "bg-green-500/10 text-green-700 dark:text-green-400",
					)}
				>
					{isDraft ? "Draft" : "Submitted"}
				</span>
				{isDraft && (
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => onEdit(comment)}
									className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									aria-label="Edit feedback"
								>
									<Pencil className="size-3.5" aria-hidden="true" />
								</button>
							</TooltipTrigger>
							<TooltipContent>Edit feedback</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => onDelete(comment)}
									className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
									aria-label="Delete feedback"
								>
									<Trash2 className="size-3.5" aria-hidden="true" />
								</button>
							</TooltipTrigger>
							<TooltipContent>Delete feedback</TooltipContent>
						</Tooltip>
					</div>
				)}
			</div>
			<p className="whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
		</div>
	);
}

export function formatFeedbackTarget(target: FeedbackCommentTarget): string {
	if (target.type === "file") return target.filePath;
	const endSide = target.range.endSide ?? target.range.side;
	const sideLabel =
		target.range.side === endSide ? target.range.side : `${target.range.side} to ${endSide}`;
	const lineLabel =
		target.range.startLine === target.range.endLine
			? `L${target.range.startLine}`
			: `L${target.range.startLine}-L${target.range.endLine}`;
	return `${target.filePath}:${lineLabel} (${sideLabel})`;
}
