# StoryHub work in GoClassroom v0.9.33

Students use their Hall Pass PIN to save and turn in answers on the hubs. Their
work stays in the teacher's existing private Turn In sheet. GoClassroom reads
that sheet through the teacher's own signed-in Google browser and grades locally
with Ollama.

1. In **Draft grading**, find your teaching classes and select one assignment.
2. Choose **Student work → StoryHub turn ins**.
3. Paste your private Turn In workbook link and press **Read hub turn ins**.
4. Choose the hub and period that belong to the selected Classroom assignment.
5. Choose your installed local model and enable local draft grading. Add a rubric
   if desired. Classroom's assignment directions and point total remain authoritative.
6. Preview the batch. **Read hub answers** displays the exact submission used.
7. To save verified hidden draft scores, enable the separate draft-write setting,
   choose **Save drafts on this run**, and confirm the named class/assignment batch.
8. Review and return work yourself in Google Classroom.

The newest submission timestamp wins even if the sheet has been sorted. The
selected period and hub are explicit: titles and student names are never used
to guess identities. Missing, corrupt, oversized, or ambiguous work does not
produce an automatic score. Existing Classroom grades are never overwritten.
Hub work can be graded when the corresponding Classroom assignment still shows
Assigned or Missing; the student does not have to copy it into Classroom first.

The Google account in GoClassroom must have access to the private sheet and teach
the selected class. Keep the sheet private. No new Google API credentials or
student-data sharing permissions are needed. The sheet link is stored only in
the teacher's local settings, and review-copy persistence keeps its existing opt-in.

This release requires updating the Windows app. The Turn In durability fixes in
the desk repository also require updating its existing Apps Script deployment.
Repository and synthetic tests do not establish that those live updates have happened.
