import sqlite3
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("=== STARTING FULL MODULAR SYSTEM BUILDER ===")

# ==============================================================================
# 1. GRAMMAR TOPICS DATABASE (12 CORE TOPICS)
# ==============================================================================
grammar_topics = [
    {
        "id": "tenses_present",
        "topic": "Hiện Tại Đơn & Hiện Tại Tiếp Diễn (Present Simple & Continuous)",
        "grade_level": "Lớp 3, 4, 5, 6, 7",
        "curriculum_unit": "Unit 1 - Unit 2",
        "category": "tenses",
        "cefr_level": "A1 - A2",
        "summary": "Thì hiện tại đơn diễn tả thói quen, chân lý sự thật. Hiện tại tiếp diễn diễn tả hành động đang xảy ra tại thời điểm nói hoặc kế hoạch tương lai.",
        "formula": {
            "present_simple": {
                "affirmative": "S + V(s/es) + O",
                "negative": "S + do/does + not + V_inf + O",
                "interrogative": "Do/Does + S + V_inf + O?"
            },
            "present_continuous": {
                "affirmative": "S + am/is/are + V-ing + O",
                "negative": "S + am/is/are + not + V-ing + O",
                "interrogative": "Am/Is/Are + S + V-ing + O?"
            }
        },
        "usage": [
            "Hiện tại đơn: Sự thật hiển nhiên, thói quen lặp đi lặp lại, lịch trình tàu xe.",
            "Hiện tại tiếp diễn: Hành động đang xảy ra lúc nói (now, at present), phàn nàn với 'always', kế hoạch đã sắp xếp."
        ],
        "signal_words": [
            "Present Simple: always, usually, often, sometimes, rarely, never, every day/week, once a week",
            "Present Continuous: now, right now, at the moment, at present, Look!, Listen!, Be quiet!"
        ],
        "phonics_rules": "Quy tắc phát âm đuôi -s/-es: /s/ sau âm vô thanh (/p, k, f, t, θ/), /ɪz/ sau âm xát (/s, z, ʃ, tʃ, dʒ/), /z/ sau các nguyên âm và phụ âm hữu thanh còn lại.",
        "common_mistakes": "1. Quên thêm s/es với ngôi thứ 3 số ít (He, She, It).\n2. Dùng thì tiếp diễn với động từ chỉ trạng thái giác quan/cảm xúc (Stative verbs: know, like, want, believe, smell). Ví dụ sai: 'I am knowing him' -> Đúng: 'I know him'.",
        "examples": [
            {"en": "She volunteers at the nursing home every Saturday.", "vi": "Cô ấy làm tình nguyện tại viện dưỡng lão vào mỗi thứ Bảy."},
            {"en": "Be quiet! The baby is sleeping in the bedroom.", "vi": "Giữ im lặng nào! Em bé đang ngủ trong phòng ngủ."},
            {"en": "The Earth orbits around the Sun.", "vi": "Trái Đất quay xung quanh Mặt Trời."}
        ],
        "practice_questions": [
            {
                "id": "gq_pres_1",
                "prompt": "Listen! Someone ______ the guitar in the next room.",
                "options": ["A. plays", "B. is playing", "C. played", "D. has played"],
                "correct": "B",
                "explanation": "Dấu hiệu 'Listen!' báo hiệu hành động đang diễn ra tại thời điểm nói -> Dùng thì Hiện tại tiếp diễn (is playing)."
            },
            {
                "id": "gq_pres_2",
                "prompt": "Water ______ at 100 degrees Celsius under standard atmospheric pressure.",
                "options": ["A. boil", "B. boils", "C. is boiling", "D. boiled"],
                "correct": "B",
                "explanation": "Đây là chân lý khoa học / sự thật hiển nhiên -> Dùng Hiện tại đơn, chủ ngữ 'Water' không đếm được -> boils."
            }
        ]
    },
    {
        "id": "tenses_past",
        "topic": "Quá Khứ Đơn & Quá Khứ Tiếp Diễn (Past Simple & Continuous)",
        "grade_level": "Lớp 6, 7, 8, 9",
        "curriculum_unit": "Unit 3 - Unit 4",
        "category": "tenses",
        "cefr_level": "A2 - B1",
        "summary": "Quá khứ đơn diễn tả hành động đã kết thúc tại thời điểm xác định trong quá khứ. Quá khứ tiếp diễn diễn tả hành động đang diễn ra tại một thời điểm hoặc một hành động đang diễn ra thì hành động khác xen vào (When / While).",
        "formula": {
            "past_simple": {
                "affirmative": "S + V2/V-ed + O",
                "negative": "S + did not + V_inf + O",
                "interrogative": "Did + S + V_inf + O?"
            },
            "past_continuous": {
                "affirmative": "S + was/were + V-ing + O",
                "negative": "S + was/were + not + V-ing + O",
                "interrogative": "Was/Were + S + V-ing + O?"
            }
        },
        "usage": [
            "Quá khứ đơn: Hành động đã chấm dứt hoàn toàn trong quá khứ với thời gian cụ thể (yesterday, in 2020, 2 days ago).",
            "Quá khứ tiếp diễn: Hành động đang xảy ra tại một thời điểm cụ thể trong quá khứ (at 8 PM yesterday).",
            "Kết hợp When / While: Một hành động đang xảy ra (quá khứ tiếp diễn) thì hành động khác xen vào (quá khứ đơn)."
        ],
        "signal_words": [
            "Past Simple: yesterday, last night/month/year, ago, in + năm quá khứ, when I was young",
            "Past Continuous: at that moment, at + giờ + thời gian quá khứ, while, when, as"
        ],
        "phonics_rules": "Quy tắc phát âm đuôi -ed: /ɪd/ sau /t, d/ (wanted, needed); /t/ sau phụ âm vô thanh (/p, k, f, s, ʃ, tʃ/); /d/ sau các nguyên âm và phụ âm hữu thanh còn lại.",
        "common_mistakes": "1. Dùng quá khứ đơn sau trợ động từ 'did/didn't' (Sai: 'Did you went?' -> Đúng: 'Did you go?').\n2. Nhầm lẫn giữa 'when' (thường đi với quá khứ đơn) và 'while' (thường đi với quá khứ tiếp diễn).",
        "examples": [
            {"en": "We planted 50 trees in our school garden last weekend.", "vi": "Chúng tôi đã trồng 50 cây xanh trong vườn trường vào cuối tuần trước."},
            {"en": "While I was doing my homework, the electricity went out.", "vi": "Trong khi tôi đang làm bài tập về nhà thì điện bị cúp."}
        ],
        "practice_questions": [
            {
                "id": "gq_past_1",
                "prompt": "When the teacher came into the classroom, the students ______ noise.",
                "options": ["A. make", "B. made", "C. were making", "D. are making"],
                "correct": "C",
                "explanation": "Hành động học sinh đang làm ồn (were making noise) đang diễn ra thì thầy giáo bước vào (came - xen vào)."
            },
            {
                "id": "gq_past_2",
                "prompt": "Choose the word with the -ed pronounced as /ɪd/: naked, ploughed, washed, lived",
                "options": ["A. naked", "B. ploughed", "C. washed", "D. lived"],
                "correct": "A",
                "explanation": "'naked' là tính từ đặc biệt phát âm đuôi -ed là /ɪd/ (/ˈneɪkɪd/). Các từ còn lại: ploughed /d/, washed /t/, lived /d/."
            }
        ]
    },
    {
        "id": "tenses_perfect",
        "topic": "Hiện Tại Hoàn Thành & Quá Khứ Hoàn Thành (Present & Past Perfect)",
        "grade_level": "Lớp 7, 8, 9, 10, 11",
        "curriculum_unit": "Unit 5 - Unit 6",
        "category": "tenses",
        "cefr_level": "B1 - B2",
        "summary": "Hiện tại hoàn thành kết nối quá khứ với hiện tại (kết quả lưu lại hoặc kinh nghiệm). Quá khứ hoàn thành diễn tả hành động xảy ra và hoàn tất trước một mốc thời gian hoặc hành động khác trong quá khứ.",
        "formula": {
            "present_perfect": {
                "affirmative": "S + have/has + V3/V-ed + O",
                "negative": "S + have/has + not + V3/V-ed + O",
                "interrogative": "Have/Has + S + V3/V-ed + O?"
            },
            "past_perfect": {
                "affirmative": "S + had + V3/V-ed + O",
                "negative": "S + had + not + V3/V-ed + O",
                "interrogative": "Had + S + V3/V-ed + O?"
            }
        },
        "usage": [
            "Present Perfect: Kinh nghiệm trải nghiệm (ever, never), hành động vừa mới xảy ra (just, already), hành động kéo dài từ quá khứ đến nay (for, since).",
            "Past Perfect: Hành động xảy ra trước một hành động khác trong quá khứ (Before S + V2, S + had V3; After S + had V3, S + V2)."
        ],
        "signal_words": [
            "Present Perfect: already, yet, just, ever, never, since, for, so far, recently, lately",
            "Past Perfect: before, after, by the time, as soon as, when"
        ],
        "phonics_rules": "Lưu ý dạng rút gọn: I've /aɪv/, He's /hiːz/, They'd /ðeɪd/.",
        "common_mistakes": "Dùng Hiện tại hoàn thành với mốc thời gian cụ thể trong quá khứ (Sai: 'I have seen him yesterday' -> Đúng: 'I saw him yesterday').",
        "examples": [
            {"en": "She has lived in Da Nang since 2018.", "vi": "Cô ấy đã sống ở Đà Nẵng từ năm 2018."},
            {"en": "By the time the police arrived, the burglar had already escaped.", "vi": "Trước khi cảnh sát đến thì tên trộm đã tẩu thoát rồi."}
        ],
        "practice_questions": [
            {
                "id": "gq_perf_1",
                "prompt": "I have known him ______ we were in primary school.",
                "options": ["A. for", "B. since", "C. in", "D. ago"],
                "correct": "B",
                "explanation": "'since' đi với mốc thời gian (mệnh đề quá khứ đơn: we were in primary school)."
            }
        ]
    },
    {
        "id": "passive_voice",
        "topic": "Câu Bị Động Toàn Diện (Passive Voice: Basic to Advanced)",
        "grade_level": "Lớp 7, 8, 9, 10, 11, 12",
        "curriculum_unit": "Unit 7 - Unit 8",
        "category": "structures",
        "cefr_level": "B1 - B2",
        "summary": "Câu bị động nhấn mạnh vào đối tượng chịu tác động của hành động thay vì người thực hiện. Cấu trúc tổng quát: S + Be + V3/V-ed + (by O).",
        "formula": {
            "general": "S + BE (chia theo thì) + V3/ed + (by Agent)",
            "present_simple": "am/is/are + V3/ed",
            "past_simple": "was/were + V3/ed",
            "modal_verbs": "modal (can, must, should) + be + V3/ed",
            "impersonal_passive": "It is said/thought/believed that S + V..."
        },
        "usage": [
            "Khi không biết người thực hiện hành động hoặc người thực hiện không quan trọng.",
            "Trong văn phong khoa học, tin tức, văn bản học thuật báo cáo.",
            "Bị động kép / Bị động khách quan: People say that S + V -> It is said that S + V hoặc S + is said to V."
        ],
        "signal_words": [
            "by + tân ngữ (by the teacher, by millions of tourists)",
            "Cụm chỉ phương tiện: with + công cụ (with a knife, with a hammer)"
        ],
        "phonics_rules": "Nhấn mạnh vào trợ động từ 'be' khi muốn khẳng định: It WAS done, not is done.",
        "common_mistakes": "Bỏ quên trợ động từ 'be' (Sai: 'The car washed yesterday' -> Đúng: 'The car was washed yesterday').",
        "examples": [
            {"en": "Millions of smartphones are produced every month.", "vi": "Hàng triệu chiếc điện thoại thông minh được sản xuất mỗi tháng."},
            {"en": "The Golden Bridge was built in 2018 in Da Nang.", "vi": "Cầu Vàng được xây dựng năm 2018 tại Đà Nẵng."}
        ],
        "practice_questions": [
            {
                "id": "gq_pass_1",
                "prompt": "Solar panels ______ on the roofs of many smart houses to generate green energy.",
                "options": ["A. install", "B. are installed", "C. installing", "D. are installing"],
                "correct": "B",
                "explanation": "Tấm pin năng lượng mặt trời là vật chịu tác động -> dùng bị động hiện tại đơn: are installed."
            }
        ]
    },
    {
        "id": "conditionals_wish",
        "topic": "Câu Điều Kiện & Mệnh Đề Ước (Conditionals Type 1, 2, 3 & Wish Clauses)",
        "grade_level": "Lớp 8, 9, 10, 11, 12",
        "curriculum_unit": "Unit 9 - Unit 10",
        "category": "structures",
        "cefr_level": "B1 - B2",
        "summary": "Câu điều kiện diễn tả giả thiết và kết quả tương ứng. Loại 1: có thật ở hiện tại/tương lai; Loại 2: không có thật ở hiện tại; Loại 3: không có thật ở quá khứ.",
        "formula": {
            "type_1": "If + S + V(hiện tại đơn), S + will/can + V_inf",
            "type_2": "If + S + V2/ed (were), S + would/could + V_inf",
            "type_3": "If + S + had + V3/ed, S + would/could + have + V3/ed",
            "wish_present": "S + wish(es) + S + V2/ed (were)",
            "wish_past": "S + wish(es) + S + had + V3/ed"
        },
        "usage": [
            "Loại 1: Lời hứa, cảnh báo, dự đoán khả thi.",
            "Loại 2: Giả định trái ngược hiện tại hoặc lời khuyên (If I were you...).",
            "Loại 3: Tiếc nuối về điều đã xảy ra trong quá khứ."
        ],
        "signal_words": [
            "if, unless (= if not), provided that, as long as, in case, wish, if only"
        ],
        "phonics_rules": "Nối âm: 'If I were' /ɪf aɪ wɜːr/, 'would have' thường phát âm lướt là /ˈwʊdəv/.",
        "common_mistakes": "Dùng 'will' hoặc 'would' ngay trong mệnh đề IF (Sai: 'If I will have time...' -> Đúng: 'If I have time...').",
        "examples": [
            {"en": "If we protect the environment, wildlife will survive.", "vi": "Nếu chúng ta bảo vệ môi trường, động vật hoang dã sẽ sống sót."},
            {"en": "If I had a million dollars, I would build a charity hospital.", "vi": "Nếu tôi có 1 triệu đô la, tôi sẽ xây một bệnh viện từ thiện."}
        ],
        "practice_questions": [
            {
                "id": "gq_cond_1",
                "prompt": "If I ______ you, I would take that prestigious scholarship immediately.",
                "options": ["A. am", "B. was", "C. were", "D. had been"],
                "correct": "C",
                "explanation": "Câu điều kiện loại 2 giả định trái hiện tại/lời khuyên: dùng 'were' cho tất cả các ngôi."
            }
        ]
    },
    {
        "id": "relative_clauses",
        "topic": "Mệnh Đề Quan Hệ (Relative Clauses: Who, Whom, Which, That, Whose, Where, When)",
        "grade_level": "Lớp 8, 9, 10, 11, 12",
        "curriculum_unit": "Unit 11",
        "category": "clauses",
        "cefr_level": "B1 - B2",
        "summary": "Mệnh đề quan hệ bổ nghĩa cho danh từ đứng trước. Phân loại: Mệnh đề quan hệ xác định (Defining) và không xác định (Non-defining - có dấu phẩy, không dùng THAT).",
        "formula": {
            "who": "Danh từ chỉ người + WHO + V / S + V",
            "whom": "Danh từ chỉ người + WHOM + S + V",
            "which": "Danh từ chỉ vật + WHICH + V / S + V",
            "whose": "Danh từ chỉ người/vật + WHOSE + Noun",
            "that": "Thay thế cho who, whom, which trong mệnh đề xác định (không có dấu phẩy)"
        },
        "usage": [
            "Mệnh đề xác định: Cung cấp thông tin thiết yếu, không thể bỏ được.",
            "Mệnh đề không xác định: Bổ sung thêm thông tin phụ, ngăn cách bằng dấu phẩy. Lưu ý: Không dùng 'that' sau dấu phẩy hoặc sau giới từ!"
        ],
        "signal_words": [
            "who, whom, which, that, whose, where (place), when (time), why (reason)"
        ],
        "phonics_rules": "Hạ giọng ở cuối mệnh đề không xác định trước dấu phẩy.",
        "common_mistakes": "Dùng 'that' trong mệnh đề có dấu phẩy (Sai: 'Da Nang, that is a coastal city,...' -> Đúng: 'Da Nang, which is a coastal city,...').",
        "examples": [
            {"en": "The teacher who taught us English is very kind and patient.", "vi": "Cô giáo dạy chúng tôi môn tiếng Anh rất tốt bụng và kiên nhẫn."},
            {"en": "The book which I borrowed from the library is fascinating.", "vi": "Cuốn sách mà tôi mượn từ thư viện rất lôi cuốn."}
        ],
        "practice_questions": [
            {
                "id": "gq_rel_1",
                "prompt": "Ha Long Bay, ______ is recognized as a UNESCO World Heritage site, attracts millions of tourists.",
                "options": ["A. that", "B. which", "C. where", "D. whose"],
                "correct": "B",
                "explanation": "Mệnh đề có dấu phẩy (không xác định), bổ nghĩa cho danh từ riêng chỉ vật/địa danh làm chủ ngữ -> Dùng 'which' (không dùng 'that')."
            }
        ]
    },
    {
        "id": "gerunds_infinitives",
        "topic": "Danh Động Từ & Động Từ Nguyên Mẫu (Gerunds & Infinitives: V-ing vs To V)",
        "grade_level": "Lớp 7, 8, 9, 10, 11",
        "curriculum_unit": "Unit 1 - Unit 3",
        "category": "structures",
        "cefr_level": "A2 - B2",
        "summary": "Quy tắc lựa chọn giữa V-ing và To-V sau các động từ, tính từ và giới từ. Một số động từ thay đổi nghĩa tuỳ thuộc vào V-ing hay To-V (remember, forget, stop, try).",
        "formula": {
            "gerund_verbs": "enjoy, avoid, mind, admit, suggest, consider, practice, keep + V-ing",
            "infinitive_verbs": "want, decide, hope, promise, agree, refuse, plan, offer, need + To V",
            "prepositions": "preposition (in, on, at, about, without, instead of) + V-ing"
        },
        "usage": [
            "V-ing làm chủ ngữ trong câu: 'Learning English opens up global opportunities.'",
            "To V chỉ mục đích: 'She studies hard to pass the high school entrance exam.'",
            "Thay đổi nghĩa: stop to V (dừng lại ĐỂ làm gì) vs stop V-ing (dừng hẳn việc gì lại); remember to V (nhớ phải làm gì) vs remember V-ing (nhớ đã làm gì trong quá khứ)."
        ],
        "signal_words": [
            "look forward to + V-ing, be used to + V-ing, can't help + V-ing, it's no use + V-ing"
        ],
        "phonics_rules": "Đuôi -ing phát âm là /ɪŋ/ (âm mũi cuối), không bật âm g.",
        "common_mistakes": "Dùng To-V sau giới từ (Sai: 'He left without to say goodbye' -> Đúng: 'without saying goodbye').",
        "examples": [
            {"en": "She enjoys volunteering at the community center.", "vi": "Cô ấy rất thích đi làm tình nguyện tại trung tâm cộng đồng."},
            {"en": "Remember to lock the front door before going to bed.", "vi": "Hãy nhớ khóa cửa chính trước khi đi ngủ nhé."}
        ],
        "practice_questions": [
            {
                "id": "gq_ger_1",
                "prompt": "Wearing a wristband allows athletes ______ safely without muscle strain.",
                "options": ["A. playing", "B. to play", "C. play", "D. played"],
                "correct": "B",
                "explanation": "Cấu trúc: allow somebody + TO V (cho phép ai làm gì) -> to play."
            }
        ]
    },
    {
        "id": "comparisons",
        "topic": "Các Cấu Trúc So Sánh (Comparisons: Equal, Comparative, Superlative & Double Comparative)",
        "grade_level": "Lớp 6, 7, 8, 9, 10",
        "curriculum_unit": "Unit 4 - Unit 5",
        "category": "modifiers",
        "cefr_level": "A2 - B1",
        "summary": "So sánh bằng (as... as), so sánh hơn (-er / more... than), so sánh nhất (the -est / the most...), và so sánh kép (The more..., the more...).",
        "formula": {
            "equal": "as + adj/adv + as",
            "comparative_short": "S1 + be/V + adj-er/adv-er + than + S2",
            "comparative_long": "S1 + be/V + more + adj/adv + than + S2",
            "superlative": "S + be/V + the + adj-est / the most + adj + (of/in)",
            "double_comparative": "The + comparative..., the + comparative..."
        },
        "usage": [
            "So sánh 2 đối tượng dùng so sánh hơn; so sánh từ 3 đối tượng trở lên dùng so sánh nhất.",
            "So sánh kép biểu thị sự tăng giảm tỉ lệ thuận: 'The harder you practice, the better you perform.'"
        ],
        "signal_words": [
            "than, as... as, the most, the -est, much/far/a lot + so sánh hơn (nhấn mạnh)"
        ],
        "phonics_rules": "Đuôi -er phát âm là /ər/, đuôi -est phát âm là /ɪst/.",
        "common_mistakes": "Dùng 'more' cùng với tính từ ngắn có đuôi '-er' (Sai: 'more bigger' -> Đúng: 'bigger').",
        "examples": [
            {"en": "The younger you are, the easier it is to learn a foreign language.", "vi": "Bạn càng trẻ thì học ngoại ngữ càng dễ dàng hơn."},
            {"en": "Solar energy is cleaner and more sustainable than coal.", "vi": "Năng lượng mặt trời sạch hơn và bền vững hơn than đá."}
        ],
        "practice_questions": [
            {
                "id": "gq_comp_1",
                "prompt": "The younger you are, ______ it is to acquire authentic pronunciation.",
                "options": ["A. easier", "B. the easier", "C. easily", "D. the easily"],
                "correct": "B",
                "explanation": "Cấu trúc so sánh kép: The + comparative, the + comparative -> the easier."
            }
        ]
    },
    {
        "id": "modal_verbs",
        "topic": "Động Từ Khuyết Thiếu (Modal Verbs: Can, Could, Must, Have to, Should, May, Might)",
        "grade_level": "Lớp 6, 7, 8, 9, 10",
        "curriculum_unit": "Unit 6 - Unit 7",
        "category": "structures",
        "cefr_level": "A2 - B1",
        "summary": "Động từ khuyết thiếu bổ sung nghĩa về khả năng (ability), bắt buộc (obligation), lời khuyên (advice), xin phép (permission), khả năng xảy ra (possibility).",
        "formula": {
            "affirmative": "S + modal verb + V_inf",
            "negative": "S + modal verb + not + V_inf",
            "interrogative": "Modal verb + S + V_inf?"
        },
        "usage": [
            "Can / Could: Khả năng ở hiện tại / quá khứ, lời yêu cầu lịch sự.",
            "Must vs Have to: 'Must' mang tính bắt buộc chủ quan từ người nói; 'Have to' bắt buộc khách quan do luật lệ quy định.",
            "Should / Ought to: Lời khuyên nên làm gì.",
            "Mustn't: Cấm đoán (không được phép làm)."
        ],
        "signal_words": [
            "can, could, may, might, must, should, ought to, have to, would rather, had better"
        ],
        "phonics_rules": "Âm câm: 'l' câm trong 'could' /kʊd/, 'should' /ʃʊd/, 'would' /wʊd/.",
        "common_mistakes": "Thêm 'to' sau modal verb (Sai: 'He can to swim' -> Đúng: 'He can swim'). Ngoại lệ: ought to, have to.",
        "examples": [
            {"en": "You must wear a helmet when riding a motorbike in Vietnam.", "vi": "Bạn bắt buộc phải đội mũ bảo hiểm khi đi xe máy tại Việt Nam."},
            {"en": "You should review vocabulary daily to retain words effectively.", "vi": "Em nên ôn lại từ vựng hàng ngày để ghi nhớ lâu dài."}
        ],
        "practice_questions": [
            {
                "id": "gq_mod_1",
                "prompt": "You ______ park your car here. It's a strictly prohibited zone.",
                "options": ["A. shouldn't", "B. needn't", "C. mustn't", "D. couldn't"],
                "correct": "C",
                "explanation": "Diễn tả sự cấm đoán tuyệt đối ('strictly prohibited zone') -> Dùng 'mustn't'."
            }
        ]
    },
    {
        "id": "adverbial_clauses",
        "topic": "Mệnh Đề Trạng Ngữ (Adverbial Clauses: Reason, Concession, Purpose, Result)",
        "grade_level": "Lớp 7, 8, 9, 10",
        "curriculum_unit": "Unit 7 - Unit 9",
        "category": "clauses",
        "cefr_level": "B1",
        "summary": "Mệnh đề trạng ngữ chỉ nguyên nhân (because, since, as), nhượng bộ (although, even though, though), mục đích (so that, in order that), kết quả (so... that, such... that).",
        "formula": {
            "reason": "Because / Since / As + S + V, S + V",
            "concession": "Although / Even though + S + V, S + V  <-->  Despite / In spite of + Noun/V-ing, S + V",
            "result": "S + be + so + adj + that + S + V"
        },
        "usage": [
            "Chỉ nguyên nhân: Giữa hai mệnh đề không dùng cả 'because' và 'so' trong cùng 1 câu!",
            "Chỉ nhượng bộ: Không dùng cả 'although' và 'but' trong cùng một câu!"
        ],
        "signal_words": [
            "because, because of, although, in spite of, despite, so that, so... that, such... that"
        ],
        "phonics_rules": "Phát âm âm /ð/ trong 'although' /ɔːlˈðoʊ/ và 'even though'.",
        "common_mistakes": "Dùng cả 'Although' và 'But' (Sai: 'Although it rained, but we went out' -> Đúng: 'Although it rained, we went out').",
        "examples": [
            {"en": "Although the exam was difficult, Nam scored top marks.", "vi": "Mặc dù bài thi rất khó, Nam vẫn đạt điểm thủ khoa."},
            {"en": "Linh wears headphones because her parents don't like loud noise.", "vi": "Linh đeo tai nghe vì bố mẹ em không thích tiếng ồn lớn."}
        ],
        "practice_questions": [
            {
                "id": "gq_adv_1",
                "prompt": "Linh often uses her headphones ______ her parents do not like loud music.",
                "options": ["A. so", "B. but", "C. because", "D. although"],
                "correct": "C",
                "explanation": "Mệnh đề sau giải thích nguyên nhân cho hành động trước -> Dùng 'because'."
            }
        ]
    },
    {
        "id": "quantifiers_articles",
        "topic": "Mạo Từ & Lượng Từ (Articles & Quantifiers: A/An/The, Many/Much, A Few/A Little)",
        "grade_level": "Lớp 3, 4, 5, 6, 7, 8",
        "curriculum_unit": "Unit 2 - Unit 4",
        "category": "modifiers",
        "cefr_level": "A1 - B1",
        "summary": "Cách sử dụng mạo từ không xác định (a/an), mạo từ xác định (the), mạo từ rỗng (zero article) và các từ định lượng với danh từ đếm được và không đếm được.",
        "formula": {
            "articles": "a + phụ âm (a book, a university /juː/), an + nguyên âm (an apple, an hour /aʊər/)",
            "countable": "many, a few, few, several, both + danh từ đếm được số nhiều",
            "uncountable": "much, a little, little, a piece of + danh từ không đếm được"
        },
        "usage": [
            "A/An dùng với danh từ số ít đếm được khi nhắc tới lần đầu.",
            "The dùng khi đối tượng đã xác định, duy nhất (the Sun, the Moon), so sánh nhất (the best), nhạc cụ (play the piano).",
            "A few / A little (có một ít, đủ dùng) vs Few / Little (hầu như không có, mang nghĩa tiêu cực)."
        ],
        "signal_words": [
            "a, an, the, much, many, a lot of, plenty of, several, a few, a little, either, neither"
        ],
        "phonics_rules": "'The' phát âm là /ðiː/ trước danh từ bắt đầu bằng nguyên âm (the Earth, the apple) và /ðə/ trước phụ âm.",
        "common_mistakes": "Dùng 'an' theo chữ cái thay vì theo phiên âm (Sai: 'an university' -> Đúng: 'a university' vì bắt đầu bằng bán nguyên âm /j/).",
        "examples": [
            {"en": "She plays the piano in the music room every afternoon.", "vi": "Em ấy chơi đàn dương cầm trong phòng âm nhạc mỗi chiều."},
            {"en": "There is a little milk left in the bottle, enough for breakfast.", "vi": "Còn một chút sữa trong bình, đủ cho bữa sáng."}
        ],
        "practice_questions": [
            {
                "id": "gq_art_1",
                "prompt": "Venus is ______ second planet from the Sun in our solar system.",
                "options": ["A. a", "B. an", "C. the", "D. zero article"],
                "correct": "C",
                "explanation": "Số thứ tự (the second, the first) luôn đi với mạo từ xác định 'the'."
            }
        ]
    },
    {
        "id": "reported_speech",
        "topic": "Câu Tường Thuật (Reported Speech: Statements, Questions & Commands)",
        "grade_level": "Lớp 8, 9, 10, 11, 12",
        "curriculum_unit": "Unit 10 - Unit 12",
        "category": "structures",
        "cefr_level": "B1 - B2",
        "summary": "Tường thuật lời nói gián tiếp từ câu trực tiếp. Nguyên tắc biến đổi 3 yếu tố: Lùi thì (Backshift), đổi đại từ / tính từ sở hữu, và đổi trạng từ chỉ thời gian / nơi chốn.",
        "formula": {
            "statements": "S + said (that) + S + V(lùi thì)",
            "yes_no_questions": "S + asked + if/whether + S + V(lùi thì)",
            "wh_questions": "S + asked + Wh-word + S + V(lùi thì)",
            "commands": "S + told/ordered + O + to V (hoặc not to V)"
        },
        "usage": [
            "Lùi thì: Hiện tại đơn -> Quá khứ đơn; Hiện tại tiếp diễn -> Quá khứ tiếp diễn; Hiện tại hoàn thành / Quá khứ đơn -> Quá khứ hoàn thành; Will -> Would; Can -> Could.",
            "Trạng từ: now -> then, today -> that day, tomorrow -> the next day, yesterday -> the day before, here -> there."
        ],
        "signal_words": [
            "said to, told, asked, wondered, ordered, requested, advised, warned"
        ],
        "phonics_rules": "Hạ giọng ở cuối câu hỏi tường thuật vì cấu trúc là câu trần thuật (S + V), không đảo trợ động từ.",
        "common_mistakes": "Giữ nguyên trật tự câu hỏi đảo trợ động từ (Sai: 'He asked me where did I live' -> Đúng: 'He asked me where I lived').",
        "examples": [
            {"en": "\"I am learning English online,\" Nam said. -> Nam said that he was learning English online.", "vi": "\"Mình đang học tiếng Anh trực tuyến,\" Nam nói. -> Nam bảo rằng bạn ấy đang học tiếng Anh trực tuyến."},
            {"en": "The teacher told us not to talk during the mock exam.", "vi": "Giáo viên bảo chúng tôi không được nói chuyện trong giờ thi thử."}
        ],
        "practice_questions": [
            {
                "id": "gq_rep_1",
                "prompt": "\"Where are you going for your vacation?\" Mai asked John. -> Mai asked John where ______ for his vacation.",
                "options": ["A. is he going", "B. was he going", "C. he is going", "D. he was going"],
                "correct": "D",
                "explanation": "Câu tường thuật Wh-question: đổi trật tự thành S + V và lùi thì (are going -> was going) -> he was going."
            }
        ]
    }
]

# Write grammar_topics.json
with open('src/lib/data/grammar_topics.json', 'w', encoding='utf-8') as f:
    json.dump(grammar_topics, f, ensure_ascii=False, indent=2)
print(f"Generated {len(grammar_topics)} comprehensive grammar topics in src/lib/data/grammar_topics.json.")

# ==============================================================================
# 2. ENRICH VOCABULARY DATABASE (WORDS + WORD FORMATION + PHONICS)
# ==============================================================================
# Load existing words
with open('src/lib/data/words.json', 'r', encoding='utf-8') as f:
    base_words = json.load(f)

vocab_dict = {w['term'].lower().strip(): w for w in base_words}

# Add words from 1000_word_formation & drive downloads
expanded_terms = [
    # Primary school terms
    {
        "term": "ruler",
        "ipa": "/ˈruːlər/",
        "pos": "noun",
        "meaning_vi": "cây thước kẻ",
        "vowels_detail": "Nguyên âm dài /uː/, âm schwa /ər/ ở cuối.",
        "consonants_detail": "Phụ âm cuộn /r/, phụ âm bên /l/.",
        "phonics_note": "Trọng âm âm tiết 1: RU-ler.",
        "syllables": "ru-ler (2 âm tiết)",
        "example_en": "Use a ruler to draw a straight line.",
        "example_vi": "Hãy dùng thước kẻ để vẽ một đường thẳng.",
        "unit_id": "unit_g3_school",
        "grade": "Lớp 3",
        "cambridge_level": "STARTERS",
        "difficulty": "easy",
        "category": "school"
    },
    {
        "term": "playground",
        "ipa": "/ˈpleɪɡraʊnd/",
        "pos": "noun",
        "meaning_vi": "sân chơi trường học",
        "vowels_detail": "Nguyên âm đôi /eɪ/ trong 'play' và /aʊ/ trong 'ground'.",
        "consonants_detail": "Cụm phụ âm /pl/ và /ɡr/, kết thúc bằng /nd/.",
        "phonics_note": "Trọng âm rơi vào từ đầu: PLAY-ground.",
        "syllables": "play-ground (2 âm tiết)",
        "example_en": "Pupils play shuttlecock in the school playground during break time.",
        "example_vi": "Học sinh đá cầu ở sân trường trong giờ ra chơi.",
        "unit_id": "unit_g4_school",
        "grade": "Lớp 4",
        "cambridge_level": "MOVERS",
        "difficulty": "easy",
        "category": "school"
    },
    {
        "term": "waterfall",
        "ipa": "/ˈwɔːtərfɔːl/",
        "pos": "noun",
        "meaning_vi": "thác nước thiên nhiên",
        "vowels_detail": "Nguyên âm tròn môi dài /ɔː/ ở cả hai âm tiết chính.",
        "consonants_detail": "Bán nguyên âm /w/, phụ âm răng môi /f/, âm lưỡi /l/.",
        "phonics_note": "Trọng âm rơi vào âm đầu: WA-ter-fall.",
        "syllables": "wa-ter-fall (3 âm tiết)",
        "example_en": "Ban Gioc is one of the most stunning waterfalls in Vietnam.",
        "example_vi": "Bản Giốc là một trong những thác nước ngoạn mục nhất tại Việt Nam.",
        "unit_id": "unit_g5_nature",
        "grade": "Lớp 5",
        "cambridge_level": "FLYERS",
        "difficulty": "medium",
        "category": "nature"
    },
    # Secondary school terms (Grade 7, 8, 9)
    {
        "term": "renewable energy",
        "ipa": "/rɪˈnjuːəbl ˈenədʒi/",
        "pos": "noun phrase",
        "meaning_vi": "năng lượng tái tạo (mặt trời, gió, thủy triều)",
        "vowels_detail": "Nguyên âm /uː/ trong 'new', nguyên âm ngắn /e/ trong 'en'.",
        "consonants_detail": "Phụ âm xát tắc /dʒ/ ở cuối 'energy', phụ âm /n/ và /r/.",
        "phonics_note": "Trọng âm: re-NEW-able EN-er-gy.",
        "syllables": "re-new-a-ble en-er-gy (7 âm tiết)",
        "example_en": "Wind and solar power are important sources of renewable energy.",
        "example_vi": "Năng lượng gió và mặt trời là các nguồn năng lượng tái tạo quan trọng.",
        "unit_id": "unit10",
        "grade": "Lớp 7",
        "cambridge_level": "KET_A2",
        "difficulty": "medium",
        "category": "energy"
    },
    {
        "term": "look down on",
        "ipa": "/lʊk daʊn ɒn/",
        "pos": "phrasal verb",
        "meaning_vi": "coi thường, khinh thường ai đó",
        "vowels_detail": "Nguyên âm ngắn /ʊ/ trong 'look', đôi /aʊ/ trong 'down', ngắn /ɒ/ trong 'on'.",
        "consonants_detail": "Phụ âm cuối /k/, /n/ tạo liên kết nối âm.",
        "phonics_note": "Nhấn mạnh vào trạng từ 'down': look DOWN on.",
        "syllables": "look down on (3 âm tiết)",
        "example_en": "It is totally impolite to look down on people in difficult circumstances.",
        "example_vi": "Thật bất lịch sự khi coi thường những người có hoàn cảnh khó khăn.",
        "unit_id": "unit_g7_lexico",
        "grade": "Lớp 7",
        "cambridge_level": "KET_A2",
        "difficulty": "hard",
        "category": "phrasal_verbs"
    },
    {
        "term": "environmentally friendly",
        "ipa": "/ɪnˌvaɪrənˈmentəli ˈfrendli/",
        "pos": "adjective",
        "meaning_vi": "thân thiện với môi trường, sinh thái",
        "vowels_detail": "Nguyên âm đôi /aɪ/, nguyên âm ngắn /e/ trong 'friend'.",
        "consonants_detail": "Cụm phụ âm /fr/ trong 'friendly', phụ âm xát /v/.",
        "phonics_note": "Trọng âm chính rơi vào: environ-MEN-tally FRIEND-ly.",
        "syllables": "en-vi-ron-men-tal-ly friend-ly (8 âm tiết)",
        "example_en": "Wave power is an environmentally friendly source of clean energy.",
        "example_vi": "Năng lượng sóng biển là một nguồn năng lượng sạch thân thiện với môi trường.",
        "unit_id": "unit10",
        "grade": "Lớp 7",
        "cambridge_level": "KET_A2",
        "difficulty": "medium",
        "category": "environment"
    },
    # High School & Word Formation (From 1000_word_formation & Grade 11-12)
    {
        "term": "mountainous",
        "ipa": "/ˈmaʊntənəs/",
        "pos": "adjective",
        "meaning_vi": "thuộc miền núi, có nhiều núi non trùng điệp",
        "vowels_detail": "Nguyên âm đôi /aʊ/ ở âm tiết đầu, âm schwa /ə/ ở hai âm tiết sau.",
        "consonants_detail": "Phụ âm mũi /m/ và /n/, kết thúc bằng phụ âm xát /s/.",
        "phonics_note": "Gốc từ MOUNTAIN + hậu tố tính từ -ous. Trọng âm: MOUN-tain-ous.",
        "syllables": "moun-tain-ous (3 âm tiết)",
        "example_en": "Snow lasts longer in mountainous regions of northwestern Vietnam.",
        "example_vi": "Tuyết đọng lại lâu hơn ở các vùng miền núi Tây Bắc Việt Nam.",
        "unit_id": "unit_wf_derived",
        "grade": "Lớp 10",
        "cambridge_level": "PET_B1",
        "difficulty": "medium",
        "category": "geography"
    },
    {
        "term": "inexplicable",
        "ipa": "/ˌɪnɪkˈsplɪkəbl/",
        "pos": "adjective",
        "meaning_vi": "không thể giải thích được, bí ẩn",
        "vowels_detail": "Nguyên âm ngắn /ɪ/ lặp lại 3 lần trong các âm tiết đầu.",
        "consonants_detail": "Cụm phụ âm 3 âm /spl/ trong 'spli', phụ âm bên /l/ ở đuôi.",
        "phonics_note": "Tiền tố phủ định IN- + gốc EXPLAIN + hậu tố -ABLE. Trọng âm: in-ex-PLI-ca-ble.",
        "syllables": "in-ex-pli-ca-ble (5 âm tiết)",
        "example_en": "His sudden change of attitude was completely inexplicable to everyone.",
        "example_vi": "Sự thay đổi thái độ đột ngột của anh ta hoàn toàn không thể giải thích nổi đối với mọi người.",
        "unit_id": "unit_wf_derived",
        "grade": "Lớp 12",
        "cambridge_level": "CAE_C1",
        "difficulty": "hard",
        "category": "psychology"
    },
    {
        "term": "pedestrian",
        "ipa": "/pəˈdestriən/",
        "pos": "noun",
        "meaning_vi": "người đi bộ",
        "vowels_detail": "Âm yếu /ə/, nguyên âm ngắn /e/ trong âm tiết có trọng âm.",
        "consonants_detail": "Cụm phụ âm /str/ trong 'stri', phụ âm bật môi /p/.",
        "phonics_note": "Trọng âm rơi vào âm tiết thứ 2: pe-DES-tri-an.",
        "syllables": "pe-des-tri-an (4 âm tiết)",
        "example_en": "Walking streets prioritize pedestrian safety and promote cleaner air.",
        "example_vi": "Các tuyến phố đi bộ ưu tiên an toàn cho người đi bộ và thúc đẩy không khí trong lành hơn.",
        "unit_id": "unit_g11_smartcity",
        "grade": "Lớp 11",
        "cambridge_level": "PET_B1",
        "difficulty": "medium",
        "category": "urban"
    },
    {
        "term": "infrastructure",
        "ipa": "/ˈɪnfrəstrʌktʃər/",
        "pos": "noun",
        "meaning_vi": "cơ sở hạ tầng (đường xá, cầu cống, mạng lưới điện)",
        "vowels_detail": "Nguyên âm ngắn /ɪ/, schwa /ə/, nguyên âm ngắn /ʌ/ trong 'struc'.",
        "consonants_detail": "Cụm phụ âm /nfr/ và /str/, kết thúc bằng phụ âm tắc xát vô thanh /tʃ/.",
        "phonics_note": "Trọng âm rơi vào âm đầu: IN-fra-struc-ture.",
        "syllables": "in-fra-struc-ture (4 âm tiết)",
        "example_en": "Modern cities require sustainable green infrastructure to thrive.",
        "example_vi": "Các thành phố hiện đại cần cơ sở hạ tầng xanh bền vững để phát triển mạnh mẽ.",
        "unit_id": "unit_g11_smartcity",
        "grade": "Lớp 11",
        "cambridge_level": "FCE_B2",
        "difficulty": "hard",
        "category": "urban"
    },
    {
        "term": "stative verb",
        "ipa": "/ˈsteɪtɪv vɜːb/",
        "pos": "grammar concept",
        "meaning_vi": "động từ trạng thái / nhận thức (không chia ở thì tiếp diễn)",
        "vowels_detail": "Nguyên âm đôi /eɪ/, nguyên âm dài /ɜː/ trong 'verb'.",
        "consonants_detail": "Phụ âm xát /v/ hữu thanh ở cả hai từ.",
        "phonics_note": "Trọng âm rơi vào âm 1: STA-tive verb.",
        "syllables": "sta-tive verb (3 âm tiết)",
        "example_en": "Verbs like believe, understand, and belong are common stative verbs.",
        "example_vi": "Các động từ như believe (tin), understand (hiểu), belong (thuộc về) là các động từ trạng thái thông dụng.",
        "unit_id": "unit_g11_grammar",
        "grade": "Lớp 11",
        "cambridge_level": "FCE_B2",
        "difficulty": "medium",
        "category": "grammar"
    }
]

for item in expanded_terms:
    vocab_dict[item['term'].lower().strip()] = item

# Re-assign IDs and format
final_vocab_list = []
for idx, (term_k, v) in enumerate(vocab_dict.items(), start=1):
    entry = dict(v)
    entry['id'] = entry.get('id', f"word_{idx}")
    if not isinstance(entry['id'], (int, str)):
        entry['id'] = idx
    final_vocab_list.append(entry)

# Write to vocabulary_db.json
with open('src/lib/data/vocabulary_db.json', 'w', encoding='utf-8') as f:
    json.dump(final_vocab_list, f, ensure_ascii=False, indent=2)

# Also sync to words.json for legacy components
with open('src/lib/data/words.json', 'w', encoding='utf-8') as f:
    json.dump(final_vocab_list, f, ensure_ascii=False, indent=2)

print(f"Generated {len(final_vocab_list)} terms in vocabulary_db.json and synchronized words.json.")

# ==============================================================================
# 3. EXAMS DATABASE (15 EXAMS COHORT-SCOPED)
# ==============================================================================
exams_list = [
    {
        "id": "ex_g3_final_term1",
        "curriculum_id": "curr_g3",
        "title": "Đề Kiểm Tra Cuối Học Kỳ 1 Tiếng Anh 3 (Tiểu Học Long Giang)",
        "description": "Đề thi học kỳ chuẩn 35 phút đánh giá 4 kỹ năng Nghe - Đọc - Viết - Nói cho học sinh Lớp 3.",
        "grade": 3,
        "format_type": "standard_45m",
        "skill_category": "listening_reading",
        "duration_minutes": 35,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Dung & Tiểu Học Long Giang",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g4_final_term1",
        "curriculum_id": "curr_g4",
        "title": "Đề Kiểm Tra Cuối Học Kỳ 1 Tiếng Anh 4 Global Success",
        "description": "Đề kiểm tra định kỳ có ma trận chuẩn Bộ GD&ĐT: Từ vựng trường học, sở thích và hoạt động hàng ngày.",
        "grade": 4,
        "format_type": "standard_45m",
        "skill_category": "listening_reading",
        "duration_minutes": 35,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Dung & Tiểu Học Long Giang",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g5_final_term1",
        "curriculum_id": "curr_g5",
        "title": "Đề Kiểm Tra Cuối Học Kỳ 1 Tiếng Anh 5 (Chuyển Cấp Lên Lớp 6)",
        "description": "Đề thi đánh giá năng lực từ vựng, ngữ pháp thì hiện tại đơn/quá khứ đơn, chuẩn bị bước vào lớp 6.",
        "grade": 5,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 35,
        "total_questions": 12,
        "pass_percentage": 65,
        "created_by": "Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g7_midterm",
        "curriculum_id": "curr_g7",
        "title": "Đề Kiểm Tra Định Kỳ Giữa Học Kỳ 1 Tiếng Anh 7 Global Success",
        "description": "Đề 45 phút chuẩn ma trận PGD: Kiểm tra kiến thức Unit 1 (Hobbies), Unit 2 (Healthy Living), Unit 3 (Community Service).",
        "grade": 7,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 60,
        "created_by": "Cô Dung (Leader)",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g7_hsg_yenlap",
        "curriculum_id": "curr_g7",
        "title": "Đề Thi Chọn Học Sinh Giỏi Cấp Huyện Lớp 7 THCS Huyện Yên Lập (Chính Thức)",
        "description": "Đề thi HSG 120 phút chính thức: 5 phần Nghe - Ngữ âm - Từ vựng & Ngữ pháp (Lexico-Grammar) - Đọc hiểu - Viết.",
        "grade": 7,
        "format_type": "advanced_hsg",
        "skill_category": "mixed",
        "duration_minutes": 90,
        "total_questions": 25,
        "pass_percentage": 70,
        "created_by": "Phòng GD&ĐT Yên Lập & Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g8_talent",
        "curriculum_id": "curr_g8",
        "title": "Đề Khảo Sát Năng Khiếu Học Sinh Giỏi Tiếng Anh Lớp 8",
        "description": "Đề thi bồi dưỡng nâng cao: Câu điều kiện loại 1 & 2, danh động từ, mệnh đề quan hệ và bài tập từ loại.",
        "grade": 8,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 60,
        "total_questions": 20,
        "pass_percentage": 70,
        "created_by": "Tổ Chuyên Môn THCS",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g9_vao_10",
        "curriculum_id": "curr_g9",
        "title": "Đề Thi Tuyển Sinh Vào Lớp 10 THPT Công Lập 2026 (Bộ 80 Đề Chọn Lọc)",
        "description": "Đề trắc nghiệm 40 câu bám sát cấu trúc tuyển sinh 10 Sở GD: Ngữ âm, trọng âm, tìm lỗi sai, đọc điền từ, đọc hiểu và biến đổi câu.",
        "grade": 9,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 60,
        "total_questions": 25,
        "pass_percentage": 70,
        "created_by": "Thầy Trần Mai & Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g10_hk1_gdpt2018",
        "curriculum_id": "curr_g10",
        "title": "Đề Thi Cuối Học Kỳ 1 Tiếng Anh 10 Chuẩn GDPT 2018 Mới",
        "description": "Đề kiểm tra học kỳ 1 lớp 10 theo định hướng phát triển phẩm chất và năng lực giao tiếp.",
        "grade": 10,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 50,
        "total_questions": 20,
        "pass_percentage": 65,
        "created_by": "Tổ Tiếng Anh THPT",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g11_cities_future",
        "curriculum_id": "curr_g11",
        "title": "Khảo Sát Chuyên Đề Unit 3: Cities of the Future (Tiếng Anh 11)",
        "description": "Đề thi chuyên đề: Đô thị thông minh, ngữ pháp Stative Verbs, Gerunds và bài đọc phát triển bền vững.",
        "grade": 11,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 65,
        "created_by": "Mr. Johnathan Miller",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g11_hsg_tinh",
        "curriculum_id": "curr_g11",
        "title": "Đề Cương & Thi Thử Chọn Học Sinh Giỏi Lớp 11 THPT",
        "description": "Bộ đề thi học sinh giỏi THPT: Trọng âm 3-4 âm tiết, thành ngữ (idioms), cụm động từ (phrasal verbs) và cấu trúc đảo ngữ.",
        "grade": 11,
        "format_type": "advanced_hsg",
        "skill_category": "mixed",
        "duration_minutes": 90,
        "total_questions": 25,
        "pass_percentage": 70,
        "created_by": "Hội Đồng Khảo Thí THPT",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g12_hsg_quangnam",
        "curriculum_id": "curr_g12",
        "title": "Kỳ Thi Chọn Học Sinh Giỏi Cấp Tỉnh Lớp 12 THPT (Tỉnh Quảng Nam - Mã Đề 180)",
        "description": "Đề thi chính thức HSG Lớp 12: Đọc hiểu học thuật, Word Formation nâng cao, sửa lỗi sai văn bản và câu đảo ngữ.",
        "grade": 12,
        "format_type": "advanced_hsg",
        "skill_category": "academic",
        "duration_minutes": 90,
        "total_questions": 30,
        "pass_percentage": 75,
        "created_by": "Sở GD&ĐT Quảng Nam",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_g12_thptqg_chuan",
        "curriculum_id": "curr_g12",
        "title": "Đề Ôn Thi Tốt Nghiệp THPT & Xét Tuyển Đại Học (4000 Bài Tập Chọn Lọc)",
        "description": "Đề thi chuẩn 50 câu form BGD: Phân loại học sinh từ mức 7.0 đến 9.0+, kỹ thuật giải nhanh đọc hiểu và câu hỏi phân hóa.",
        "grade": 12,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 60,
        "total_questions": 30,
        "pass_percentage": 70,
        "created_by": "Cô Dung & Thầy Mai",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_cambridge_ket_a2",
        "curriculum_id": "curr_ket",
        "title": "Cambridge English: A2 Key (KET) Full Mock Examination",
        "description": "Đề thi mô phỏng định dạng chuẩn Cambridge ESOL quốc tế: Reading and Writing Parts 1-7.",
        "grade": 7,
        "format_type": "standard_45m",
        "skill_category": "cambridge",
        "duration_minutes": 60,
        "total_questions": 20,
        "pass_percentage": 70,
        "created_by": "Cambridge Assessment English Team",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_ielts_diagnostic",
        "curriculum_id": "curr_ielts",
        "title": "IELTS Academic Diagnostic Assessment (CEFR B2 - C1)",
        "description": "Bài khảo sát định vị trình độ IELTS 4 kỹ năng: Phân tích biểu đồ Writing Task 1, bài đọc học thuật Reading Section 2.",
        "grade": 11,
        "format_type": "advanced_hsg",
        "skill_category": "academic",
        "duration_minutes": 75,
        "total_questions": 20,
        "pass_percentage": 65,
        "created_by": "Mr. Johnathan Miller (IELTS Examiner)",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    },
    {
        "id": "ex_quick_quiz_15m",
        "curriculum_id": "curr_g7",
        "title": "Bài Kiểm Tra 15 Phút: Khởi Động Từ Vựng & Phonics",
        "description": "Kiểm tra phản xạ nhanh phát âm nguyên âm đôi, trọng âm từ và nghĩa từ vựng cơ bản.",
        "grade": 7,
        "format_type": "quick_quiz",
        "skill_category": "vocabulary",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 70,
        "created_by": "Cô Dung",
        "is_published": 1,
        "created_at": "2026-09-25 10:00:00"
    }
]

with open('src/lib/data/exams.json', 'w', encoding='utf-8') as f:
    json.dump(exams_list, f, ensure_ascii=False, indent=2)
print(f"Generated {len(exams_list)} exams in src/lib/data/exams.json.")

# ==============================================================================
# 4. QUESTIONS BANK (INGESTING DRIVE TESTS & HSG EXAMS)
# ==============================================================================
questions_bank = [
    # --- YEN LAP G7 HSG EXAM QUESTIONS (Directly from yen_lap_g7.docx) ---
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 1,
        "grade": 7,
        "skill": "phonics",
        "type": "multiple_choice",
        "prompt": "Choose the word whose underlined part is pronounced differently: c<u>oa</u>ch, c<u>a</u>re, d<u>e</u>cide, sc<u>a</u>red",
        "options_json": json.dumps(["A. coach", "B. care", "C. decide", "D. scared"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: chữ 'c' trong 'decide' phát âm là /s/, trong khi 'coach', 'care', 'scared' đều phát âm là /k/.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 2,
        "grade": 7,
        "skill": "phonics",
        "type": "multiple_choice",
        "prompt": "Choose the word whose underlined part is pronounced differently: r<u>ea</u>lize, r<u>ea</u>der, s<u>ea</u>son, ov<u>er</u>seas",
        "options_json": json.dumps(["A. realize", "B. reader", "C. season", "D. overseas"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'ea' trong 'realize' phát âm là nguyên âm đôi /ɪə/ (/ˈrɪəlaɪz/), còn 'reader', 'season', 'overseas' đều phát âm là nguyên âm dài /iː/.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 3,
        "grade": 7,
        "skill": "phonics",
        "type": "multiple_choice",
        "prompt": "Choose the word whose -ed pronounced differently: nak<u>ed</u>, intend<u>ed</u>, wretch<u>ed</u>, plough<u>ed</u>",
        "options_json": json.dumps(["A. naked", "B. intended", "C. wretched", "D. ploughed"]),
        "correct_answer": "D",
        "explanation": "Đáp án D: 'ploughed' phát âm đuôi -ed là /d/ (/plaʊd/). Các từ 'naked' /ˈneɪkɪd/, 'intended' /ɪnˈtendɪd/, 'wretched' /ˈretʃɪd/ đều phát âm đuôi -ed là /ɪd/.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 4,
        "grade": 7,
        "skill": "phonics_stress",
        "type": "multiple_choice",
        "prompt": "Choose the word whose stress pattern is different: telephone, directory, computer, appliance",
        "options_json": json.dumps(["A. telephone", "B. directory", "C. computer", "D. appliance"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'telephone' có trọng âm rơi vào âm tiết 1 (TE-le-phone /ˈtelɪfəʊn/), ba từ còn lại đều có trọng âm rơi vào âm tiết 2: di-REC-tory, com-PU-ter, ap-PLI-ance.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 5,
        "grade": 7,
        "skill": "phonics_stress",
        "type": "multiple_choice",
        "prompt": "Choose the word whose stress pattern is different: affect, affirm, study, collapse",
        "options_json": json.dumps(["A. affect", "B. affirm", "C. study", "D. collapse"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: 'study' là động từ 2 âm tiết có trọng âm rơi vào âm 1 (STU-dy /ˈstʌdi/). Ba từ còn lại đều có trọng âm rơi vào âm 2: af-FECT, af-FIRM, col-LAPSE.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 6,
        "grade": 7,
        "skill": "lexico_grammar",
        "type": "multiple_choice",
        "prompt": "Wave energy is a source of ______ energy.",
        "options_json": json.dumps(["A. environment friendly", "B. environmental friendly", "C. environmentally friendly", "D. environmentally friendliness"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: Cụm tính từ ghép 'environmentally friendly' (trạng từ + tính từ) có nghĩa là thân thiện với môi trường.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 7,
        "grade": 7,
        "skill": "lexico_grammar",
        "type": "multiple_choice",
        "prompt": "Do you want to know how you can ______ healthy?",
        "options_json": json.dumps(["A. make", "B. have", "C. stay", "D. create"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: Cụm cố định 'stay healthy' có nghĩa là giữ gìn sức khỏe / sống khỏe mạnh.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 8,
        "grade": 7,
        "skill": "grammar",
        "type": "multiple_choice",
        "prompt": "Linh often uses her headphones when listening to music ______ her parents don't like loud noise.",
        "options_json": json.dumps(["A. so", "B. but", "C. because", "D. and"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: Mệnh đề sau chỉ nguyên nhân lý do ('her parents don't like loud noise') -> dùng liên từ 'because'.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 9,
        "grade": 7,
        "skill": "lexico_grammar",
        "type": "multiple_choice",
        "prompt": "______, many teenagers say they don't like football - one of the world's most popular games.",
        "options_json": json.dumps(["A. Surprise", "B. Surprising", "C. Surprisingly", "D. Surprised"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: Dùng trạng từ đứng đầu câu trước dấu phẩy để bổ nghĩa cho cả câu ('Surprisingly' = Thật đáng ngạc nhiên là).",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 10,
        "grade": 7,
        "skill": "lexico_grammar",
        "type": "multiple_choice",
        "prompt": "You should pay more ______ in class to understand the lesson thoroughly.",
        "options_json": json.dumps(["A. part", "B. care", "C. notice", "D. attention"]),
        "correct_answer": "D",
        "explanation": "Đáp án D: Cụm thành ngữ 'pay attention to' có nghĩa là chú ý, tập trung.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 11,
        "grade": 7,
        "skill": "phrasal_verbs",
        "type": "multiple_choice",
        "prompt": "My mother worries who will ______ our house when we are away for our summer holidays.",
        "options_json": json.dumps(["A. see", "B. take after", "C. take care of", "D. look at"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: 'take care of' = chăm sóc, trông nom nhà cửa khi đi vắng.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 12,
        "grade": 7,
        "skill": "structures",
        "type": "multiple_choice",
        "prompt": "Wearing a band over the wrist allows players ______ safely.",
        "options_json": json.dumps(["A. playing", "B. to play", "C. play", "D. plays"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Cấu trúc 'allow somebody TO V' (cho phép ai làm gì) -> to play.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 13,
        "grade": 7,
        "skill": "lexico_grammar",
        "type": "multiple_choice",
        "prompt": "In my opinion, nuclear power is not only expensive but also ______ to our living environment.",
        "options_json": json.dumps(["A. danger", "B. dangerous", "C. risk", "D. disaster"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Sau 'be' và song hành với tính từ 'expensive' trong cấu trúc 'not only... but also...', ta cần tính từ 'dangerous'.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 14,
        "grade": 7,
        "skill": "phrasal_verbs",
        "type": "multiple_choice",
        "prompt": "It's considered very rude to ______ poorer people in the community.",
        "options_json": json.dumps(["A. look up to", "B. look after", "C. look down on", "D. look for"]),
        "correct_answer": "C",
        "explanation": "Đáp án C: Cụm động từ 'look down on' có nghĩa là coi thường, khinh miệt.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 15,
        "grade": 7,
        "skill": "advanced_grammar",
        "type": "multiple_choice",
        "prompt": "______ extremely tired after the long journey, I went straight to bed last night.",
        "options_json": json.dumps(["A. Felt", "B. Feeling", "C. To feel", "D. Feel"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Mệnh đề phân từ hiện tại (Present Participle Clause 'Feeling') rút gọn từ 'Because I felt extremely tired...'.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 16,
        "grade": 7,
        "skill": "general_knowledge",
        "type": "multiple_choice",
        "prompt": "______ is the hottest planet in the solar system with surface temperatures exceeding 460°C.",
        "options_json": json.dumps(["A. Mercury", "B. Venus", "C. Mars", "D. Uranus"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Sao Kim (Venus) là hành tinh nóng nhất trong hệ mặt trời do hiệu ứng nhà kính dày đặc từ khí CO2.",
        "cambridge_level": "KET_A2"
    },
    {
        "exam_id": "ex_g7_hsg_yenlap",
        "question_index": 17,
        "grade": 7,
        "skill": "grammar",
        "type": "multiple_choice",
        "prompt": "The younger you are, ______ it is to acquire natural native-like pronunciation.",
        "options_json": json.dumps(["A. easier", "B. the easier", "C. easily", "D. the easily"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Cấu trúc so sánh kép (The + comparative, the + comparative) -> the easier.",
        "cambridge_level": "KET_A2"
    },
    # --- GRADE 3-5 PRIMARY QUESTIONS (Directly from g3_ck1, g4_ck1, g5_ck1) ---
    {
        "exam_id": "ex_g3_final_term1",
        "question_index": 1,
        "grade": 3,
        "skill": "reading_vocab",
        "type": "multiple_choice",
        "prompt": "Let's go to the ______ to read interesting fairy tales.",
        "options_json": json.dumps(["A. library", "B. classroom", "C. gym", "D. canteen"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'library' là thư viện, nơi học sinh đến để đọc sách truyện.",
        "cambridge_level": "STARTERS"
    },
    {
        "exam_id": "ex_g3_final_term1",
        "question_index": 2,
        "grade": 3,
        "skill": "vocabulary",
        "type": "multiple_choice",
        "prompt": "I keep my pens, pencils and eraser neatly inside my ______.",
        "options_json": json.dumps(["A. pencil case", "B. desk", "C. chair", "D. ruler"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'pencil case' là hộp đựng bút.",
        "cambridge_level": "STARTERS"
    },
    {
        "exam_id": "ex_g4_final_term1",
        "question_index": 1,
        "grade": 4,
        "skill": "reading_vocab",
        "type": "multiple_choice",
        "prompt": "What do you like doing in your free time? - I love ______ shuttlecock with my classmates.",
        "options_json": json.dumps(["A. play", "B. playing", "C. plays", "D. played"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Sau động từ chỉ sở thích 'love/like' ta dùng danh động từ V-ing -> playing.",
        "cambridge_level": "MOVERS"
    },
    {
        "exam_id": "ex_g5_final_term1",
        "question_index": 1,
        "grade": 5,
        "skill": "grammar",
        "type": "multiple_choice",
        "prompt": "Where did you go last summer holiday? - We ______ Phu Quoc Island by plane.",
        "options_json": json.dumps(["A. visit", "B. visited", "C. visiting", "D. visits"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Câu hỏi ở thì quá khứ đơn 'did you go' -> câu trả lời dùng động từ quá khứ 'visited'.",
        "cambridge_level": "FLYERS"
    },
    # --- GRADE 9 VAO 10 QUESTIONS (From 80 Đề Vào 10) ---
    {
        "exam_id": "ex_g9_vao_10",
        "question_index": 1,
        "grade": 9,
        "skill": "phonics",
        "type": "multiple_choice",
        "prompt": "Choose the word whose underlined part is pronounced differently: poll<u>u</u>tion, prod<u>u</u>ce, red<u>u</u>ce, comm<u>u</u>nity",
        "options_json": json.dumps(["A. pollution", "B. produce", "C. reduce", "D. community"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: chữ 'u' trong 'pollution' phát âm là /uː/, còn trong 'produce' /juː/, 'reduce' /juː/, 'community' /juː/ đều có bán nguyên âm /j/.",
        "cambridge_level": "PET_B1"
    },
    {
        "exam_id": "ex_g9_vao_10",
        "question_index": 2,
        "grade": 9,
        "skill": "grammar",
        "type": "multiple_choice",
        "prompt": "If teenagers ______ more about environmental protection, our cities would be much cleaner.",
        "options_json": json.dumps(["A. care", "B. cared", "C. had cared", "D. will care"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Mệnh đề chính có 'would be' (loại 2) -> Mệnh đề IF chia quá khứ đơn: cared.",
        "cambridge_level": "PET_B1"
    },
    {
        "exam_id": "ex_g9_vao_10",
        "question_index": 3,
        "grade": 9,
        "skill": "sentence_transformation",
        "type": "multiple_choice",
        "prompt": "\"I will submit my English presentation tomorrow morning,\" said Nga. Choose the correct reported sentence:",
        "options_json": json.dumps([
            "A. Nga said she will submit her English presentation tomorrow morning.",
            "B. Nga said she would submit her English presentation the following morning.",
            "C. Nga said she would submit my English presentation tomorrow morning.",
            "D. Nga told she submitted her English presentation the following morning."
        ]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Lùi thì 'will' thành 'would', đổi đại từ 'my' thành 'her', đổi trạng từ 'tomorrow morning' thành 'the following morning'.",
        "cambridge_level": "PET_B1"
    },
    # --- GRADE 11 & 12 HSG QUESTIONS (From hsg_lop_11 & hsg_lop_12_quang_nam) ---
    {
        "exam_id": "ex_g11_cities_future",
        "question_index": 1,
        "grade": 11,
        "skill": "vocabulary",
        "type": "multiple_choice",
        "prompt": "The local city council built a car-free ______ zone to encourage walking and reduce urban emissions.",
        "options_json": json.dumps(["A. pedestrian", "B. dweller", "C. sensor", "D. infrastructure"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'pedestrian zone' là khu phố đi bộ cấm các phương tiện cơ giới.",
        "cambridge_level": "PET_B1"
    },
    {
        "exam_id": "ex_g11_cities_future",
        "question_index": 2,
        "grade": 11,
        "skill": "grammar",
        "type": "multiple_choice",
        "prompt": "Environmental scientists firmly ______ that renewable energy is vital for sustainable smart cities.",
        "options_json": json.dumps(["A. believe", "B. are believing", "C. was believing", "D. have been believing"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'believe' là động từ trạng thái (stative verb), không được chia ở các thì tiếp diễn.",
        "cambridge_level": "FCE_B2"
    },
    {
        "exam_id": "ex_g12_hsg_quangnam",
        "question_index": 1,
        "grade": 12,
        "skill": "sentence_transformation",
        "type": "multiple_choice",
        "prompt": "Our computers crashed. This caused all the trouble. Choose the closest sentence in meaning:",
        "options_json": json.dumps([
            "A. That our computers crashed resulted from all the trouble.",
            "B. Owing to all the trouble, our computers crashed.",
            "C. The trouble all stemmed from our computers crashing.",
            "D. Our computers crashing was really annoying."
        ]),
        "correct_answer": "C",
        "explanation": "Đáp án C: Cụm 'stem from' có nghĩa là 'bắt nguồn từ, xuất phát từ' -> Rắc rối đều bắt nguồn từ việc máy tính bị sập.",
        "cambridge_level": "CAE_C1"
    },
    {
        "exam_id": "ex_g12_hsg_quangnam",
        "question_index": 2,
        "grade": 12,
        "skill": "sentence_transformation",
        "type": "multiple_choice",
        "prompt": "Anna is Ken's boss. His harsh criticism of her may have a bad effect on him. Choose the best sentence:",
        "options_json": json.dumps([
            "A. Ken's criticism of Anna may be rooted in the fact that she is his boss.",
            "B. Ken's criticism of Anna may be a matter of concern to her now that she's his boss.",
            "C. Ken's criticism of Anna may be put into effect because she's his boss.",
            "D. Ken's criticism of Anna may rebound on him now that she's his boss."
        ]),
        "correct_answer": "D",
        "explanation": "Đáp án D: Thành ngữ 'rebound on somebody' có nghĩa là phản tác dụng, gây hậu quả xấu ngược lại cho chính người đó.",
        "cambridge_level": "CAE_C1"
    },
    {
        "exam_id": "ex_g12_thptqg_chuan",
        "question_index": 1,
        "grade": 12,
        "skill": "word_formation",
        "type": "multiple_choice",
        "prompt": "The professor's lecture on quantum physics was completely out of my ______.",
        "options_json": json.dumps(["A. deep", "B. depth", "C. deeply", "D. deepen"]),
        "correct_answer": "B",
        "explanation": "Đáp án B: Thành ngữ 'out of my depth' có nghĩa là vượt quá tầm hiểu biết / năng lực của tôi.",
        "cambridge_level": "FCE_B2"
    },
    {
        "exam_id": "ex_g12_thptqg_chuan",
        "question_index": 2,
        "grade": 12,
        "skill": "phrasal_verbs",
        "type": "multiple_choice",
        "prompt": "The firefighters fought valiantly until the forest blaze was completely ______.",
        "options_json": json.dumps(["A. put out", "B. put off", "C. put away", "D. put up with"]),
        "correct_answer": "A",
        "explanation": "Đáp án A: 'put out' có nghĩa là dập tắt (đám cháy, ngọn lửa). 'put off' là hoãn lại.",
        "cambridge_level": "FCE_B2"
    }
]

# Ensure unique IDs
for idx, q in enumerate(questions_bank, start=1):
    q['id'] = idx

with open('src/lib/data/questions.json', 'w', encoding='utf-8') as f:
    json.dump(questions_bank, f, ensure_ascii=False, indent=2)
print(f"Generated {len(questions_bank)} verified questions in src/lib/data/questions.json.")

# ==============================================================================
# 5. SYNC EVERYTHING INTO RELATIONAL SQLITE (data/tienganh7.db)
# ==============================================================================
conn = sqlite3.connect('data/tienganh7.db')
cur = conn.cursor()

# Create tables
cur.executescript('''
DROP TABLE IF EXISTS words;
DROP TABLE IF EXISTS grammar_topics;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS exam_questions;

CREATE TABLE words (
    id TEXT PRIMARY KEY,
    term TEXT NOT NULL,
    ipa TEXT,
    pos TEXT,
    meaning_vi TEXT,
    vowels_detail TEXT,
    consonants_detail TEXT,
    phonics_note TEXT,
    syllables TEXT,
    example_en TEXT,
    example_vi TEXT,
    unit_id TEXT,
    grade TEXT,
    cambridge_level TEXT,
    difficulty TEXT,
    category TEXT
);

CREATE TABLE grammar_topics (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    curriculum_unit TEXT,
    category TEXT,
    cefr_level TEXT,
    summary TEXT,
    formula_json TEXT,
    usage_json TEXT,
    signal_words_json TEXT,
    phonics_rules TEXT,
    common_mistakes TEXT,
    examples_json TEXT,
    practice_questions_json TEXT
);

CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    curriculum_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    grade INTEGER,
    format_type TEXT NOT NULL,
    skill_category TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 45,
    total_questions INTEGER DEFAULT 15,
    pass_percentage INTEGER DEFAULT 60,
    created_by TEXT,
    is_published INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_questions (
    id INTEGER PRIMARY KEY,
    exam_id TEXT NOT NULL,
    question_index INTEGER,
    grade INTEGER,
    skill TEXT,
    type TEXT,
    prompt TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    cambridge_level TEXT,
    FOREIGN KEY(exam_id) REFERENCES exams(id)
);
''')

# Clear and reload words
cur.execute('DELETE FROM words;')
for w in final_vocab_list:
    cur.execute('''
    INSERT INTO words (
        id, term, ipa, pos, meaning_vi, vowels_detail, consonants_detail, phonics_note, syllables, example_en, example_vi, unit_id, grade, cambridge_level, difficulty, category
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        str(w.get('id')), w.get('term'), w.get('ipa'), w.get('pos'), w.get('meaning_vi'),
        w.get('vowels_detail'), w.get('consonants_detail'), w.get('phonics_note'), w.get('syllables'),
        w.get('example_en'), w.get('example_vi'), w.get('unit_id'), w.get('grade'),
        w.get('cambridge_level'), w.get('difficulty'), w.get('category')
    ))

# Clear and reload grammar_topics
cur.execute('DELETE FROM grammar_topics;')
for g in grammar_topics:
    cur.execute('''
    INSERT INTO grammar_topics (
        id, topic, grade_level, curriculum_unit, category, cefr_level, summary, formula_json, usage_json, signal_words_json, phonics_rules, common_mistakes, examples_json, practice_questions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        g['id'], g['topic'], g['grade_level'], g.get('curriculum_unit'),
        g.get('category'), g.get('cefr_level'), g.get('summary'),
        json.dumps(g.get('formula', {}), ensure_ascii=False),
        json.dumps(g.get('usage', []), ensure_ascii=False),
        json.dumps(g.get('signal_words', []), ensure_ascii=False),
        g.get('phonics_rules'), g.get('common_mistakes'),
        json.dumps(g.get('examples', []), ensure_ascii=False),
        json.dumps(g.get('practice_questions', []), ensure_ascii=False)
    ))

# Clear and reload exams
cur.execute('DELETE FROM exams;')
for e in exams_list:
    cur.execute('''
    INSERT INTO exams (
        id, curriculum_id, title, description, grade, format_type, skill_category, duration_minutes, total_questions, pass_percentage, created_by, is_published, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        e['id'], e['curriculum_id'], e['title'], e['description'], e['grade'],
        e['format_type'], e['skill_category'], e['duration_minutes'], e['total_questions'],
        e['pass_percentage'], e['created_by'], e['is_published'], e['created_at']
    ))

# Clear and reload exam_questions
cur.execute('DELETE FROM exam_questions;')
for q in questions_bank:
    cur.execute('''
    INSERT INTO exam_questions (
        id, exam_id, question_index, grade, skill, type, prompt, options_json, correct_answer, explanation, cambridge_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        q['id'], q['exam_id'], q['question_index'], q.get('grade', 7),
        q.get('skill', 'general'), q.get('type', 'multiple_choice'),
        q['prompt'], q['options_json'], q['correct_answer'],
        q.get('explanation'), q.get('cambridge_level')
    ))

conn.commit()

# Print stats
word_cnt = cur.execute('SELECT COUNT(*) FROM words;').fetchone()[0]
gram_cnt = cur.execute('SELECT COUNT(*) FROM grammar_topics;').fetchone()[0]
exam_cnt = cur.execute('SELECT COUNT(*) FROM exams;').fetchone()[0]
ques_cnt = cur.execute('SELECT COUNT(*) FROM exam_questions;').fetchone()[0]

conn.close()

print(f"=== FULL MODULAR SYSTEM BUILD COMPLETE ===")
print(f"SQLite DB Summary:")
print(f"  - words table: {word_cnt} records")
print(f"  - grammar_topics table: {gram_cnt} records")
print(f"  - exams table: {exam_cnt} records")
print(f"  - exam_questions table: {ques_cnt} records")
