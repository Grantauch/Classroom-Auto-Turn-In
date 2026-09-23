# GoClassroom Multi-Class Draft Grading — v0.9.22

## Teacher workflow split

GoClassroom now treats lesson-plan turn-in and student grading as separate jobs:

- **Lesson-plan Classroom:** one destination selected in Setup for scheduled weekly plan submission.
- **Grading Classrooms:** a separate saved list of up to 20 classes selected from the Draft grading page.

Adding, switching, or removing a grading Classroom never modifies the lesson-plan Classroom, topic, Drive folder, Safety Check certificate, or Windows schedule. Removing a grading Classroom removes only the local shortcut; it does not change Google Classroom.

## Selection and authorization boundary

The renderer cannot supply an arbitrary Classroom URL. A grading class must first be chosen through the signed-in Classroom picker and saved as a canonical course ID. Assignment discovery accepts only a saved grading course. Every discovered assignment carries that course ID, and every later extraction and write phase rechecks the same course/assignment scope.

### Student-work navigation contract

The teacher queue is read from Classroom's current `and-sort-name/done/all` route. Each student is then opened through Classroom's teacher-side `/g/tg/{course}/{assignment}?authuser=0#u={student}` view. The student ID in the fragment is parsed and checked against the selected class and assignment before evidence is read. Because changing `#u=` can be a hash-only browser transition, GoClassroom reloads the student view before extraction and again before any draft write; a mismatch stops that student safely.

A write-enabled batch still requires all of the existing safeguards:

1. local grading enabled;
2. separate persistent Classroom draft-write opt-in;
3. native Cancel-by-default confirmation naming the grading Classroom and assignment;
4. five-minute, in-memory, one-use course/assignment authorization;
5. complete supported evidence;
6. one verified Classroom point total matching the explicit rubric total;
7. a validated `SAFE_DRAFT` result;
8. no existing draft or final grade;
9. grade-field identity and denominator recheck immediately before writing;
10. reload and numeric readback verification.

There is no automated Return/publish action.

## Private grading review copies

Review copies are **off by default**. To enable them, the teacher must:

1. choose a local folder, which may be inside a Google Drive for desktop sync location;
2. turn on **Save a private review copy**;
3. accept a native warning that student work and grading data will intentionally be saved;
4. save grading settings.

Each completed run creates a new, non-overwriting folder containing:

- `assignment-review.json`, an index and run summary;
- one numbered JSON record per processed student;
- `README - PRIVATE STUDENT DATA.txt`;
- `EXPORT-COMPLETE.txt`, written last so an audit can distinguish a complete export from an interrupted one.

Each student record contains only the evidence actually used by the grader, evidence-completeness status, limited attachment descriptors, normalized validated grading result, `SAFE_DRAFT` or `TEACHER_REVIEW`, independent arithmetic validation, and draft-write verification status. Raw unvalidated model output, Google authentication data, cookies, and browser-profile contents are not exported.

GoClassroom does not upload these files itself, change Drive sharing, create public links, or choose a retention period. The teacher/school remains responsible for folder access and retention policy.

## Compatibility identity

“GoClassroom” is a working pre-1.0 display name. v0.9.22 deliberately retains:

- Windows app ID `org.classroomautoturnin.app`;
- product/install identity `Classroom Auto Turn-In`;
- existing per-user data location;
- existing browser profile;
- existing scheduled-task names.

This avoids a side-by-side installation or loss of saved teacher setup while the final product name is being evaluated.
