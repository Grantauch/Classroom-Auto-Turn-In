# Classroom Draft Grading — v0.9.20

## Purpose and hard boundary

The Classroom Draft Grading Bridge is teacher decision support. It may recommend and, after separate opt-in and per-batch confirmation, save a validated **draft** numeric score. It does not return student work, publish a grade, or make the teacher's final grading decision.

> AI may recommend and write draft grades only. CATI must never return or publish grades automatically. The teacher remains the final grader.

This boundary is enforced in code as well as stated in the grading prompt. The write process identifies one total-grade input, fills it, presses Enter, reloads the submission, and verifies the hidden draft value. The writer contains no button-click path and no Return/publish implementation.

## End-to-end flow

1. CATI opens the teacher's configured Classroom course and discovers assignment links from that course only.
2. The teacher selects one assignment, pastes a rubric with one explicit positive total, chooses a bounded batch size of 1–10, and starts in preview mode by default.
3. CATI derives canonical Classroom URLs instead of trusting renderer-supplied URLs.
4. The extraction bridge waits for the assignment and submission pages to be visibly ready, reads directions, the Classroom point total, direct-response evidence, supported Google Docs text, student identity, and existing grade state.
5. Missing, unsupported, inaccessible, oversized, ambiguous, duplicate, or incomplete evidence stops at `TEACHER_REVIEW`.
6. CATI sends only the directions, teacher rubric, and supported student evidence needed for grading to the selected local Ollama model at `http://localhost:11434`.
7. CATI validates the model response independently: schema, rubric labels, evidence quotations, per-criterion arithmetic, total arithmetic, score bounds, and point-total agreement.
8. The renderer previews every result. No write occurs in preview mode.
9. If draft writing is separately enabled and the teacher requests a write-enabled batch, a native Cancel-by-default dialog names the assignment and batch size. Confirmation creates one short-lived, assignment-bound, single-use authorization.
10. Only `SAFE_DRAFT` rows with no existing grade reach the writer. The writer rechecks the student, score, Classroom denominator, and blank grade field; enters the number; reloads; and verifies the exact stored value.

## Required gates before a draft write

A score can reach Classroom only when all of these are true:

1. Local grading is enabled and Ollama is available on loopback.
2. The selected model is available and returns one valid structured response before timeout.
3. The assignment belongs to the Classroom course saved in CATI Setup.
4. The teacher separately enabled Classroom draft writing.
5. The teacher requested a write-enabled batch and confirmed the native per-run dialog.
6. The resulting authorization is unexpired, unused, and bound to that course and assignment.
7. The batch is the only grading batch currently running.
8. The selected rubric has one explicit positive total and no duplicate criterion labels.
9. Classroom exposes one explicit positive assignment total matching the rubric total.
10. The student submission is unique and completely supported by the extractor.
11. Deterministic prompt-injection checks did not find direct instructions aimed at the grader/model.
12. The Ollama result passes CATI's schema, grounding, arithmetic, and bounds checks and is classified `SAFE_DRAFT`.
13. No draft or final grade is already present.
14. The writer identifies one intended total-grade field whose visible denominator matches the expected maximum.
15. After entry, a reload still shows the same denominator and the exact expected numeric draft value.

Any failed gate prevents that score from being written. A batch may still preview safe rows while unsafe rows remain `TEACHER_REVIEW`; write failure for one row is reported and does not cause CATI to publish anything.

## Evidence support

Automatically readable in this release:

- clearly identified direct answer/response fields;
- Google Docs attachments exported as bounded plain text from `docs.google.com`.

Not automatically readable:

- Sheets;
- Slides;
- PDFs;
- images or handwriting;
- arbitrary Drive files;
- evidence CATI cannot confidently distinguish from assignment materials, comments, or grade controls.

CATI deduplicates supported attachments, limits their count and size, rejects redirects or non-text Google Docs export responses, and rejects a combined submission that exceeds the evidence limit. It does not silently grade a truncated subset.

Attachment titles are not needed for grading and are not sent to Ollama. The rubric, directions, and supported student evidence remain in memory for the active request and are not intentionally written to CATI's data files or logs. Ollama error details are categorized so a server response cannot echo the prompt or student work into the CATI log.

## Model-output validation

The local model must return schema version 2 structured JSON with criterion-level scores and evidence. CATI requires:

- every model criterion label to match a teacher-rubric label;
- every quoted evidence excerpt to occur in the submitted evidence;
- unique criteria;
- finite scores within each criterion maximum;
- a positive, bounded maximum score;
- criterion sums to equal the returned total;
- the returned maximum to equal the rubric and Classroom totals;
- a valid `SAFE_DRAFT` or `TEACHER_REVIEW` classification.

Malformed JSON, missing fields, invented labels or evidence, bad arithmetic, unexpected classifications, timeouts, unavailable models, and unavailable Ollama all fail closed.

## Prompt injection

Student work is marked as untrusted evidence in the Ollama prompt. In addition, CATI performs a deterministic preflight for direct grader/model-control phrases such as instructions to ignore prior instructions or award a requested grade. A match stops locally at `TEACHER_REVIEW` before the work is sent to Ollama. This is intentionally conservative; the teacher can review a false positive manually.

## Batch and concurrency behavior

The default batch is five students and the maximum is ten. One grading batch may run at a time. Duplicate student IDs, mismatched assignment/course identities, untrusted writer results, a stale authorization, and an expired batch deadline all fail closed. A write result must correspond exactly to the requested student, score, maximum, and assignment before CATI reports it as verified.

## Teacher review

`TEACHER_REVIEW` is a normal safety outcome, not an error grade. It applies when CATI lacks complete readable work; sees unsupported, inaccessible, or suspicious evidence; cannot establish one rubric/Classroom point total; detects an existing grade; receives malformed or ungrounded model output; or cannot prove the exact write and reload state.

## Validation boundary

The source and automated Windows checks validate CATI's intended behavior against fixtures and simulators. They do not prove the current DOM in every district Classroom account or the pedagogical quality of a model's grading. Before routine use, complete the teacher checklist with a controlled test assignment and test accounts, then benchmark results against work already graded by the teacher.

