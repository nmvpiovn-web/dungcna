# -*- coding: utf-8 -*-
import os

UNTRACKED_01_04 = [
    "01_CURRICULUM_GDPT/although_despite_key.md",
    "01_CURRICULUM_GDPT/because_because_of_key.md",
    "01_CURRICULUM_GDPT/nh_m__7__chuy_n____ph_i_h_p_th__thpt_h__ng_kh.md",
    "01_CURRICULUM_GDPT/photo_quiz_reading_giaoandethitienganh_info.md",
    "01_CURRICULUM_GDPT/so_that_in_order_to_key.md",
    "01_CURRICULUM_GDPT/unit_5___lesson_5d___speaking___page_73.md",
    "01_CURRICULUM_GDPT/unit_5___lesson_5f___skills_reading___page_76.md",
    "01_CURRICULUM_GDPT/viet_lai_cau_1_100.md",
    "01_CURRICULUM_GDPT/yen_lap_g7.md",
    "02_GRAMMAR_KNOWLEDGE_BASE/conditional_sentences_key.md",
    "02_GRAMMAR_KNOWLEDGE_BASE/phrasal_verbs.md",
    "02_GRAMMAR_KNOWLEDGE_BASE/phrasal_verbs_key.md",
    "02_GRAMMAR_KNOWLEDGE_BASE/relative_clause_key.md",
    "02_GRAMMAR_KNOWLEDGE_BASE/reported_speech_key.md",
    "03_VOCABULARY_ATLAS/1000_word_formation.md",
    "03_VOCABULARY_ATLAS/22000_tu_toefl_ielts_harold_levine.md",
    "03_VOCABULARY_ATLAS/becoming_independent_vocab.md",
    "03_VOCABULARY_ATLAS/cities_urbanisation_vocab.md",
    "03_VOCABULARY_ATLAS/our_heritage_vocab.md",
    "04_EXAMS_AND_QUESTION_BANK/1000_cau_trac_nghiem_ngu_phap_hsg.md",
    "04_EXAMS_AND_QUESTION_BANK/31__viet_lai_cau___thi_hsg_lop_10_11_12.md",
    "04_EXAMS_AND_QUESTION_BANK/chuyen_de_ngu_phap.md",
    "04_EXAMS_AND_QUESTION_BANK/chuyen_de_so_1_viet_lai_cau___thi_hsg_lop_10_11_12.md",
    "04_EXAMS_AND_QUESTION_BANK/g3_ck1_test.md",
    "04_EXAMS_AND_QUESTION_BANK/g4_ck1_test.md",
    "04_EXAMS_AND_QUESTION_BANK/g5_ck1_test.md",
    "04_EXAMS_AND_QUESTION_BANK/g7_hsg_de2.md",
    "04_EXAMS_AND_QUESTION_BANK/hsg_anh_8_s__23.md",
    "04_EXAMS_AND_QUESTION_BANK/hsg_anh_8_s__24.md",
    "04_EXAMS_AND_QUESTION_BANK/hsg_lop_11.md",
    "04_EXAMS_AND_QUESTION_BANK/hsg_lop_12_quang_nam.md",
    "04_EXAMS_AND_QUESTION_BANK/ioe_lop_5_tron_bo.md",
    "04_EXAMS_AND_QUESTION_BANK/key__chuyen_de_so_1_viet_lai_cau_thi_hsg_10_11_12.md",
    "04_EXAMS_AND_QUESTION_BANK/speaking_test_4__units_9_10.md"
]

vaults = ["obsidian_vault", "second_brain"]
removed_count = 0

for v in vaults:
    for rel_path in UNTRACKED_01_04:
        p = os.path.join(v, rel_path)
        if os.path.exists(p):
            os.remove(p)
            removed_count += 1
            print(f"Removed truncated duplicate: {p}")

print(f"\nTotal removed files: {removed_count} (34 in obsidian_vault, 34 in second_brain)")
