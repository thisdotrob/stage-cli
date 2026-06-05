import { describe, expect, it } from "vitest";
import { feedbackLineRangeForGutterClick, lineFeedbackTarget } from "../feedback-targets";

describe("lineFeedbackTarget", () => {
	it("normalizes same-side selections dragged upward", () => {
		expect(
			lineFeedbackTarget("src/foo.ts", {
				side: "additions",
				start: 12,
				end: 10,
			}),
		).toEqual({
			type: "line",
			filePath: "src/foo.ts",
			range: { side: "additions", startLine: 10, endLine: 12 },
		});
	});
});

describe("feedbackLineRangeForGutterClick", () => {
	it("uses the active multi-line selection when the clicked line is inside it", () => {
		expect(
			feedbackLineRangeForGutterClick(
				{ side: "additions", start: 11, end: 11 },
				{ side: "additions", start: 10, end: 12 },
			),
		).toEqual({ side: "additions", start: 10, end: 12 });
	});

	it("uses the clicked line when there is no containing selection", () => {
		expect(
			feedbackLineRangeForGutterClick(
				{ side: "additions", start: 14, end: 14 },
				{ side: "additions", start: 10, end: 12 },
			),
		).toEqual({ side: "additions", start: 14, end: 14 });
	});

	it("preserves a multi-line gutter drag over an older selection", () => {
		expect(
			feedbackLineRangeForGutterClick(
				{ side: "additions", start: 20, end: 22 },
				{ side: "additions", start: 10, end: 12 },
			),
		).toEqual({ side: "additions", start: 20, end: 22 });
	});
});
