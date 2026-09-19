# Classroom Draft Grading — v0.9.19

## Purpose

This bridge is decision support for the teacher. It creates and may save **draft** scores; it does not return student work or make the final grading decision.

## Safety gates

A score can reach Classroom only when all of these are true:

1. Local grading is enabled.
2. The teacher separately enabled Classroom draft writing.
3. The teacher selected a specific assignment and supplied a rubric.
4. The submission was extracted completely enough for grading.
5. Ollama returned `SAFE_DRAFT` rather than `TEACHER_REVIEW`.
6. CATI's independent validator accepted the schema and arithmetic.
7. The model/rubric `max_score` matches Classroom's visible assignment point total.
8. No draft/final grade is already present for that student.
9. The teacher checked the per-run write box and confirmed the batch.
10. After entry, CATI reloads the student page and verifies the expected draft number.

Any failed gate prevents that score from being written.

## Evidence support in v0.9.19

Automatically readable:

- clearly identified direct answer/response fields;
- Google Docs attachments exported as text.

Not yet automatically readable:

- Sheets;
- Slides;
- PDFs;
- images/handwriting;
- arbitrary Drive files;
- evidence CATI cannot confidently distinguish from assignment materials/comments/grade controls.

If unsupported evidence is present, CATI marks the submission for teacher review instead of grading an incomplete subset.

## Batch behavior

The default batch is 5 students and is bounded to 10. Preview mode is the default operational path: it grades and shows results without writing scores. A write-enabled batch writes only `SAFE_DRAFT` rows.

## No Return path

`engine/grading-classroom-write.js` uses the identified total-grade input only. It fills the score, presses Enter, reloads the page, and verifies the stored value. There is no writer click path for Return.

## Teacher review

`TEACHER_REVIEW` is expected for unreadable work, unsupported attachments, ambiguous/missing directions, score/rubric inconsistencies, an existing grade, or any other state CATI cannot validate safely.
