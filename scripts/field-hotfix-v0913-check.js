const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const submit=read('engine/submit-weekly.js');
const actions=read('engine/classroom-actions.js');
const main=read('main.js');
const ui=read('renderer/app.js');
const support=read('SUPPORT-CODES.md');

assert(/async function maybeClick\(/.test(actions),'classroom-actions.js no longer defines maybeClick');
assert(/module\.exports=\{[^}]*\bmaybeClick\b/.test(actions),'classroom-actions.js no longer exports maybeClick');
assert(/const \{[^\n}]*\bmaybeClick\b[^\n}]*\}=require\('\.\/classroom-actions'\);/.test(submit),'submit-weekly.js does not import maybeClick');
assert(submit.includes("await maybeClick(page.getByText('Classwork',{exact:true}),2200)"),'Classwork safe-navigation call changed unexpectedly');

const safeOutcome=main.slice(main.indexOf('function safeOutcomeForTeacher'),main.indexOf('let aiService=null'));
assert(safeOutcome.includes("publicError("),'safeOutcomeForTeacher must classify teacher-facing errors without side effects');
assert(!safeOutcome.includes("userSafeError('automation:run'"),'safeOutcomeForTeacher must not append logs during dashboard/status reads');
assert(ui.includes("Not scheduled — automatic turn-in off"),'Support summary still mislabels an intentionally unscheduled OFF state as a schedule failure');
assert(support.includes('`AT-RUN-101`')&&support.includes('`AT-RUN-102`'),'Generic run support codes are not documented');
console.log('v0.9.13 field-hotfix regression checks passed.');
