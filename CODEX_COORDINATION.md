# CODEX MASTER AUDIT PLAN — TIMBK.IO.VN

AUTHORITATIVE HANDOFF (USER ACCEPTED): Antigravity is implementation worker; Codex Desktop is auditor. This supersedes the old pause notice and consolidates all earlier accepted plans plus Master Plan V3. Prior worker reports are not whole-system sign-off.

1. ACADEMIC LEDGER UI REBUILD
Rebuild shared CSS/components: firm navy structure, blue actions, light blue-gray surfaces, 4–8px radii, restrained borders/shadows; Vietnamese-capable font; body 16/400, labels 500–600, headings 600, tabular money/scores. Remove font-black, fragmented weights, excess uppercase, emoji-as-UI, gradients, giant pills and conflicting overrides. Define shared tokens and states (focus, table, form, loading, empty, error/retry). Keep sky/light/dark persisted with no flash. Test Vietnamese glyphs, contrast, keyboard, 200% zoom, 390/768/desktop. Reference principles: Primer primitives, Atlassian typography, GOV.UK type scale.

2. ROLES AND BOOKS
Guest public courses/trial; student tasks/exams/progress; parent verified parent_student_links, child selector, attendance/schedule/feedback/fees; teacher today's shifts, attendance, teacher book, leave/substitute/salary; leader/admin approvals/finance/staffing. Sổ Phụ Huynh visible only to parent; Sổ Giáo Viên only to teacher (leader/admin manage). Server record-level RBAC, no demo credentials, public routes do not force login, every view has loading/empty/error/retry.

3. TEACHER/STAFF WORKFLOWS
Leave binds one owned session. Teacher A proposes B, B accepts, leader/admin approves; recheck ownership, qualification, overlap, session status and concurrency; update actual roster/work allocation with audit trail. Private teacher discussion and approval notices. Recruitment supports contractor/permanent application, private CV, availability, screening, interview confirm/reschedule/result and accept/reject; applicant gets no teacher privileges early.

4. PAYROLL/TUITION
Specify per-session/hour/class/fixed/mixed rates, co-teach/substitute allocation, effective rates and locked periods. Separate calculate/approve/disburse/adjust. Advances pending→approved→disbursed(reference)→deducted(period). Tuition handles monthly/session/course, absence/makeup, discounts, receipts, refunds/debt; QR is not payment proof. Atomic state+ledger, zero changes=no ledger, injected ledger failure=no drift, concurrency/idempotency, SQL write-time guards, server-calculated money/stars/refunds. Test real handlers for failures, duplicates, concurrent approval and cross-role access.

5. EXAMS
Source/revision/reviewed metadata; grade/curriculum/skill/type/difficulty separated; blueprints 5/15/30/45 and 40-question mode; shortage rejects (no mixing). Snapshot server-side, hide answers, enforce owner/deadline at write, empty policy, one completion, concurrent submit/create, passage groups, idempotent retry. V3 MCQ/listening/open-cloze/speaking must not falsely claim every skill in short tests.

6. SECOND BRAIN
Preserve 102 notes, 35 Drive sources, 308 media and provenance. Vault→parser→staging→validate→D1; stable IDs/hash/revision/idempotent import/safe deletion. Metadata pagination reaches all notes, lazy detail, Unicode FTS, backlinks/cross-links, XSS-safe rendering. Staff-private data never in client bundle/public ZIP; include provenance and human-review samples.

7. VOCAB/PRONUNCIATION V3
POS/topic/CEFR filters, sourced IPA/syllable/stress/grammar examples. Mastering hides new items but schedules spaced review; distinguish self-report vs demonstrated mastery and keep history. Recording requires consent/start-stop/listen/delete/retry, private storage limits/retention, actual ASR rubric/provider; noise is insufficient evidence, not zero; accessible non-color cues.

8. GUEST, LEADS, BADGES, GAMES, STARS
Expiring server-owned guest session, rate/replay limits, never trust client scores/IDs. Parent phone/Zalo is voluntary separate opt-in, no unsolicited messages. Badges use versioned server rules/evidence and never grant permission; games do not infer intelligence. Stars use immutable ledger, versioned redemption, reserve/apply/release, no overspend/double/replay; enable tuition redemption only after finance audit.

9. NOTIFICATIONS/PWA
Separate in-app vs background push; exact user/role/child/class/session targeting; private notices never role-broadcast; per-user read, logout/account isolation, reauth deep links; no finance/private lockscreen. API/auth/HTML/private responses network-only, remove old caches, preserve in-progress state; real-device proof.

10. MAPS/STEM/AI/SEO
Verify school coordinates; nearby is not best-school ranking; location opt-in and route vs straight distance. Separate subject/curriculum/grade/skill/type; safe KaTeX/diagrams. DeepSeek key server-only; don't claim it supplies TTS/pronunciation unless provider does; add timeouts/retries/schema validation/jobs/cost budgets/provenance/human review/minimum data. Canonical https://timbk.io.vn, public SSR sitemap/metadata; private routes noindex; robots is not access control; llms policy optional.

11. ONE AUDIT GATE
Worker sequence: security/atomic finance → CSS/roles → teacher/payroll/tuition → exam/vault → PWA/SEO → V3 audio prototype. No silent scope reduction; document any deferred scope and obtain agreement. Handoff one frozen SHA/staging package with requirements→implementation→tests→evidence→limitations matrix, migrations/rollback, isolated test DB, real handlers, injected D1/SQLite errors, concurrency/rollback/cross-role/retry tests, screenshots/themes/responsive/keyboard/zoom, real-device PWA and AI cost/latency/quality evidence. Build/record counts are not sign-off. No release with P0/P1 blockers. Codex will do one consolidated audit and recheck fixes in that same audit.

WORKER ACTION: Read all of this and acknowledge in IDE. Implement on production branch; do not deploy before frozen audit package. Report exact commit, files, migrations, test commands/results, screenshots and limitations. Never include secrets/tokens/passwords.
