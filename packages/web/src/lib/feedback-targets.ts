import type { SelectedLineRange } from "@pierre/diffs";
import { DIFF_SIDE } from "@stagereview/types/chapters";
import type {
	FeedbackComment,
	FeedbackCommentTarget,
	FeedbackLineRange,
} from "@stagereview/types/feedback";

export function fileFeedbackTarget(filePath: string, chapterId?: string): FeedbackCommentTarget {
	return chapterId ? { type: "file", filePath, chapterId } : { type: "file", filePath };
}

export function lineFeedbackTarget(
	filePath: string,
	lineRange: SelectedLineRange,
	chapterId?: string,
): FeedbackCommentTarget {
	const normalizedRange = normalizeFeedbackLineRange(lineRange);
	const side = normalizedRange.side ?? DIFF_SIDE.ADDITIONS;
	const endSide = normalizedRange.endSide ?? side;
	const range: FeedbackLineRange =
		endSide === side
			? {
					side,
					startLine: normalizedRange.start,
					endLine: normalizedRange.end,
				}
			: {
					side,
					startLine: normalizedRange.start,
					endLine: normalizedRange.end,
					endSide,
				};
	return chapterId
		? { type: "line", filePath, chapterId, range }
		: { type: "line", filePath, range };
}

export function feedbackLineRangeForGutterClick(
	clickedRange: SelectedLineRange,
	selectedRange: SelectedLineRange | null,
): SelectedLineRange {
	const normalizedClickedRange = normalizeFeedbackLineRange(clickedRange);
	if (!selectedRange || !isSingleLineRange(normalizedClickedRange)) return normalizedClickedRange;

	const normalizedSelectedRange = normalizeFeedbackLineRange(selectedRange);
	return isMultiLineRange(normalizedSelectedRange) &&
		lineRangeContainsRange(normalizedSelectedRange, normalizedClickedRange)
		? normalizedSelectedRange
		: normalizedClickedRange;
}

export function filterFeedbackForChapter(
	comments: readonly FeedbackComment[],
	chapterId: string,
): FeedbackComment[] {
	return comments.filter((comment) => comment.target.chapterId === chapterId);
}

function normalizeFeedbackLineRange(lineRange: SelectedLineRange): SelectedLineRange {
	const side = lineRange.side ?? DIFF_SIDE.ADDITIONS;
	const endSide = lineRange.endSide ?? side;
	if (side !== endSide || lineRange.start <= lineRange.end) return lineRange;
	return { start: lineRange.end, end: lineRange.start, side };
}

function isSingleLineRange(lineRange: SelectedLineRange): boolean {
	return (
		lineRange.start === lineRange.end &&
		(lineRange.endSide ?? lineRange.side ?? DIFF_SIDE.ADDITIONS) ===
			(lineRange.side ?? DIFF_SIDE.ADDITIONS)
	);
}

function isMultiLineRange(lineRange: SelectedLineRange): boolean {
	return !isSingleLineRange(lineRange);
}

function lineRangeContainsRange(
	outerRange: SelectedLineRange,
	innerRange: SelectedLineRange,
): boolean {
	const outerSide = outerRange.side ?? DIFF_SIDE.ADDITIONS;
	const outerEndSide = outerRange.endSide ?? outerSide;
	const innerSide = innerRange.side ?? DIFF_SIDE.ADDITIONS;
	const innerEndSide = innerRange.endSide ?? innerSide;
	if (outerSide !== outerEndSide || innerSide !== innerEndSide || outerSide !== innerSide) {
		return false;
	}
	return outerRange.start <= innerRange.start && innerRange.end <= outerRange.end;
}
