# -*- coding: utf-8 -*-
import os
import re

UNTRACKED_01_04 = [
    "although_despite_key.md",
    "because_because_of_key.md",
    "nh_m__7__chuy_n____ph_i_h_p_th__thpt_h__ng_kh.md",
    "photo_quiz_reading_giaoandethitienganh_info.md",
    "so_that_in_order_to_key.md",
    "unit_5___lesson_5d___speaking___page_73.md",
    "unit_5___lesson_5f___skills_reading___page_76.md",
    "viet_lai_cau_1_100.md",
    "yen_lap_g7.md",
    "conditional_sentences_key.md",
    "phrasal_verbs.md",
    "phrasal_verbs_key.md",
    "relative_clause_key.md",
    "reported_speech_key.md",
    "1000_word_formation.md",
    "22000_tu_toefl_ielts_harold_levine.md",
    "becoming_independent_vocab.md",
    "cities_urbanisation_vocab.md",
    "our_heritage_vocab.md",
    "1000_cau_trac_nghiem_ngu_phap_hsg.md",
    "31__viet_lai_cau___thi_hsg_lop_10_11_12.md",
    "chuyen_de_ngu_phap.md",
    "chuyen_de_so_1_viet_lai_cau___thi_hsg_lop_10_11_12.md",
    "g3_ck1_test.md",
    "g4_ck1_test.md",
    "g5_ck1_test.md",
    "g7_hsg_de2.md",
    "hsg_anh_8_s__23.md",
    "hsg_anh_8_s__24.md",
    "hsg_lop_11.md",
    "hsg_lop_12_quang_nam.md",
    "ioe_lop_5_tron_bo.md",
    "key__chuyen_de_so_1_viet_lai_cau_thi_hsg_10_11_12.md",
    "speaking_test_4__units_9_10.md"
]

print("Scanning for references to the 34 untracked files...")
found_refs = {}

for root, dirs, files in os.walk('.'):
    if '.git' in root or 'node_modules' in root or '.svelte-kit' in root:
        continue
    for f in files:
        if f.endswith(('.md', '.json', '.js', '.svelte', '.ts')):
            fpath = os.path.join(root, f)
            try:
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                    for target in UNTRACKED_01_04:
                        target_base = target.replace('.md', '')
                        if target in content or f"[[{target_base}]]" in content or f"/{target}" in content:
                            if target not in found_refs:
                                found_refs[target] = []
                            found_refs[target].append(fpath)
            except Exception as e:
                pass

print(f"\nFound references to {len(found_refs)} / {len(UNTRACKED_01_04)} targets:")
for target, paths in found_refs.items():
    # Filter out the target file itself
    external_refs = [p for p in paths if not p.endswith(target)]
    if external_refs:
        print(f"\n[TARGET: {target}] referenced by:")
        for p in external_refs:
            print(f"  -> {p}")
    else:
        print(f"[TARGET: {target}] has NO external references.")
