# RHAS – Verification matrix of normative references

Checked against licensed copies of EN 50126-1:2017, EN 50126-2:2017, EN 50129:2018
and EN 50716:2023 on 2026-09-24 (WP1). Standard text is not reproduced; the column
"Content (paraphrased)" summarises what the clause covers.

Status: OK = reference and content confirmed · FIXED = corrected in WP1 · OPEN = not yet checked

| Reference in RHAS | Used for | Content (paraphrased) | Status |
| --- | --- | --- | --- |
| EN 50126-1 3.28 | Hazard definition in prompts | Hazard = condition that could lead to an accident | OK |
| EN 50126-1 5.5 | Security scope (Plan A) | Security = resilience to vandalism, malevolence, intentionally harmful behaviour | OK |
| EN 50126-1 5.9.2 a)–c) | Measure types and hierarchy | Avoid hazard → reduce frequency → prevent propagation → mitigate severity; a) safe function, b) additional safety functions/barriers, c) safety-related information/constraints | OK / FIXED (hierarchy remapped) |
| EN 50126-1 6.3 | Broadly acceptable decision | Risk assessment requirements, broadly acceptable criteria | OK |
| EN 50126-1 6.5.2 | (was) assumptions field | Complex systems at different hierarchical levels | FIXED → 7.3.2.1 d) |
| EN 50126-1 6.6, 6.7 | Document control, V&V note | RAMS documentation; verification and validation | OK |
| EN 50126-1 7.2.2 e) | Legal framework field | Safety legislation as concept-phase input | OK |
| EN 50126-1 7.3.2.1 a)–e) | 25 system definition fields | Objective and mission profile; boundary; operational scope incl. modes and human activities; existing measures and assumptions; system identification and deviations | OK |
| EN 50126-1 7.4.2.1 steps 1–6 | Risk analysis workflow | Undesired events, causes, control measures, estimation, additional measures, documentation | OK |
| EN 50126-1 7.4.2.1 a)–n) | Hazard sources GQ-a…n | 14 sources in this order; d) excludes deliberate misuse | OK |
| EN 50126-1 7.4.2.2 a)–g) | Hazard log report, completeness checks | Purpose, responsible entities and contributing functions, consequences/frequencies, risk, RAP/RAC, measures, exported safety constraints | OK |
| EN 50126-1 7.4.3 a), b) | Deliverables GI, RB, GP | Phase 3 outputs: risk assessment, hazard log | OK |
| EN 50126-1 7.5.2, 7.5.3 a), b) | Deliverable SAS | Phase 4: RAMS system requirements; outputs: RAMS SRS, SRAC | OK |
| EN 50126-1 Annex C, Tables C.1, C.4, C.8, C.9 | Default calibration | Frequency and severity examples, acceptance categories, example matrix; C.1: duty holder defines categories | OK (values identical) |
| EN 50126-1 Annex D, D.3.2 | Function list requirement | System definition guidance; function list | OK |
| EN 50126-2 5.2.2 | Hazard at system boundary | Black-box view, hazards evaluated at boundaries | OK |
| EN 50126-2 5.3 | Holistic residual risk | Outcome of risk assessment | OK |
| EN 50126-2 8.2, 8.2.2, 8.2.4 | Risk model, hazard levels, expert judgement | Many-to-many cause/hazard/accident model; expert judgement | OK |
| EN 50126-2 8.3, 8.3.1–8.3.3 | RAP selection | CoP, reference system, explicit risk estimation | OK (bare refs prefixed in WP1) |
| EN 50126-2 9.1–9.3.4 | Requirement categories | Functional, technical, contextual safety requirements | OK |
| EN 50126-2 10.2.1, 10.2.2, 10.2.7 Table 2, 10.2.11, 10.3 | SIL logic | Electronic only; apportioning; SIL table; Basic Integrity; CoP for non-electronic | OK |
| EN 50126-2 11.4 | CCA | Common cause analysis | OK |
| EN 50126-2 Annex A | RAC options | ALARP, GAME, MEM | OK |
| EN 50126-2 Annex F, Table F.1 | Guideword method | HAZOP (IEC 61882) among techniques | OK |
| EN 50126-2 D.3.5 | Per-hour apportionment | Apportionment of a per-hour target | OK |
| EN 50129 5.3.1 | Not safety-related functions | Standard ceases to apply once a function is classified not safety-related | OK |
| EN 50129 5.3.4, 5.3.4.2 | Roles, independence | Safety organisation; independence of roles | OK |
| EN 50129 5.3.6, 5.3.7, 5.3.13 (Table 1) | Hazard log, SRS, SRAC | Hazard log; safety requirements specification; SRAC management, SRAC template | OK |
| EN 50129 6.3 | Tool classification | Tools with indirect effect on safety (e.g. requirement tracing, safety case preparation) | OK |
| EN 50129 6.4 | Security (Plan A) | Physical and IT security; SIL not intended for IT security | OK |
| EN 50129 A.2 | Functional safety requirements | Functional safety requirements include integrity requirements | OK |
| EN 50129 A.4.2.3 | No trivial mass lists | Hazard identification phases; note against large trivial lists | OK |
| EN 50129 A.4.3.2, A.4.3.4 (NOTE 1), A.4.3.5/.6 | Allocation, OR/AND | TFFR/SIL determination; OR-sum for dependent functions; independence | OK |
| EN 50129 A.5.1, A.5.2, Table A.1 | SIL 0, below range | No SIL 0; SIL/TFFR relationship | OK |
| EN 50716 scope | Security (Plan A) | Refers to TS 50701; update vs. validation conflict | OK |

Open: German terminology of deliverable titles (e.g. "Gefährdungsprotokoll" for hazard log)
to be checked against the DIN EN editions once available.
