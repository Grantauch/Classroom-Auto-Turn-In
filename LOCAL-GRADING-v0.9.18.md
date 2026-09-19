# Local Grading — v0.9.18

v0.9.18 adds a manual, local-only draft-grading lab. It is intentionally separate from Classroom Auto Turn-In.

## Requirements

1. Install and start Ollama on the same Windows computer as CATI.
2. Make sure at least one grading-capable model is installed. The default is `qwen3.6:latest`.
3. Confirm Ollama responds locally. CATI accepts only loopback HTTP (`127.0.0.1`, `localhost`, or IPv6 loopback); it will not send grading content to a remote Ollama host.

## Use

1. Open **Local grading** in CATI.
2. Turn on the local grading lab and choose an installed Ollama model.
3. Paste the assignment/question, rubric, and student submission.
4. Choose **Create draft grade**.
5. Review the result:
   - `SAFE_DRAFT` means the model response parsed, passed CATI's independent arithmetic/consistency validation, and did not request teacher review.
   - `TEACHER_REVIEW` means CATI stopped because evidence was missing, the response was invalid/inconsistent, or the model identified a grading ambiguity.

## Safety boundary

- A `SAFE_DRAFT` is not a final grade and is not proof that the model's judgment matches the teacher's judgment.
- v0.9.18 does not fetch student submissions from Google Classroom.
- v0.9.18 does not write draft grades into Classroom and cannot return/publish final grades.
- Missing or inaccessible work is not converted into a zero merely because CATI cannot evaluate it.
- The grading service stores only the enable/model settings. It does not persist pasted student work or grading results.

Before using real student data, follow district privacy/data-handling requirements for the specific computer and local software environment.
