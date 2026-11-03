# Working demo and experiments

The working Studio voice demo is preserved in `sarathchandra02/voice` on `main` at `c3a9cb4e4bcc5ee9071073e20ea1ba9d62fb18b1`, also tagged `demo-working-2026-11-03`. That snapshot includes the voice controls and transparent image/text delivery history, before the figure-search changes.

Develop experiments on `experiment/figure-search` or a new branch. Do not merge experimental changes into `main` until explicitly requested. The existing private ChatGPT Site is the experimental deployment target; its source repository is separate from GitHub and has its own publication branch. Updating that Sites branch does not change GitHub's `main`.

## First experiment: exact references and automatic figure retrieval

- Search preserves single digits and dotted numbers, aliases `Fig.` to `Figure`, supports result pagination and physical page ranges, and supplies excerpts surrounding the identifier.
- `find_figure` scans extracted text directly, independently of background index progress. It checks up to 250 pages or eight seconds of work between pages per invocation, reports coverage, and resumes from the next unchecked page when called with the same identifier and range. Progress is retained for up to eight searches per loaded document and survives voice questions, but not document replacement or browser reload.
- Likely caption lines are ranked above passing references; up to five candidate pages are returned. This is a heuristic, not visual confirmation. The voice assistant is instructed to inspect candidate page images before describing figures.
- Text reads expose `nextTextOffset`, allowing the assistant to continue beyond the first 2,500 characters. Scanning happens locally; only candidate excerpts and explicitly requested images are sent to OpenAI.
- Progress appears in the existing document-activity history. Voice interruption cancels the pending scan, and completed pages remain available for a subsequent resume.

This experiment does not infer chapter boundaries or perform OCR. Empty, failed, or truncated text extraction is reported as a coverage gap. A contents entry can still resemble a caption and requires image verification. The original eight-call/three-image question limits remain; one scan call covers many pages. Pages with extremely slow extraction can exceed the between-page time budget.

## Rollback

The pre-experiment Sites source commit is `d2581b8e12cad18a38699a3880ac7784efc719e1`; its successful saved version is `appgprj_6ae9c6678ef8819197fdc0a56f08942d~appgver_4324026957048191bb802ecaf37f10c1`.

To restore the hosted demo, redeploy that existing saved version using Sites, preserving its audience. Alternatively, restore the tagged GitHub source into the Sites checkout while retaining `.openai/hosting.json`, then build, commit, push to Sites, and publish. Rollback does not require rewriting GitHub history or merging the experimental branch into main.

## Voice-model picker experiment

`experiment/voice-model-picker` builds on the figure-search experiment, adding separate provider keys and OpenAI/Gemini model choices. The new GPT-Live and Gemini adapters are explicitly experimental; see [model details and validation limits](voice-models.md). GitHub main and the working-demo tag remain unchanged.

## Office documents

`experiment/office-documents` builds on `experiment/voice-model-picker` (`7617934`). It adds local PPT, PPTX and DOCX reading. The previous deployed Sites source is `bfc6c56efa0728f45b9d0a5e809d8b42820f209b`; its saved version is `appgprj_6ae9c6678ef8819197fdc0a56f08942d~appgver_a04bf502a79481919932b370b9ba7286`. GitHub main and the model-picker branch are preserved. See [format behavior and limits](office-documents.md).
