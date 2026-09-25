import json
import os
import sys
import sqlite3

sys.stdout.reconfigure(encoding='utf-8')

print("=========================================================================")
print("=== SCRIPT: COMPLETE 5M, 15M, 45M TESTS MATRIX ACROSS ALL GRADES ===")
print("=========================================================================\n")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
LIB_DATA_DIR = os.path.join(BASE_DIR, 'src', 'lib', 'data')
DB_PATH = os.path.join(DATA_DIR, 'tienganh7.db')

exams_path = os.path.join(LIB_DATA_DIR, 'exams.json')
questions_path = os.path.join(LIB_DATA_DIR, 'questions.json')

with open(exams_path, 'r', encoding='utf-8') as f:
    exams = json.load(f)

with open(questions_path, 'r', encoding='utf-8') as f:
    questions = json.load(f)

print(f"Current exams: {len(exams)}")
print(f"Current questions: {len(questions)}")

# Map of existing exams
exam_ids = {e['id'] for e in exams}
int_ids = []
for q in questions:
    try:
        int_ids.append(int(q.get('id', 0)))
    except:
        pass
max_q_id = max(int_ids or [0])

new_exams_def = [
    # ---------------- LỚP 1 ----------------
    {
        "id": "ex_g1_quick_5m",
        "curriculum_id": "curr_g1",
        "title": "Khởi Động 5 Phút: Bảng Chữ Cái & Màu Sắc (Lớp 1)",
        "description": "5 câu trắc nghiệm nhanh khởi động: Nhận diện chữ cái tiếng Anh Phonics A-B-C và các màu sắc cơ bản red, blue, yellow.",
        "grade": 1,
        "format_type": "quick_5m",
        "skill_category": "vocabulary",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("What colour is the apple? It is ________.", ["A. red", "B. pen", "C. book", "D. cat"], "A", "Quả táo màu đỏ -> 'red' (màu đỏ).", "Starters", "vocabulary"),
            ("Which letter comes first in the alphabet?", ["A. B", "B. A", "C. C", "D. D"], "B", "Chữ cái đầu tiên trong bảng chữ cái tiếng Anh là chữ 'A'.", "Starters", "phonics"),
            ("Choose the correct word for số 1:", ["A. one", "B. two", "C. three", "D. four"], "A", "Số 1 trong tiếng Anh là 'one'.", "Starters", "vocabulary"),
            ("What is this? It is a ________. (🐱)", ["A. dog", "B. cat", "C. bird", "D. fish"], "B", "Con mèo là 'cat'.", "Starters", "vocabulary"),
            ("What colour is the sky? It is ________.", ["A. yellow", "B. green", "C. blue", "D. red"], "C", "Bầu trời màu xanh dương -> 'blue'.", "Starters", "vocabulary")
        ]
    },
    {
        "id": "ex_g1_quick_15m",
        "curriculum_id": "curr_g1",
        "title": "Kiểm Tra 15 Phút: Đồ Dùng Học Tập & Số Đếm 1-10 (Lớp 1)",
        "description": "Kiểm tra 15 phút thường xuyên: Nhận biết đồ dùng học tập pen, pencil, book, ruler và đếm số 1 đến 10.",
        "grade": 1,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("I write with a ________.", ["A. pen", "B. dog", "C. ball", "D. chair"], "A", "Tôi viết bằng cây bút -> 'pen'.", "Starters", "vocabulary"),
            ("How many fingers on one hand? -> ________.", ["A. three", "B. four", "C. five", "D. six"], "C", "Một bàn tay có 5 ngón -> 'five'.", "Starters", "vocabulary"),
            ("Open your ________, please!", ["A. cat", "B. book", "C. sun", "D. fish"], "B", "Xin mời mở sách ra -> 'Open your book'.", "Starters", "vocabulary"),
            ("What colour is a banana? It is ________.", ["A. yellow", "B. red", "C. blue", "D. black"], "A", "Quả chuối có màu vàng -> 'yellow'.", "Starters", "vocabulary"),
            ("This is my ________. (🐶)", ["A. dog", "B. cat", "C. bird", "D. duck"], "A", "Con chó là 'dog'.", "Starters", "vocabulary"),
            ("Two + Three = ________.", ["A. four", "B. five", "C. six", "D. seven"], "B", "2 + 3 = 5 ('five').", "Starters", "vocabulary"),
            ("Stand ________, please!", ["A. up", "B. down", "C. in", "D. on"], "A", "Đứng lên là 'Stand up'.", "Starters", "grammar"),
            ("Sit ________, please!", ["A. down", "B. up", "C. to", "D. at"], "A", "Ngồi xuống là 'Sit down'.", "Starters", "grammar"),
            ("Is it a ruler? -> Yes, it ________.", ["A. is", "B. are", "C. am", "D. be"], "A", "Câu trả lời khẳng định: 'Yes, it is.'", "Starters", "grammar"),
            ("Goodbye! See you ________!", ["A. later", "B. hello", "C. morning", "D. night"], "A", "Chào tạm biệt, hẹn gặp lại -> 'See you later'.", "Starters", "communication")
        ]
    },
    {
        "id": "ex_g1_standard_45m",
        "curriculum_id": "curr_g1",
        "title": "Đề Kiểm Tra Định Kỳ 45 Phút - Học Kỳ 1 Tiếng Anh Lớp 1",
        "description": "Đề thi định kỳ 45 phút chuẩn kiến thức GDPT 2018 Lớp 1: Chữ cái Phonics, gia đình, màu sắc, trường lớp và động vật nuôi.",
        "grade": 1,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Hello, my name ________ Nam.", ["A. is", "B. am", "C. are", "D. be"], "A", "My name + is: 'My name is Nam.'", "Starters", "grammar"),
            ("How are you? -> I am ________, thank you.", ["A. fine", "B. five", "C. four", "D. nine"], "A", "Hỏi thăm sức khỏe: 'I am fine, thank you.'", "Starters", "communication"),
            ("Who is this? -> This is my ________. (Mẹ)", ["A. mother", "B. father", "C. brother", "D. sister"], "A", "Mẹ trong tiếng Anh là 'mother'.", "Starters", "vocabulary"),
            ("Who is this? -> This is my ________. (Bố)", ["A. father", "B. mother", "C. sister", "D. baby"], "A", "Bố trong tiếng Anh là 'father'.", "Starters", "vocabulary"),
            ("The sun is ________ and bright.", ["A. yellow", "B. black", "C. purple", "D. brown"], "A", "Mặt trời màu vàng và tỏa sáng -> 'yellow'.", "Starters", "vocabulary"),
            ("How old are you? -> I am six years ________.", ["A. old", "B. young", "C. new", "D. age"], "A", "Hỏi tuổi: 'I am six years old.'", "Starters", "grammar"),
            ("Look at the ________ in the pond. (🦆)", ["A. duck", "B. lion", "C. tiger", "D. monkey"], "A", "Con vịt là 'duck'.", "Starters", "vocabulary"),
            ("What is your favourite toy? -> I like my ________. (🚗)", ["A. car", "B. doll", "C. ball", "D. robot"], "A", "Chiếc xe ô tô đồ chơi là 'car'.", "Starters", "vocabulary"),
            ("Point to your ________. (Mắt)", ["A. eyes", "B. ears", "C. nose", "D. mouth"], "A", "Đôi mắt là 'eyes'.", "Starters", "vocabulary"),
            ("Point to your ________. (Mũi)", ["A. nose", "B. eyes", "C. legs", "D. arms"], "A", "Cái mũi là 'nose'.", "Starters", "vocabulary"),
            ("One, two, three, ________, five.", ["A. four", "B. six", "C. eight", "D. ten"], "A", "Thứ tự đếm: 1, 2, 3, 4 ('four'), 5.", "Starters", "vocabulary"),
            ("Is it a pencil? -> No, it ________ not.", ["A. is", "B. are", "C. am", "D. be"], "A", "Dạng phủ định: 'No, it is not.'", "Starters", "grammar"),
            ("Show me your ________ hand.", ["A. right", "B. green", "C. book", "D. run"], "A", "Tay phải là 'right hand'.", "Starters", "vocabulary"),
            ("A big ________ in the zoo. (🐘)", ["A. elephant", "B. ant", "C. bee", "D. fly"], "A", "Con voi là 'elephant'.", "Starters", "vocabulary"),
            ("Good night, Mum! -> Good ________, dear!", ["A. night", "B. morning", "C. afternoon", "D. evening"], "A", "Chúc ngủ ngon đáp lại là 'Good night'.", "Starters", "communication")
        ]
    },

    # ---------------- LỚP 2 ----------------
    {
        "id": "ex_g2_quick_5m",
        "curriculum_id": "curr_g2",
        "title": "Khởi Động 5 Phút: Phonics & Bộ Phận Cơ Thể (Lớp 2)",
        "description": "5 câu trắc nghiệm nhanh: Nhận diện phát âm Phonics phụ âm đầu và từ vựng các bộ phận cơ thể head, shoulders, knees, toes.",
        "grade": 2,
        "format_type": "quick_5m",
        "skill_category": "vocabulary",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Touch your ________! (Đầu)", ["A. head", "B. hand", "C. foot", "D. arm"], "A", "Cái đầu là 'head'.", "Starters", "vocabulary"),
            ("I can see with my two ________.", ["A. eyes", "B. ears", "C. hands", "D. feet"], "A", "Nhìn bằng đôi mắt -> 'eyes'.", "Starters", "vocabulary"),
            ("Which word begins with the /b/ sound?", ["A. ball", "B. cat", "C. dog", "D. apple"], "A", "Từ 'ball' bắt đầu bằng âm /b/.", "Starters", "phonics"),
            ("Choose the missing number: 10, 11, ________, 13.", ["A. twelve", "B. fourteen", "C. fifteen", "D. sixteen"], "A", "Số 12 là 'twelve'.", "Starters", "vocabulary"),
            ("Can you swim? -> Yes, I ________.", ["A. can", "B. do", "C. am", "D. have"], "A", "Trả lời câu hỏi Can you: 'Yes, I can.'", "Starters", "grammar")
        ]
    },
    {
        "id": "ex_g2_quick_15m",
        "curriculum_id": "curr_g2",
        "title": "Kiểm Tra 15 Phút: Động Vật Nuôi & Thức Ăn Yêu Thích (Lớp 2)",
        "description": "Kiểm tra 15 phút: Từ vựng đồ ăn, thức uống pizza, milk, juice, bread và các động tác hành động run, jump, sing.",
        "grade": 2,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("I like to drink fresh ________.", ["A. milk", "B. bread", "C. rice", "D. meat"], "A", "Đồ uống là sữa -> 'milk'.", "Starters", "vocabulary"),
            ("The rabbit likes eating ________.", ["A. carrots", "B. fish", "C. bones", "D. meat"], "A", "Thỏ thích ăn cà rốt -> 'carrots'.", "Starters", "vocabulary"),
            ("Birds can ________ in the sky.", ["A. fly", "B. swim", "C. read", "D. write"], "A", "Chim có thể bay -> 'fly'.", "Starters", "vocabulary"),
            ("Do you like ice cream? -> Yes, I ________.", ["A. do", "B. can", "C. am", "D. like"], "A", "Do you like: 'Yes, I do.'", "Starters", "grammar"),
            ("How many chairs are there? -> There ________ four chairs.", ["A. are", "B. is", "C. am", "D. be"], "A", "Số nhiều 'four chairs' đi với 'are'.", "Starters", "grammar"),
            ("Fish can ________ in the river.", ["A. swim", "B. fly", "C. jump", "D. run"], "A", "Cá bơi trong nước -> 'swim'.", "Starters", "vocabulary"),
            ("What are these? -> They are my ________.", ["A. shoes", "B. shirt", "C. hat", "D. cap"], "A", "They are + danh từ số nhiều -> 'shoes' (đôi giày).", "Starters", "grammar"),
            ("It is sunny today. Let's wear a ________.", ["A. hat", "B. coat", "C. scarf", "D. boots"], "A", "Trời nắng đội mũ -> 'hat'.", "Starters", "vocabulary"),
            ("Where is the cat? -> It is ________ the table.", ["A. under", "B. to", "C. at", "D. of"], "A", "Ở dưới cái bàn -> 'under the table'.", "Starters", "grammar"),
            ("Thank you very much! -> You are ________!", ["A. welcome", "B. good", "C. please", "D. sorry"], "A", "Không có chi -> 'You are welcome'.", "Starters", "communication")
        ]
    },
    {
        "id": "ex_g2_standard_45m",
        "curriculum_id": "curr_g2",
        "title": "Đề Kiểm Tra Định Kỳ 45 Phút - Học Kỳ 1 Tiếng Anh Lớp 2",
        "description": "Đề kiểm tra 45 phút tổng hợp kiến thức Tiếng Anh Lớp 2: Hoạt động trong lớp, gia đình, sở thích và miêu tả đồ vật.",
        "grade": 2,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("What can you do? -> I can ________ a bicycle.", ["A. ride", "B. drive", "C. fly", "D. sail"], "A", "Đi xe đạp là 'ride a bicycle'.", "Starters", "vocabulary"),
            ("This is a classroom. There is a big ________ on the wall.", ["A. clock", "B. shoe", "C. bed", "D. spoon"], "A", "Đồng hồ treo tường trong lớp học là 'clock'.", "Starters", "vocabulary"),
            ("How many pens do you have? -> I have ________ pens.", ["A. three", "B. one", "C. a", "D. an"], "A", "'pens' số nhiều đi với số lượng 'three'.", "Starters", "grammar"),
            ("What colour are your shoes? -> They ________ brown.", ["A. are", "B. is", "C. am", "D. be"], "A", "They đi với 'are'.", "Starters", "grammar"),
            ("My sister is eating an ________.", ["A. apple", "B. banana", "C. pear", "D. cake"], "A", "Mạo từ 'an' đứng trước nguyên âm 'apple'.", "Starters", "grammar"),
            ("Can a frog jump? -> Yes, it ________.", ["A. can", "B. is", "C. does", "D. do"], "A", "Can a frog jump -> 'Yes, it can.'", "Starters", "grammar"),
            ("We sing English songs in the ________ room.", ["A. music", "B. math", "C. cook", "D. sleep"], "A", "Phòng âm nhạc là 'music room'.", "Starters", "vocabulary"),
            ("Is your bag big or small? -> It is ________.", ["A. big", "B. yes", "C. no", "D. pen"], "A", "Câu hỏi lựa chọn or -> trả lời 'It is big.'", "Starters", "communication"),
            ("I wash my ________ before dinner.", ["A. hands", "B. books", "C. shoes", "D. bags"], "A", "Rửa tay trước khi ăn tối -> 'hands'.", "Starters", "vocabulary"),
            ("Look at that monkey. It has a long ________.", ["A. tail", "B. nose", "C. ear", "D. wing"], "A", "Khỉ có cái đuôi dài -> 'tail'.", "Starters", "vocabulary"),
            ("These are my friends. ________ names are Ben and Lucy.", ["A. Their", "B. His", "C. Her", "D. Its"], "A", "Tính từ sở hữu chỉ số nhiều 'họ' là 'Their'.", "Starters", "grammar"),
            ("May I come in? -> Yes, you ________.", ["A. may", "B. must", "C. do", "D. are"], "A", "Xin phép vào lớp: 'Yes, you may.'", "Starters", "grammar"),
            ("The baby is sleeping. Please be ________!", ["A. quiet", "B. loud", "C. noisy", "D. tall"], "A", "Hãy giữ yên lặng: 'Please be quiet!'", "Starters", "vocabulary"),
            ("How is the weather today? -> It is ________ and warm.", ["A. sunny", "B. pencil", "C. desk", "D. chair"], "A", "Thời tiết nắng ấm: 'sunny'.", "Starters", "vocabulary"),
            ("Goodbye teacher! -> Goodbye, have a nice ________!", ["A. weekend", "B. clock", "C. wall", "D. bed"], "A", "Chúc cuối tuần vui vẻ -> 'have a nice weekend'.", "Starters", "communication")
        ]
    },

    # ---------------- LỚP 3 ----------------
    {
        "id": "ex_g3_quick_5m",
        "curriculum_id": "curr_g3",
        "title": "Khởi Động 5 Phút: Giới Thiệu Bản Thân & Đại Từ Chỉ Định (Lớp 3)",
        "description": "5 câu trắc nghiệm nhanh: This is / That is, These are / Those are và từ vựng đồ dùng học tập Lớp 3.",
        "grade": 3,
        "format_type": "quick_5m",
        "skill_category": "grammar_vocab",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("________ is my new pencil sharpener. (ở gần)", ["A. This", "B. These", "C. Those", "D. They"], "A", "Đồ vật số ít ở gần dùng 'This is'.", "Movers", "grammar"),
            ("________ are my notebooks on the table.", ["A. These", "B. This", "C. That", "D. It"], "A", "Số nhiều ở gần dùng 'These are'.", "Movers", "grammar"),
            ("Is that your school bag? -> No, it ________.", ["A. isn't", "B. aren't", "C. doesn't", "D. don't"], "A", "Phủ định số ít: 'No, it isn't.'", "Movers", "grammar"),
            ("What do you do at break time? -> I play ________.", ["A. badminton", "B. book", "C. ruler", "D. eraser"], "A", "Chơi cầu lông -> 'play badminton'.", "Movers", "vocabulary"),
            ("May I open the book? -> Yes, you ________.", ["A. can", "B. do", "C. are", "D. have"], "A", "Cho phép: 'Yes, you can' hoặc 'Yes, you may.'", "Movers", "grammar")
        ]
    },
    {
        "id": "ex_g3_quick_15m",
        "curriculum_id": "curr_g3",
        "title": "Kiểm Tra 15 Phút: Màu Sắc Đồ Vật & Hoạt Động Giờ Ra Chơi (Lớp 3)",
        "description": "Kiểm tra 15 phút thường xuyên: Các môn thể thao giờ ra chơi (football, chess, hide-and-seek) và câu hỏi nghi vấn Is this / Are these.",
        "grade": 3,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Are these your pencil cases? -> Yes, they ________.", ["A. are", "B. is", "C. do", "D. have"], "A", "Câu trả lời số nhiều: 'Yes, they are.'", "Movers", "grammar"),
            ("What colour are your school bags? -> ________ are blue.", ["A. They", "B. It", "C. He", "D. She"], "A", "Đại từ thay thế cho school bags là 'They'.", "Movers", "grammar"),
            ("Nam and Phong play ________ at break time. (⚽)", ["A. football", "B. chess", "C. tennis", "D. skating"], "A", "Đá bóng là 'football'.", "Movers", "vocabulary"),
            ("Do you like playing hide-and-seek? -> Yes, I ________.", ["A. do", "B. like", "C. can", "D. am"], "A", "Do you like -> 'Yes, I do.'", "Movers", "grammar"),
            ("Close your ________, please! It is windy outside.", ["A. window", "B. pencil", "C. ruler", "D. eraser"], "A", "Đóng cửa sổ -> 'window'.", "Movers", "vocabulary"),
            ("Who is that? -> That is my English ________, Mr. Brown.", ["A. teacher", "B. pupil", "C. student", "D. baby"], "A", "Thầy giáo tiếng Anh là 'English teacher'.", "Movers", "vocabulary"),
            ("Is your school big? -> No, it is ________.", ["A. small", "B. old", "C. long", "D. tall"], "A", "Trái nghĩa với big (to lớn) là 'small' (nhỏ).", "Movers", "vocabulary"),
            ("How old is your brother? -> He is eight years ________.", ["A. old", "B. tall", "C. high", "D. age"], "A", "Hỏi tuổi: 'eight years old'.", "Movers", "grammar"),
            ("May I go out? -> No, you ________.", ["A. can't", "B. don't", "C. aren't", "D. isn't"], "A", "Từ chối cho phép: 'No, you can't.'", "Movers", "grammar"),
            ("Nice to meet you! -> Nice to meet you, ________!", ["A. too", "B. to", "C. two", "D. either"], "A", "Rất vui được gặp bạn -> 'Nice to meet you, too!'", "Movers", "communication")
        ]
    },
    {
        "id": "ex_g3_standard_45m",
        "curriculum_id": "curr_g3",
        "title": "Đề Kiểm Tra 1 Tiết 45 Phút - Giữa Học Kỳ 1 Tiếng Anh Lớp 3",
        "description": "Đề kiểm tra 45 phút định kỳ chuẩn ma trận Bộ GD&ĐT Lớp 3: Ngữ âm, từ vựng phòng ốc trường học, đồ dùng cá nhân và kỹ năng đọc hiểu.",
        "grade": 3,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Find the word with the different sound: b<u>i</u>g, l<u>i</u>ke, n<u>i</u>ce, f<u>i</u>ne", ["A. big", "B. like", "C. nice", "D. fine"], "A", "'big' phát âm là /ɪ/, trong khi ba từ còn lại phát âm là /aɪ/.", "Movers", "phonics"),
            ("Look! This is our computer ________.", ["A. room", "B. bag", "C. desk", "D. pen"], "A", "Phòng máy tính là 'computer room'.", "Movers", "vocabulary"),
            ("Is that the school library? -> Yes, ________ is.", ["A. it", "B. this", "C. that", "D. there"], "A", "Đại từ trả lời cho vật số ít là 'it'.", "Movers", "grammar"),
            ("What do you have in your bag? -> I have two ________ and a notebook.", ["A. pens", "B. pen", "C. an pen", "D. a pens"], "A", "Số lượng 2 đi với danh từ số nhiều 'pens'.", "Movers", "grammar"),
            ("My school ________ a big playground.", ["A. has", "B. have", "C. having", "D. to have"], "A", "Chủ ngữ số ít 'My school' đi với động từ 'has'.", "Movers", "grammar"),
            ("Let's play blind man's buff! -> That's a great ________!", ["A. idea", "B. room", "C. time", "D. game"], "A", "Ý kiến hay đấy: 'That's a great idea!'", "Movers", "communication"),
            ("Those are my ________ over there.", ["A. rulers", "B. ruler", "C. a ruler", "D. an ruler"], "A", "'Those are' đi với danh từ số nhiều 'rulers'.", "Movers", "grammar"),
            ("Are the desks new? -> No, they are ________.", ["A. old", "B. big", "C. clean", "D. short"], "A", "Trái nghĩa với new (mới) là 'old' (cũ).", "Movers", "vocabulary"),
            ("Mai ________ skipping rope with Linda now.", ["A. is", "B. are", "C. am", "D. be"], "A", "Hiện tại tiếp diễn chủ ngữ số ít Mai: 'is skipping'.", "Movers", "grammar"),
            ("Do you have an eraser? -> Yes, I ________.", ["A. do", "B. have", "C. am", "D. can"], "A", "Do you have -> 'Yes, I do.'", "Movers", "grammar"),
            ("What is your hobby? -> I like ________ pictures.", ["A. drawing", "B. draw", "C. draws", "D. drew"], "A", "Sau like dùng V-ing: 'drawing pictures'.", "Movers", "grammar"),
            ("Where are my books? -> They are ________ the desk.", ["A. on", "B. to", "C. of", "D. at"], "A", "Ở trên bàn dùng giới từ 'on'.", "Movers", "grammar"),
            ("How many boys are there in your class? -> There ________ fifteen boys.", ["A. are", "B. is", "C. has", "D. have"], "A", "There are + danh từ số nhiều (fifteen boys).", "Movers", "grammar"),
            ("We read stories in the school ________.", ["A. library", "B. gym", "C. garden", "D. canteen"], "A", "Đọc sách truyện ở thư viện trường -> 'library'.", "Movers", "vocabulary"),
            ("Goodbye class! -> ________ teacher!", ["A. Goodbye", "B. Hello", "C. Hi", "D. Good morning"], "A", "Tạm biệt lớp đáp lại là 'Goodbye teacher!'", "Movers", "communication")
        ]
    },

    # ---------------- LỚP 4 ----------------
    {
        "id": "ex_g4_quick_5m",
        "curriculum_id": "curr_g4",
        "title": "Khởi Động 5 Phút: Giờ Giấc & Lịch Trình Sinh Hoạt (Lớp 4)",
        "description": "5 câu trắc nghiệm nhanh: What time is it, mẫu câu chỉ giờ hơn/kém và thói quen sinh hoạt hàng ngày.",
        "grade": 4,
        "format_type": "quick_5m",
        "skill_category": "grammar_vocab",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("What time is it? -> It is seven ________.", ["A. o'clock", "B. clock", "C. hour", "D. time"], "A", "Chỉ giờ đúng: 'seven o'clock'.", "Movers", "grammar"),
            ("I get up ________ 6:00 in the morning.", ["A. at", "B. on", "C. in", "D. to"], "A", "Giờ giấc đi với giới từ 'at'.", "Movers", "grammar"),
            ("What does your father do? -> He is a ________. He works in a hospital.", ["A. doctor", "B. farmer", "C. driver", "D. worker"], "A", "Làm việc ở bệnh viện là bác sĩ -> 'doctor'.", "Movers", "vocabulary"),
            ("What is your favourite food? -> I like ________.", ["A. beef", "B. orange juice", "C. water", "D. milk"], "A", "Thức ăn (food) là thịt bò -> 'beef'.", "Movers", "vocabulary"),
            ("When is your birthday? -> It is in ________.", ["A. May", "B. Monday", "C. morning", "D. clock"], "A", "Tháng sinh nhật đi với giới từ in: 'in May'.", "Movers", "vocabulary")
        ]
    },
    {
        "id": "ex_g4_quick_15m",
        "curriculum_id": "curr_g4",
        "title": "Kiểm Tra 15 Phút: Nghề Nghiệp & Môn Thể Thao Yêu Thích (Lớp 4)",
        "description": "Kiểm tra 15 phút: Chủ đề nghề nghiệp (teacher, nurse, engineer, clerk) và câu hỏi What would you like to eat/drink.",
        "grade": 4,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Where does a teacher work? -> In a ________.", ["A. school", "B. factory", "C. field", "D. hospital"], "A", "Giáo viên làm việc ở trường học -> 'school'.", "Movers", "vocabulary"),
            ("What would you like to drink? -> A glass of ________, please.", ["A. orange juice", "B. bread", "C. chicken", "D. pork"], "A", "Đồ uống là nước cam -> 'orange juice'.", "Movers", "vocabulary"),
            ("What does he look like? -> He is tall and ________.", ["A. slim", "B. long", "C. high", "D. short time"], "A", "Miêu tả ngoại hình: 'tall and slim' (cao và thon gọn).", "Movers", "vocabulary"),
            ("My brother is ________ than me.", ["A. taller", "B. tall", "C. more tall", "D. tallest"], "A", "So sánh hơn tính từ ngắn: 'taller than'.", "Movers", "grammar"),
            ("What animal do you want to see? -> I want to see ________. (🐅)", ["A. tigers", "B. books", "C. pens", "D. shoes"], "A", "Con hổ là 'tigers'.", "Movers", "vocabulary"),
            ("Why do you like monkeys? -> Because they are ________.", ["A. funny", "B. scary", "C. fierce", "D. dangerous"], "A", "Khỉ tinh nghịch vui nhộn -> 'funny'.", "Movers", "vocabulary"),
            ("How much is this T-shirt? -> It ________ 80,000 dong.", ["A. is", "B. are", "C. has", "D. have"], "A", "Hỏi giá tiền số ít: 'It is 80,000 dong.'", "Movers", "grammar"),
            ("What are you going to do this summer? -> I am going to ________ Phu Quoc.", ["A. visit", "B. visiting", "C. visits", "D. visited"], "A", "Tương lai gần: be going to + V nguyên mẫu ('visit').", "Movers", "grammar"),
            ("Where were you yesterday? -> I was ________ home.", ["A. at", "B. in", "C. on", "D. to"], "A", "Ở nhà dùng cụm 'at home'.", "Movers", "grammar"),
            ("Did you go to the zoo last Sunday? -> Yes, I ________.", ["A. did", "B. do", "C. was", "D. went"], "A", "Câu hỏi Did you -> 'Yes, I did.'", "Movers", "grammar")
        ]
    },
    {
        "id": "ex_g4_standard_45m",
        "curriculum_id": "curr_g4",
        "title": "Đề Kiểm Tra 1 Tiết 45 Phút - Giữa Học Kỳ 1 Tiếng Anh Lớp 4",
        "description": "Đề kiểm tra 45 phút định kỳ Lớp 4 Global Success: Quá khứ đơn was/were, so sánh tính từ, miêu tả người và hoạt động cuối tuần.",
        "grade": 4,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Choose the word with different stress: 'animal, 'hospital, ba'nana, 'doctor", ["A. banana", "B. animal", "C. hospital", "D. doctor"], "A", "'banana' trọng âm rơi vào âm tiết 2, các từ còn lại trọng âm rơi vào âm tiết 1.", "Movers", "phonics"),
            ("My mother ________ breakfast for the family every morning.", ["A. cooks", "B. cook", "C. cooking", "D. cooked"], "A", "Hiện tại đơn chủ ngữ ngôi thứ 3 số ít thêm -s: 'cooks'.", "Movers", "grammar"),
            ("What is your phone number? -> It is 0905 ________.", ["A. 960 437", "B. cat dog", "C. Monday", "D. red blue"], "A", "Số điện thoại là dãy số.", "Movers", "communication"),
            ("Why does she want to go to the bakery? -> Because she wants to buy some ________.", ["A. bread", "B. medicine", "C. stamps", "D. books"], "A", "Tiệm bánh mì mua bánh mì -> 'bread'.", "Movers", "vocabulary"),
            ("Yesterday was Sunday. Nam ________ at the seaside.", ["A. was", "B. were", "C. is", "D. are"], "A", "Quá khứ đơn chủ ngữ số ít Nam dùng 'was'.", "Movers", "grammar"),
            ("They ________ football in the park yesterday afternoon.", ["A. played", "B. play", "C. playing", "D. plays"], "A", "Quá khứ đơn của play là 'played'.", "Movers", "grammar"),
            ("The elephant is ________ than the monkey.", ["A. bigger", "B. big", "C. biggest", "D. more big"], "A", "So sánh hơn của big là 'bigger than'.", "Movers", "grammar"),
            ("Would you like some milk? -> ________, please.", ["A. Yes", "B. No", "C. Sure not", "D. Don't"], "A", "Đồng ý lời mời lịch sự: 'Yes, please.'", "Movers", "communication"),
            ("What does an engineer do? -> An engineer ________ machines and bridges.", ["A. designs", "B. teaches", "C. treats", "D. cooks"], "A", "Kỹ sư thiết kế máy móc và cầu cống -> 'designs'.", "Movers", "vocabulary"),
            ("She is wearing a beautiful blue ________.", ["A. dress", "B. shoe", "C. sock", "D. glove"], "A", "Mạo từ 'a' đi với danh từ số ít 'dress' (váy liền).", "Movers", "grammar"),
            ("What time do you have lunch? -> At ________ twelve.", ["A. half past", "B. past half", "C. half to", "D. half on"], "A", "12 rưỡi là 'half past twelve'.", "Movers", "grammar"),
            ("Where is the cinema? -> It is ________ to the supermarket.", ["A. next", "B. near", "C. opposite", "D. behind"], "A", "Cụm giới từ vị trí 'next to' (bên cạnh).", "Movers", "grammar"),
            ("How much are these jeans? -> ________ are 250,000 VND.", ["A. They", "B. It", "C. This", "D. That"], "A", "'jeans' số nhiều dùng đại từ thay thế 'They are'.", "Movers", "grammar"),
            ("We are going to stay in a hotel ________ the beach.", ["A. near", "B. at", "C. to", "D. of"], "A", "Khách sạn gần bãi biển -> 'near the beach'.", "Movers", "vocabulary"),
            ("What did you do last night? -> I ________ my homework.", ["A. did", "B. do", "C. doing", "D. does"], "A", "Quá khứ đơn làm bài tập: 'I did my homework.'", "Movers", "grammar")
        ]
    },

    # ---------------- LỚP 5 ----------------
    {
        "id": "ex_g5_quick_5m",
        "curriculum_id": "curr_g5",
        "title": "Khởi Động 5 Phút: Địa Chỉ Quê Hương & Thói Quen (Lớp 5)",
        "description": "5 câu trắc nghiệm nhanh: What's your address, What's the city like và trạng từ chỉ tần suất always/usually.",
        "grade": 5,
        "format_type": "quick_5m",
        "skill_category": "grammar_vocab",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("What's your address? -> It's 105 Hoa Binh ________.", ["A. Street", "B. Village", "C. Floor", "D. City"], "A", "Số nhà trên đường phố -> 'Hoa Binh Street'.", "Flyers", "vocabulary"),
            ("What's the village like? -> It's small and ________.", ["A. quiet", "B. noisy", "C. crowded", "D. busy"], "A", "Làng quê nhỏ và yên bình -> 'small and quiet'.", "Flyers", "vocabulary"),
            ("How often do you go to the library? -> I ________ go once a week.", ["A. usually", "B. ever", "C. already", "D. yet"], "A", "Trạng từ tần suất: 'I usually go once a week.'", "Flyers", "grammar"),
            ("Where did you go on holiday? -> I went to Ha Long ________.", ["A. Bay", "B. Island", "C. River", "D. Lake"], "A", "Vịnh Hạ Long là 'Ha Long Bay'.", "Flyers", "vocabulary"),
            ("How did you get there? -> I went by ________. (✈️)", ["A. plane", "B. coach", "C. motorbike", "D. train"], "A", "Đi bằng máy bay -> 'by plane'.", "Flyers", "vocabulary")
        ]
    },
    {
        "id": "ex_g5_quick_15m",
        "curriculum_id": "curr_g5",
        "title": "Kiểm Tra 15 Phút: Thì Quá Khứ Đơn & Truyện Cổ Tích Dân Gian (Lớp 5)",
        "description": "Kiểm tra 15 phút: Động từ bất quy tắc quá khứ (went, saw, ate, had) và các nhân vật truyện cổ tích (Tam Cam, Mai An Tiem).",
        "grade": 5,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("What are you reading? -> I am reading The Story of Mai An ________.", ["A. Tiem", "B. Cam", "C. Thach Sanh", "D. Cuoi"], "A", "Sự tích Mai An Tiêm dưa hấu đỏ.", "Flyers", "vocabulary"),
            ("What is An Tiem like? -> He is hard-________ and clever.", ["A. working", "B. work", "C. worked", "D. worker"], "A", "Chăm chỉ cần cù là tính từ ghép 'hard-working'.", "Flyers", "vocabulary"),
            ("What did the tigers do when you were at the zoo? -> They roared ________.", ["A. loudly", "B. loud", "C. loudness", "D. slow"], "A", "Gầm to: bổ nghĩa cho động từ roared dùng phó từ 'loudly'.", "Flyers", "grammar"),
            ("Don't ride your bike too fast! -> OK, I ________.", ["A. won't", "B. will", "C. don't", "D. am not"], "A", "Đáp lại lời cảnh báo phòng tránh tai nạn: 'OK, I won't.'", "Flyers", "grammar"),
            ("Why shouldn't he climb the tree? -> Because he may ________ and break his leg.", ["A. fall", "B. fell", "C. falling", "D. falls"], "A", "Sau động từ khuyết thiếu may dùng V nguyên mẫu: 'fall'.", "Flyers", "grammar"),
            ("What would you like to be in the future? -> I'd like to be an ________ because I want to design buildings.", ["A. architect", "B. artist", "C. author", "D. actor"], "A", "Thiết kế nhà cửa công trình là kiến trúc sư -> 'architect'.", "Flyers", "vocabulary"),
            ("Where is the museum? -> Turn ________ at the corner. It's on your left.", ["A. right", "B. straight", "C. on", "D. forward"], "A", "Rẽ phải là 'Turn right'.", "Flyers", "vocabulary"),
            ("How can I get to the post office? -> You can take a ________.", ["A. bus", "B. foot", "C. walk", "D. step"], "A", "Đi xe buýt là 'take a bus'.", "Flyers", "vocabulary"),
            ("What will the weather be like tomorrow? -> It will be cold and ________.", ["A. windy", "B. sun", "C. wind", "D. rain"], "A", "Tính từ miêu tả thời tiết: 'cold and windy'.", "Flyers", "vocabulary"),
            ("Which place would you like to visit: Trang Tien Bridge or Thien Mu Pagoda? -> I'd like to visit Thien Mu ________.", ["A. Pagoda", "B. Bridge", "C. Tower", "D. Lake"], "A", "Chùa Thiên Mụ ở Huế -> 'Thien Mu Pagoda'.", "Flyers", "vocabulary")
        ]
    },
    {
        "id": "ex_g5_standard_45m",
        "curriculum_id": "curr_g5",
        "title": "Đề Kiểm Tra Định Kỳ 45 Phút - Học Kỳ 1 Tiếng Anh Lớp 5",
        "description": "Đề kiểm tra 45 phút học kỳ 1 Lớp 5: Ngữ pháp so sánh, lời khuyên an toàn sức khỏe (should/shouldn't) và kỹ năng đọc hiểu.",
        "grade": 5,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 15,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Choose the word whose underlined part is pronounced differently: h<u>ea</u>dache, br<u>ea</u>k, h<u>ea</u>lth, r<u>ea</u>dy", ["A. break", "B. headache", "C. health", "D. ready"], "A", "'break' phát âm là /eɪ/, ba từ còn lại phát âm là /e/.", "Flyers", "phonics"),
            ("You have a high fever. You ________ go to the doctor right away.", ["A. should", "B. shouldn't", "C. won't", "D. can't"], "A", "Sốt cao thì nên đi khám bác sĩ -> 'should'.", "Flyers", "grammar"),
            ("He has a stomach ache because he ate too much spicy ________.", ["A. food", "B. water", "C. medicine", "D. tea"], "A", "Đau dạ dày do ăn nhiều đồ ăn cay -> 'spicy food'.", "Flyers", "vocabulary"),
            ("What happened in the story? -> First, the fox asked the crow to ________.", ["A. sing", "B. dance", "C. fly", "D. sleep"], "A", "Truyện Con cáo và con quạ: cáo rủ quạ hát để rơi miếng phô mai.", "Flyers", "reading"),
            ("Life in the city is much more ________ than life in the countryside.", ["A. exciting", "B. excited", "C. excite", "D. excitement"], "A", "So sánh hơn tính từ dài: 'more exciting than'.", "Flyers", "grammar"),
            ("What do you think of Dam Sen Park? -> It is more beautiful than I ________.", ["A. expected", "B. expect", "C. expecting", "D. expects"], "A", "Đẹp hơn tôi kỳ vọng: 'than I expected'.", "Flyers", "grammar"),
            ("How many lessons do you have today? -> I have ________: Maths, English, Science and Music.", ["A. four", "B. three", "C. five", "D. six"], "A", "Có 4 môn học liệt kê -> 'four'.", "Flyers", "vocabulary"),
            ("Don't play with matches! -> You may get a ________.", ["A. burn", "B. cut", "C. fall", "D. fever"], "A", "Nghịch diêm có thể bị bỏng -> 'get a burn'.", "Flyers", "vocabulary"),
            ("Why does she want to be a nurse? -> Because she wants to take ________ of sick people.", ["A. care", "B. after", "C. over", "D. off"], "A", "Cụm từ chăm sóc người ốm: 'take care of'.", "Flyers", "vocabulary"),
            ("Ba Na Hills is one of the most famous tourist ________ in Da Nang.", ["A. attractions", "B. attract", "C. attractive", "D. attracting"], "A", "Điểm thu hút khách du lịch: 'tourist attractions'.", "Flyers", "vocabulary"),
            ("The peacock danced ________ when the music played.", ["A. beautifully", "B. beauty", "C. beautiful", "D. more beautiful"], "A", "Bổ nghĩa cho động từ danced dùng phó từ 'beautifully'.", "Flyers", "grammar"),
            ("Which one is larger: London or Da Nang? -> London is much ________.", ["A. larger", "B. large", "C. largest", "D. more large"], "A", "So sánh hơn tính từ ngắn: 'much larger'.", "Flyers", "grammar"),
            ("My uncle is a pilot. He flies planes across many ________.", ["A. countries", "B. rooms", "C. gardens", "D. desks"], "A", "Phi công lái máy bay qua nhiều quốc gia -> 'countries'.", "Flyers", "vocabulary"),
            ("What is your dream job? -> I'd like to write stories for children, so I want to be a ________.", ["A. writer", "B. driver", "C. farmer", "D. worker"], "A", "Viết truyện cho thiếu nhi là nhà văn -> 'writer'.", "Flyers", "vocabulary"),
            ("Thank you for your useful advice! -> Don't ________ it!", ["A. mention", "B. say", "C. tell", "D. speak"], "A", "Đáp lại lời cảm ơn: 'Don't mention it!' (Không có chi).", "Flyers", "communication")
        ]
    },

    # ---------------- LỚP 6 ----------------
    {
        "id": "ex_g6_quick_5m",
        "curriculum_id": "curr_g6",
        "title": "Khởi Động 5 Phút: Phát Âm /s/, /z/, /ɪz/ & My New School (Lớp 6)",
        "description": "5 câu trắc nghiệm nhanh kiểm tra quy tắc phát âm đuôi -s/es và từ vựng trường học Lớp 6.",
        "grade": 6,
        "format_type": "quick_5m",
        "skill_category": "phonics",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Which word has the final -s pronounced as /ɪz/?", ["A. watches", "B. books", "C. pens", "D. cats"], "A", "Đuôi 'ch' phát âm là /ɪz/ trong 'watches'.", "KET_A2", "phonics"),
            ("Students wear a school ________ every Monday morning.", ["A. uniform", "B. compass", "C. calculator", "D. pencil"], "A", "Mặc đồng phục học sinh là 'school uniform'.", "KET_A2", "vocabulary"),
            ("Nam ________ judo in the school gymnasium every Tuesday.", ["A. does", "B. plays", "C. makes", "D. takes"], "A", "Môn võ thuật judo đi với động từ 'do' -> 'does judo'.", "KET_A2", "grammar"),
            ("Our new school is surrounded ________ green rice fields.", ["A. by", "B. with", "C. at", "D. in"], "A", "Được bao quanh bởi dùng 'surrounded by'.", "KET_A2", "grammar"),
            ("Listen! Someone ________ at the classroom door.", ["A. is knocking", "B. knocks", "C. knocked", "D. knock"], "A", "Dấu hiệu 'Listen!' dùng thì hiện tại tiếp diễn: 'is knocking'.", "KET_A2", "grammar")
        ]
    },
    {
        "id": "ex_g6_quick_15m",
        "curriculum_id": "curr_g6",
        "title": "Kiểm Tra 15 Phút: My Home & Các Kiểu Nhà Ở (Lớp 6)",
        "description": "Kiểm tra 15 phút: Giới từ chỉ vị trí (in front of, behind, between), các kiểu nhà stilt house, villa, apartment và tính từ miêu tả tính cách.",
        "grade": 6,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("There is a large garden ________ front of my house.", ["A. in", "B. at", "C. on", "D. to"], "A", "Cụm giới từ vị trí 'in front of' (ở phía trước).", "KET_A2", "grammar"),
            ("Phong is very ________. He likes making new friends easily.", ["A. friendly", "B. shy", "C. lazy", "D. selfish"], "A", "Thân thiện hòa đồng là 'friendly'.", "KET_A2", "vocabulary"),
            ("An is so ________. She always does her homework without reminder.", ["A. hard-working", "B. talkative", "C. messy", "D. clumsy"], "A", "Chăm chỉ tự giác là 'hard-working'.", "KET_A2", "vocabulary"),
            ("Where is the microwave? -> It's ________ the cupboard and the fridge.", ["A. between", "B. among", "C. in", "D. under"], "A", "Ở giữa hai vật dùng 'between A and B'.", "KET_A2", "grammar"),
            ("Look! The children ________ football on the school playground.", ["A. are playing", "B. play", "C. played", "D. plays"], "A", "Dấu hiệu 'Look!' dùng thì hiện tại tiếp diễn số nhiều: 'are playing'.", "KET_A2", "grammar"),
            ("She has long straight ________ hair.", ["A. black", "B. big", "C. tall", "D. smart"], "A", "Trật tự tính từ miêu tả tóc: length - shape - colour ('long straight black hair').", "KET_A2", "grammar"),
            ("Ethnic minority groups in the northern mountains live in traditional ________ houses.", ["A. stilt", "B. flat", "C. skyscraper", "D. villa"], "A", "Nhà sàn vùng cao là 'stilt houses'.", "KET_A2", "vocabulary"),
            ("You ________ pass the ball with both hands in basketball.", ["A. must", "B. mustn't", "C. shouldn't", "D. can't"], "A", "Bắt buộc theo luật thể thao dùng 'must'.", "KET_A2", "grammar"),
            ("My younger brother is very ________. He draws wonderful comic characters.", ["A. creative", "B. boring", "C. impatient", "D. rude"], "A", "Sáng tạo nghệ thuật dùng 'creative'.", "KET_A2", "vocabulary"),
            ("Would you like to come to my birthday party tonight? -> ________", ["A. I'd love to, thanks!", "B. No, I don't.", "C. Yes, I do.", "D. You're welcome."], "A", "Đồng ý lời mời dự sinh nhật: 'I'd love to, thanks!'", "KET_A2", "communication")
        ]
    },

    # ---------------- LỚP 7 ----------------
    {
        "id": "ex_g7_quick_5m",
        "curriculum_id": "curr_g7",
        "title": "Khởi Động 5 Phút: Phát Âm /ə/ & /ɜː/ và Sở Thích Hobbies (Lớp 7)",
        "description": "5 câu trắc nghiệm nhanh kiểm tra cặp âm /ə/ và /ɜː/, động từ chỉ sở thích like/love/enjoy + V-ing.",
        "grade": 7,
        "format_type": "quick_5m",
        "skill_category": "phonics",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Which word has the underlined part pronounced as /ɜː/?", ["A. b<u>i</u>rd", "B. <u>a</u>bout", "C. doct<u>o</u>r", "D. teach<u>e</u>r"], "A", "'bird' phát âm là /ɜː/, các từ còn lại phát âm là /ə/.", "KET_A2", "phonics"),
            ("My sister loves ________ teddy bears from different countries.", ["A. collecting", "B. collect", "C. collected", "D. collects"], "A", "Sau love dùng V-ing: 'collecting'.", "KET_A2", "grammar"),
            ("Eating too much junk food causes acne and ________.", ["A. obesity", "B. allergy", "C. fitness", "D. energy"], "A", "Ăn nhiều đồ ăn nhanh gây béo phì -> 'obesity'.", "KET_A2", "vocabulary"),
            ("We should donate old warm clothes to ________ children in remote areas.", ["A. underprivileged", "B. wealthy", "C. rich", "D. lucky"], "A", "Trẻ em có hoàn cảnh khó khăn: 'underprivileged children'.", "KET_A2", "vocabulary"),
            ("Eat more vegetables ________ they provide essential vitamins.", ["A. because", "B. although", "C. but", "D. so"], "A", "Liên từ chỉ nguyên nhân: 'because' (bởi vì).", "KET_A2", "grammar")
        ]
    },

    # ---------------- LỚP 8 ----------------
    {
        "id": "ex_g8_quick_5m",
        "curriculum_id": "curr_g8",
        "title": "Khởi Động 5 Phút: Cuộc Sống Nông Thôn & So Sánh Hơn Của Trạng Từ (Lớp 8)",
        "description": "5 câu trắc nghiệm nhanh: Cuộc sống làng quê yên bình và quy tắc biến đổi trạng từ so sánh hơn more quietly / more peacefully.",
        "grade": 8,
        "format_type": "quick_5m",
        "skill_category": "grammar",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("People in the countryside live ________ peacefully than those in big cities.", ["A. more", "B. much", "C. most", "D. as"], "A", "So sánh hơn của trạng từ hai âm tiết: 'more peacefully than'.", "PET_B1", "grammar"),
            ("Farmers work hard during harvest ________.", ["A. season", "B. time", "C. month", "D. year"], "A", "Mùa gặt lúa là 'harvest season'.", "PET_B1", "vocabulary"),
            ("Buffalo-drawn carts are still used to ________ rice bundles.", ["A. load", "B. feed", "C. herd", "D. catch"], "A", "Bốc dỡ chất lúa lên xe: 'load rice'.", "PET_B1", "vocabulary"),
            ("Nomadic children learn to ________ horses at a very young age.", ["A. ride", "B. drive", "C. sail", "D. fly"], "A", "Cưỡi ngựa là 'ride horses'.", "PET_B1", "vocabulary"),
            ("He runs ________ than any other athlete in his class.", ["A. faster", "B. more fast", "C. fastly", "D. fastest"], "A", "Trạng từ fast có dạng so sánh hơn là 'faster'.", "PET_B1", "grammar")
        ]
    },
    {
        "id": "ex_g8_quick_15m",
        "curriculum_id": "curr_g8",
        "title": "Kiểm Tra 15 Phút: Phong Tục Tập Quán & Các Dân Tộc Việt Nam (Lớp 8)",
        "description": "Kiểm tra 15 phút: Bản sắc văn hóa 54 dân tộc, trang phục thổ cẩm và cấu trúc câu hỏi nghi vấn với How many / Which.",
        "grade": 8,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Vietnam is a multi-ethnic country with ________ distinct ethnic groups.", ["A. 54", "B. 50", "C. 64", "D. 44"], "A", "Việt Nam có 54 dân tộc anh em.", "PET_B1", "culture"),
            ("Ethnic women weave intricate ________ fabrics using natural cotton.", ["A. brocade", "B. plastic", "C. paper", "D. metal"], "A", "Vải thổ cẩm là 'brocade fabrics'.", "PET_B1", "vocabulary"),
            ("The communal house called 'Rong' is the cultural heart of ethnic villages in the ________ Highlands.", ["A. Central", "B. Northern", "C. Southern", "D. Western"], "A", "Tây Nguyên là 'Central Highlands'.", "PET_B1", "culture"),
            ("You ________ take off your shoes before entering a pagoda in Vietnam.", ["A. should", "B. shouldn't", "C. must not", "D. needn't"], "A", "Lời khuyên chuẩn mực văn hóa: 'should take off your shoes'.", "PET_B1", "grammar"),
            ("There is a custom of ________ peach blossoms during Tet in the North.", ["A. displaying", "B. display", "C. displayed", "D. displays"], "A", "Sau giới từ of dùng V-ing: 'displaying'.", "PET_B1", "grammar"),
            ("Unlike urban teenagers, ethnic children spend plenty of time ________ outside in nature.", ["A. playing", "B. play", "C. played", "D. to play"], "A", "Spend time + V-ing: 'spending time playing'.", "PET_B1", "grammar"),
            ("Muong women wear beautiful headscarves and long wrap-around ________.", ["A. skirts", "B. jeans", "C. shorts", "D. trousers"], "A", "Váy dài quấn truyền thống của phụ nữ Mường: 'skirts'.", "PET_B1", "vocabulary"),
            ("Terraced fields in Sapa look like giant staircases climbing up to the ________.", ["A. clouds", "B. river", "C. sea", "D. ground"], "A", "Ruộng bậc thang như bậc thang chạm tới mây trời: 'clouds'.", "PET_B1", "vocabulary"),
            ("It is considered ________ to point fingers directly at elderly people.", ["A. impolite", "B. polite", "C. respectful", "D. kind"], "A", "Chỉ tay vào người lớn tuổi là bất lịch sự -> 'impolite'.", "PET_B1", "vocabulary"),
            ("They held an open-air campfire where everyone danced the joyful 'Xoe' ________.", ["A. dance", "B. song", "C. game", "D. dish"], "A", "Điệu múa Xòe Thái: 'Xoe dance'.", "PET_B1", "culture")
        ]
    },

    # ---------------- LỚP 9 ----------------
    {
        "id": "ex_g9_quick_5m",
        "curriculum_id": "curr_g9",
        "title": "Khởi Động 5 Phút: Cụm Động Từ Phrasal Verbs Thông Dụng (Lớp 9)",
        "description": "5 câu trắc nghiệm nhanh khởi động: Các cụm động từ cốt lõi thi vào 10 look forward to, pass down, turn down, keep up with.",
        "grade": 9,
        "format_type": "quick_5m",
        "skill_category": "vocabulary",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("We are really looking forward ________ visiting Bat Trang ceramic village.", ["A. to", "B. at", "C. for", "D. with"], "A", "Cụm 'look forward to + V-ing' (rất trông đợi).", "PET_B1", "grammar"),
            ("This delicate silk-weaving technique was passed ________ through four generations.", ["A. down", "B. off", "C. up", "D. away"], "A", "Truyền lại qua nhiều thế hệ: 'pass down'.", "PET_B1", "vocabulary"),
            ("He had to turn ________ the job offer because the commute was too exhausting.", ["A. down", "B. on", "C. up", "D. off"], "A", "Từ chối lời mời là 'turn down'.", "PET_B1", "vocabulary"),
            ("City planners must find effective ways to deal ________ urban traffic congestion.", ["A. with", "B. on", "C. at", "D. in"], "A", "Giải quyết xử lý vấn đề: 'deal with'.", "PET_B1", "grammar"),
            ("Secondary students study relentlessly to keep up ________ the demanding curriculum.", ["A. with", "B. to", "C. on", "D. at"], "A", "Theo kịp chương trình: 'keep up with'.", "PET_B1", "grammar")
        ]
    },
    {
        "id": "ex_g9_quick_15m",
        "curriculum_id": "curr_g9",
        "title": "Kiểm Tra 15 Phút: Câu Phức & Câu Điều Kiện Trong Thi Vào 10 (Lớp 9)",
        "description": "Kiểm tra 15 phút chuyên đề thi vào 10: Mệnh đề quan hệ, câu gián tiếp, câu điều kiện Type 1 & 2 và từ vựng đô thị hóa.",
        "grade": 9,
        "format_type": "quick_15m",
        "skill_category": "grammar",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("The craftsman ________ sculpted this marble statue won first prize at the festival.", ["A. who", "B. which", "C. whom", "D. whose"], "A", "Đại từ quan hệ chỉ người làm chủ ngữ: 'who'.", "PET_B1", "grammar"),
            ("If I ________ enough money, I would purchase a solar-powered water heater.", ["A. had", "B. have", "C. will have", "D. have had"], "A", "Câu điều kiện loại 2 giả định hiện tại: If + S + V-ed ('had').", "PET_B1", "grammar"),
            ("She asked me ________ I had visited Van Phuc silk village before.", ["A. whether", "B. weather", "C. what", "D. that"], "A", "Câu gián tiếp dạng Yes/No question dùng 'whether' hoặc 'if'.", "PET_B1", "grammar"),
            ("The ancient town attracts millions of tourists ________ it preserves authentic French villas.", ["A. because", "B. although", "C. despite", "D. but"], "A", "Mệnh đề nguyên nhân: 'because' + mệnh đề.", "PET_B1", "grammar"),
            ("Despite ________ exhausted after the long hike, they smiled happily at the mountain summit.", ["A. feeling", "B. feel", "C. felt", "D. to feel"], "A", "Sau giới từ Despite dùng V-ing: 'feeling'.", "PET_B1", "grammar"),
            ("You haven't submitted your mock exam paper yet, ________?", ["A. have you", "B. haven't you", "C. do you", "D. did you"], "A", "Câu hỏi đuôi với vế trước phủ định 'haven't' -> 'have you?'.", "PET_B1", "grammar"),
            ("The subway system helps shorten the daily ________ time for downtown commuters.", ["A. travel", "B. walk", "C. stay", "D. live"], "A", "Thời gian di chuyển đi lại: 'travel time' hoặc 'commute'.", "PET_B1", "vocabulary"),
            ("I wish our classroom ________ equipped with interactive smartboards.", ["A. were", "B. is", "C. will be", "D. has been"], "A", "Câu ước ở hiện tại dùng 'were' cho mọi ngôi.", "PET_B1", "grammar"),
            ("The local pottery workshop is facing severe financial ________ due to raw material costs.", ["A. difficulties", "B. happiness", "C. comforts", "D. pleasures"], "A", "Khó khăn tài chính: 'financial difficulties'.", "PET_B1", "vocabulary"),
            ("Unless you practice speaking English regularly, you ________ improve your fluency.", ["A. will not", "B. will", "C. would", "D. do"], "A", "Unless = If not: 'Unless you practice..., you will not improve...'.", "PET_B1", "grammar")
        ]
    },
    {
        "id": "ex_g9_standard_45m",
        "curriculum_id": "curr_g9",
        "title": "Đề Kiểm Tra 1 Tiết 45 Phút - Luyện Thi Tuyển Sinh Vào 10 (Lớp 9)",
        "description": "Đề kiểm tra 45 phút chuẩn cấu trúc đề thi tuyển sinh vào lớp 10 THPT công lập: Ngữ âm, trọng âm, tìm lỗi sai, viết lại câu và đọc hiểu.",
        "grade": 9,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 20,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Choose the word with different sound in the underlined part: kn<u>i</u>fe, sk<u>i</u>ll, fl<u>i</u>ght, k<u>i</u>te", ["A. skill", "B. knife", "C. flight", "D. kite"], "A", "'skill' phát âm là /ɪ/, trong khi ba từ còn lại phát âm là /aɪ/.", "PET_B1", "phonics"),
            ("Choose the word with different stress pattern: po'llution, pre'serve, 'heritage, con'tinue", ["A. heritage", "B. pollution", "C. preserve", "D. continue"], "A", "'heritage' trọng âm 1, các từ còn lại trọng âm 2.", "PET_B1", "phonics"),
            ("The ancient citadel was recognised by UNESCO as a World Cultural ________.", ["A. Heritage", "B. Tradition", "C. Custom", "D. Miracle"], "A", "Di sản văn hóa thế giới: 'World Cultural Heritage'.", "PET_B1", "vocabulary"),
            ("If farmers continue to overuse chemical pesticides, the groundwater will become ________.", ["A. contaminated", "B. pure", "C. clean", "D. fresh"], "A", "Bị ô nhiễm nhiễm độc: 'contaminated'.", "PET_B1", "vocabulary"),
            ("The English teacher suggested that we ________ reading English news headlines daily.", ["A. should practice", "B. to practice", "C. practiced", "D. practicing"], "A", "Cấu trúc giả định: suggest that S + (should) + V nguyên mẫu.", "PET_B1", "grammar"),
            ("I cannot find my car keys anywhere. I ________ them on my office desk.", ["A. must have left", "B. should leave", "C. can leave", "D. must leave"], "A", "Suy đoán chắc chắn việc đã xảy ra trong quá khứ: 'must have left'.", "FCE_B2", "grammar"),
            ("The book ________ I bought at the book fair yesterday is exceptionally inspiring.", ["A. which", "B. who", "C. whom", "D. where"], "A", "Đại từ quan hệ thay thế cho cuốn sách (vật): 'which'.", "PET_B1", "grammar"),
            ("Find the underlined error: <u>Although</u> his broken leg, he <u>managed</u> to <u>climb</u> up to <u>the top</u>.", ["A. Although", "B. managed", "C. climb", "D. the top"], "A", "Sau cụm danh từ 'his broken leg' phải dùng 'In spite of' hoặc 'Despite', không dùng 'Although'.", "PET_B1", "grammar"),
            ("He is said to be the most ________ craftsman in the bronze casting village.", ["A. skilled", "B. skillful", "C. skill", "D. unskilled"], "A", "Nghệ nhân lành nghề khéo léo: 'skilled' craftsman.", "PET_B1", "vocabulary"),
            ("Rewrite test: 'They began restoring the pagoda three years ago.' -> 'They have...'", ["A. been restoring the pagoda for three years.", "B. restored the pagoda since three years.", "C. restored the pagoda three years ago.", "D. restore the pagoda for three years."], "A", "Chuyển từ quá khứ đơn sang hiện tại hoàn thành với 'for three years'.", "PET_B1", "grammar"),
            ("Would you mind ________ down the air conditioner? It's freezing here.", ["A. turning", "B. turn", "C. to turn", "D. turned"], "A", "Sau 'Would you mind' dùng V-ing: 'turning down'.", "PET_B1", "grammar"),
            ("Hoi An is famous ________ its picturesque lantern-lit streets and yellow houses.", ["A. for", "B. with", "C. to", "D. at"], "A", "Nổi tiếng vì điều gì: 'famous for'.", "PET_B1", "grammar"),
            ("If you work harder, you will get better results. -> The harder you work, ________.", ["A. the better results you get", "B. better results you get", "C. the best results you get", "D. you get better results"], "A", "Cấu trúc so sánh kép: The + comp, the + comp.", "PET_B1", "grammar"),
            ("Solar power is an eco-friendly source of energy because it does not emit greenhouse ________.", ["A. gases", "B. smokes", "C. dusts", "D. steams"], "A", "Khí nhà kính: 'greenhouse gases'.", "PET_B1", "vocabulary"),
            ("She couldn't attend the study session ________ she had caught a severe cold.", ["A. since", "B. although", "C. despite", "D. so"], "A", "Liên từ chỉ nguyên nhân: 'since' (= because).", "PET_B1", "grammar"),
            ("My grandparents prefer living in the countryside because the pace of life is ________.", ["A. slower", "B. slowest", "C. slowly", "D. more slow"], "A", "Nhịp sống chậm rãi hơn: 'slower'.", "PET_B1", "vocabulary"),
            ("I don't know how to operate this 3D printer. -> I wish I ________ how to operate it.", ["A. knew", "B. know", "C. have known", "D. will know"], "A", "Câu ước hiện tại: wish + S + V quá khứ đơn ('knew').", "PET_B1", "grammar"),
            ("The environmental project was initiated ________ raise local awareness about recycling.", ["A. in order to", "B. so that", "C. because", "D. although"], "A", "Mục đích làm gì: 'in order to + V nguyên mẫu'.", "PET_B1", "grammar"),
            ("By the time we reached the cinema, the movie ________ already started.", ["A. had", "B. has", "C. was", "D. is"], "A", "Phối hợp thì By the time + quá khứ đơn, quá khứ hoàn thành ('had started').", "PET_B1", "grammar"),
            ("Could you show me the way to the national stadium? -> ________", ["A. Go straight ahead, then turn right at the crossroads.", "B. Yes, I do.", "C. No, I am not.", "D. It's expensive."], "A", "Chỉ dẫn đường đi lịch sự.", "PET_B1", "communication")
        ]
    },

    # ---------------- LỚP 10 ----------------
    {
        "id": "ex_g10_quick_5m",
        "curriculum_id": "curr_g10",
        "title": "Khởi Động 5 Phút: Cuộc Sống Gia Đình & Câu Bị Động (Lớp 10)",
        "description": "5 câu trắc nghiệm nhanh: Family Life, phân chia việc nhà (chores, breadwinner, homemaker) và câu bị động thì hiện tại đơn.",
        "grade": 10,
        "format_type": "quick_5m",
        "skill_category": "grammar_vocab",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("In many modern families, both parents share the financial burden as co-________.", ["A. breadwinners", "B. homemakers", "C. children", "D. servants"], "A", "Người trụ cột kiếm tiền nuôi gia đình: 'breadwinner'.", "FCE_B2", "vocabulary"),
            ("Household chores ________ equally among all members of our family.", ["A. are divided", "B. divide", "C. is divided", "D. dividing"], "A", "Bị động số nhiều hiện tại đơn: 'chores are divided'.", "FCE_B2", "grammar"),
            ("Sharing chores teaches teenagers how to become self-________ and responsible.", ["A. reliant", "B. heavy", "C. full", "D. sick"], "A", "Tự lực cánh sinh: 'self-reliant'.", "FCE_B2", "vocabulary"),
            ("Rubbish ________ out every evening after the kitchen is tidied up.", ["A. is taken", "B. takes", "C. took", "D. is taking"], "A", "Rác được đem đổ: 'Rubbish is taken out'.", "FCE_B2", "grammar"),
            ("Doing chores together strengthens the emotional ________ between family members.", ["A. bond", "B. chain", "C. wall", "D. lock"], "A", "Mối liên kết tình cảm gắn bó: 'emotional bond'.", "FCE_B2", "vocabulary")
        ]
    },
    {
        "id": "ex_g10_quick_15m",
        "curriculum_id": "curr_g10",
        "title": "Kiểm Tra 15 Phút: Humans and the Environment & Eco-Friendly Lifestyle (Lớp 10)",
        "description": "Kiểm tra 15 phút: Dấu chân carbon (carbon footprint), năng lượng tái tạo, rác thải nhựa và câu điều kiện loại 1 & 2.",
        "grade": 10,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Switching off lights when leaving the room helps reduce our household carbon ________.", ["A. footprint", "B. print", "C. shadow", "D. path"], "A", "Dấu chân carbon phát thải: 'carbon footprint'.", "FCE_B2", "vocabulary"),
            ("Single-use plastic bottles take hundreds of years to ________ in landfills.", ["A. decompose", "B. grow", "C. produce", "D. build"], "A", "Phân hủy tự nhiên: 'decompose'.", "FCE_B2", "vocabulary"),
            ("If everyone ________ public transport, air pollution in downtown areas would drop sharply.", ["A. used", "B. uses", "C. will use", "D. has used"], "A", "Câu điều kiện loại 2 giả định hiện tại: 'If everyone used... would drop'.", "FCE_B2", "grammar"),
            ("Eco-friendly products made from bamboo are completely ________ and non-toxic.", ["A. biodegradable", "B. synthetic", "C. chemical", "D. poisonous"], "A", "Có thể phân hủy sinh học: 'biodegradable'.", "FCE_B2", "vocabulary"),
            ("The school environmental club was established to raise student ________ about climate change.", ["A. awareness", "B. aware", "C. unaware", "D. awarenesses"], "A", "Nâng cao nhận thức: 'raise student awareness'.", "FCE_B2", "vocabulary"),
            ("Many coastal species are facing extinction because their natural habitats are being ________.", ["A. destroyed", "B. preserve", "C. creating", "D. protecting"], "A", "Bị động tiếp diễn: 'are being destroyed'.", "FCE_B2", "grammar"),
            ("Unless we take immediate actions, our oceans ________ filled with more plastic than fish by 2050.", ["A. will be", "B. are", "C. would be", "D. had been"], "A", "Câu điều kiện loại 1: Unless + hiện tại đơn, tương lai đơn ('will be').", "FCE_B2", "grammar"),
            ("Wind turbines and solar panels generate ________ energy without emitting greenhouse gases.", ["A. clean", "B. dirty", "C. toxic", "D. fossil"], "A", "Năng lượng sạch: 'clean energy'.", "FCE_B2", "vocabulary"),
            ("She volunteered to clean ________ the local canal on World Environment Day.", ["A. up", "B. off", "C. out", "D. down"], "A", "Dọn sạch rác thải: 'clean up'.", "FCE_B2", "grammar"),
            ("Can you tell me how to sort recyclables? -> ________", ["A. Put paper and plastics into the green bin and organic waste into the brown one.", "B. Yes, I do.", "C. No, I am busy.", "D. It is raining."], "A", "Hướng dẫn phân loại rác thải tái chế.", "FCE_B2", "communication")
        ]
    },

    # ---------------- LỚP 11 ----------------
    {
        "id": "ex_g11_quick_5m",
        "curriculum_id": "curr_g11",
        "title": "Khởi Động 5 Phút: Khoảng Cách Thế Hệ & Động Từ Khuyết Thiếu (Lớp 11)",
        "description": "5 câu trắc nghiệm nhanh: The Generation Gap, các động từ khuyết thiếu must, have to, should, ought to chỉ bổn phận và nghĩa vụ.",
        "grade": 11,
        "format_type": "quick_5m",
        "skill_category": "grammar_vocab",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Conflicts often arise between parents and teenagers due to the generation ________.", ["A. gap", "B. bridge", "C. wall", "D. hole"], "A", "Khoảng cách thế hệ: 'generation gap'.", "FCE_B2", "vocabulary"),
            ("You ________ respect your grandparents' traditional viewpoints even if you disagree.", ["A. should", "B. shouldn't", "C. mustn't", "D. needn't"], "A", "Lời khuyên đạo đức: 'should respect'.", "FCE_B2", "grammar"),
            ("Open and honest communication helps bridge the ideological ________ between generations.", ["A. divide", "B. border", "C. cut", "D. fence"], "A", "Sự ngăn cách, bất đồng quan điểm: 'ideological divide'.", "CAE_C1", "vocabulary"),
            ("According to school regulations, all students ________ wear their identity cards on campus.", ["A. must", "B. should", "C. may", "D. can"], "A", "Quy định bắt buộc của tổ chức: 'must wear'.", "FCE_B2", "grammar"),
            ("Many parents impose strict curfews because they worry ________ their children's safety at night.", ["A. about", "B. with", "C. on", "D. to"], "A", "Lo lắng về điều gì: 'worry about'.", "FCE_B2", "grammar")
        ]
    },
    {
        "id": "ex_g11_quick_15m",
        "curriculum_id": "curr_g11",
        "title": "Kiểm Tra 15 Phút: ASEAN & Di Sản Văn Hóa Thế Giới (Lớp 11)",
        "description": "Kiểm tra 15 phút: Quan hệ quốc tế khối ASEAN, bảo tồn di sản văn hóa, danh động từ hoàn thành (Having + V3) và mệnh đề phân từ.",
        "grade": 11,
        "format_type": "quick_15m",
        "skill_category": "mixed",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Vietnam officially joined the Association of Southeast Asian Nations (ASEAN) in ________.", ["A. 1995", "B. 1990", "C. 2000", "D. 1986"], "A", "Việt Nam gia nhập ASEAN vào năm 1995.", "FCE_B2", "culture"),
            ("________ the museum exhibition thoroughly, the students submitted an insightful research paper.", ["A. Having visited", "B. Have visited", "C. Visited", "D. Visit"], "A", "Mệnh đề phân từ hoàn thành chỉ hành động xảy ra trước: 'Having visited'.", "CAE_C1", "grammar"),
            ("Trang An Scenic Landscape Complex is Vietnam's only UNESCO World ________ Heritage site.", ["A. Mixed", "B. Cultural", "C. Natural", "D. Artificial"], "A", "Tràng An là di sản hỗn hợp (cả văn hóa và thiên nhiên): 'Mixed Heritage'.", "FCE_B2", "culture"),
            ("The summit aimed to foster economic cooperation and diplomatic ________ among member states.", ["A. solidarity", "B. dispute", "C. conflict", "D. rival"], "A", "Tình đoàn kết hữu nghị ngoại giao: 'diplomatic solidarity'.", "CAE_C1", "vocabulary"),
            ("She was commended for ________ helped organize the regional youth cultural exchange.", ["A. having", "B. has", "C. have", "D. had"], "A", "Sau giới từ for dùng danh động từ hoàn thành: 'for having helped'.", "CAE_C1", "grammar"),
            ("Preserving authentic intangible cultural heritage requires sustained financial and educational ________.", ["A. investment", "B. destruction", "C. ignorance", "D. neglect"], "A", "Đầu tư tài chính và giáo dục: 'investment'.", "FCE_B2", "vocabulary"),
            ("Quan Ho folk singing was inscribed on the Representative List of the Intangible Cultural Heritage of ________.", ["A. Humanity", "B. Universe", "C. Planet", "D. Nature"], "A", "Di sản văn hóa phi vật thể của nhân loại: 'Heritage of Humanity'.", "FCE_B2", "culture"),
            ("________ from a distance, the imperial citadel looks majestic against the blue sky.", ["A. Viewed", "B. Viewing", "C. View", "D. To view"], "A", "Phân từ quá khứ mang nghĩa bị động (được nhìn từ xa): 'Viewed from a distance'.", "CAE_C1", "grammar"),
            ("Youth ambassadors act as bridges to promote mutual ________ across diverse cultural backgrounds.", ["A. understanding", "B. misunderstanding", "C. doubt", "D. skepticism"], "A", "Sự hiểu biết lẫn nhau: 'mutual understanding'.", "FCE_B2", "vocabulary"),
            ("Congratulations on winning the ASEAN scholarship! -> ________", ["A. Thank you so much, it means the world to me!", "B. No problem.", "C. You're welcome.", "D. Never mind."], "A", "Đáp lại lời chúc mừng nồng nhiệt.", "FCE_B2", "communication")
        ]
    },

    # ---------------- LỚP 12 ----------------
    {
        "id": "ex_g12_quick_5m",
        "curriculum_id": "curr_g12",
        "title": "Khởi Động 5 Phút: Đảo Ngữ & Câu Chẻ Cleft Sentences (Lớp 12)",
        "description": "5 câu trắc nghiệm nhanh kiểm tra ngữ pháp nâng cao thi THPT Quốc Gia: Đảo ngữ với phó từ phủ định và câu chẻ It is/was... that.",
        "grade": 12,
        "format_type": "quick_5m",
        "skill_category": "grammar",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Seldom ________ such an eloquent and persuasive keynote address on artificial intelligence.", ["A. have I heard", "B. I have heard", "C. did I heard", "D. I had heard"], "A", "Đảo ngữ với phó từ phủ định 'Seldom' đứng đầu câu: trợ động từ + S + V.", "CAE_C1", "grammar"),
            ("It was her remarkable perseverance ________ enabled her to overcome insurmountable obstacles.", ["A. that", "B. which", "C. whom", "D. where"], "A", "Cấu trúc câu chẻ nhấn mạnh: 'It is/was... that...'.", "CAE_C1", "grammar"),
            ("Not only ________ late for the interview, but he also forgot to bring his credentials.", ["A. was he", "B. he was", "C. is he", "D. he is"], "A", "Đảo ngữ 'Not only was he late...'.", "CAE_C1", "grammar"),
            ("Hardly ________ into the library when the fire alarm began to ring loudly.", ["A. had she stepped", "B. she had stepped", "C. did she stepped", "D. has she stepped"], "A", "Cấu trúc 'Hardly had + S + V3... when...'.", "CAE_C1", "grammar"),
            ("Under no circumstances ________ you share your banking passwords with third parties.", ["A. should", "B. you should", "C. must you not", "D. you must"], "A", "Đảo ngữ với 'Under no circumstances should you...'.", "CAE_C1", "grammar")
        ]
    },
    {
        "id": "ex_g12_quick_15m",
        "curriculum_id": "curr_g12",
        "title": "Kiểm Tra 15 Phút: Chuyên Đề Cấu Tạo Từ Word Formation (Lớp 12)",
        "description": "Kiểm tra 15 phút chuyên sâu cấu tạo từ thi Tốt nghiệp THPT & ĐH: Danh từ chỉ người/vật, tính từ tiền tố phủ định và trạng từ biến thể.",
        "grade": 12,
        "format_type": "quick_15m",
        "skill_category": "vocabulary",
        "duration_minutes": 15,
        "total_questions": 10,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("The rapid pace of ________ has drawn rural workers toward major metropolitan centers. (URBAN)", ["A. urbanization", "B. urbanist", "C. urbanite", "D. urbanity"], "A", "Danh từ chỉ quá trình đô thị hóa: 'urbanization'.", "CAE_C1", "vocabulary"),
            ("Solar power is an infinitely ________ source of energy compared to coal and oil. (RENEW)", ["A. renewable", "B. renewed", "C. renewing", "D. renewal"], "A", "Tính từ năng lượng tái tạo: 'renewable'.", "FCE_B2", "vocabulary"),
            ("His argument was utterly ________ and lacked empirical evidence. (CONVINCE)", ["A. unconvincing", "B. convincing", "C. convinced", "D. unconvinced"], "A", "Tiền tố phủ định un- chỉ tính chất không thuyết phục: 'unconvincing'.", "CAE_C1", "vocabulary"),
            ("The municipal council demonstrated commendable ________ in managing the public health crisis. (DECIDE)", ["A. decisiveness", "B. decision", "C. decisive", "D. indecision"], "A", "Phẩm chất quyết đoán kiên quyết: 'decisiveness'.", "CPE_C2", "vocabulary"),
            ("High school students should develop ________ thinking skills to evaluate online claims. (CRITIC)", ["A. critical", "B. criticize", "C. criticism", "D. critically"], "A", "Tư duy phản biện: 'critical thinking'.", "FCE_B2", "vocabulary"),
            ("The ancient castle has been ________ restored to its original fourteenth-century grandeur. (METICULOUS)", ["A. meticulously", "B. meticulous", "C. meticulousness", "D. meticulouslyly"], "A", "Phó từ bổ nghĩa cho động từ restored: 'meticulously' (tỉ mỉ, cẩn trọng).", "CAE_C1", "grammar"),
            ("Excessive smartphone usage can be severely ________ to adolescents' mental well-being. (DETRIMENT)", ["A. detrimental", "B. detriment", "C. detrimentally", "D. undetrimental"], "A", "Có hại, gây tổn hại: tính từ 'detrimental to'.", "CAE_C1", "vocabulary"),
            ("Artificial intelligence is revolutionizing data ________ across banking and finance. (PROCESS)", ["A. processing", "B. processor", "C. processed", "D. processual"], "A", "Xử lý dữ liệu: 'data processing'.", "FCE_B2", "vocabulary"),
            ("A benevolent ________ donated five million dollars to build a cancer hospital. (BENEFACTOR)", ["A. benefactor", "B. benefaction", "C. beneficial", "D. beneficiary"], "A", "Nhà hảo tâm làm từ thiện: 'benefactor'.", "CAE_C1", "vocabulary"),
            ("She achieved ________ fluency in Japanese after studying in Tokyo for four years. (IMPRESS)", ["A. impressive", "B. impressed", "C. impression", "D. impressively"], "A", "Độ lưu loát ấn tượng: tính từ 'impressive'.", "FCE_B2", "vocabulary")
        ]
    },
    {
        "id": "ex_g12_standard_45m",
        "curriculum_id": "curr_g12",
        "title": "Đề Kiểm Tra 1 Tiết 45 Phút - Khảo Sát Tốt Nghiệp THPT (Lớp 12)",
        "description": "Đề kiểm tra 45 phút chuẩn cấu trúc đề thi Tốt nghiệp THPT Quốc Gia môn Tiếng Anh: Ngữ âm, trọng âm, tìm lỗi sai, từ đồng nghĩa/trái nghĩa, câu giao tiếp, viết lại câu và đọc hiểu điền từ.",
        "grade": 12,
        "format_type": "standard_45m",
        "skill_category": "mixed",
        "duration_minutes": 45,
        "total_questions": 25,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Choose the word whose underlined part is pronounced differently: breath<u>es</u>, bat<u>es</u>, cloth<u>es</u>, toothach<u>es</u>", ["A. bathes", "B. breathes", "C. clothes", "D. toothaches"], "D", "'toothaches' kết thúc bằng âm /ks/, đuôi phát âm là /s/, ba từ còn lại có đuôi phát âm là /z/.", "CAE_C1", "phonics"),
            ("Choose the word with different primary stress: e'conomy, com'mitment, ,under'stand, de'livery", ["A. understand", "B. economy", "C. commitment", "D. delivery"], "A", "'understand' trọng âm 3, các từ còn lại trọng âm 2.", "FCE_B2", "phonics"),
            ("Had he known about the severe traffic bottleneck, he ________ an alternate route. (Mixed Conditional)", ["A. would have taken", "B. would take", "C. took", "D. will take"], "A", "Đảo ngữ câu điều kiện loại 3: Had + S + V3, S + would have + V3.", "CAE_C1", "grammar"),
            ("The new CEO introduced pragmatic measures to ________ the company's financial viability. (Collocation)", ["A. bolster", "B. push", "C. lift", "D. pull"], "A", "Tăng cường, củng cố tính khả thi tài chính: 'bolster financial viability'.", "CAE_C1", "vocabulary"),
            ("Choose the word CLOSEST in meaning to 'tenacious': The detective was tenacious in pursuing the truth.", ["A. persistent", "B. indifferent", "C. hesitant", "D. careless"], "A", "'tenacious' đồng nghĩa với 'persistent' (kiên trì, bền bỉ bám đuổi).", "CAE_C1", "vocabulary"),
            ("Choose the word OPPOSITE in meaning to 'altruistic': His actions were deemed entirely altruistic.", ["A. selfish", "B. generous", "C. benevolent", "D. charitable"], "A", "'altruistic' (vị tha, hy sinh) trái nghĩa với 'selfish' (ích kỷ).", "CAE_C1", "vocabulary"),
            ("No sooner ________ the contract than a lucrative counteroffer was presented by a rival firm.", ["A. had they signed", "B. they had signed", "C. did they sign", "D. were they signing"], "A", "Cấu trúc đảo ngữ 'No sooner had + S + V3 than...'.", "CAE_C1", "grammar"),
            ("Find the error: The committee <u>insisted</u> that the budget <u>is</u> revised <u>prior to</u> the <u>annual</u> general meeting.", ["A. is", "B. insisted", "C. prior to", "D. annual"], "A", "Cấu trúc bàng thái cách Subjunctive: insist that S + (should) + be revised, không dùng 'is'.", "CAE_C1", "grammar"),
            ("The documentary offered a profound glimpse into the fragile marine ________ of the Great Barrier Reef.", ["A. ecosystem", "B. economics", "C. geology", "D. meteorology"], "A", "Hệ sinh thái biển mong manh: 'fragile marine ecosystem'.", "FCE_B2", "vocabulary"),
            ("She is fluent in French, German, and Spanish; ________, she has conversational mastery of Mandarin.", ["A. furthermore", "B. nevertheless", "C. whereas", "D. otherwise"], "A", "Liên từ bổ sung thông tin tích cực: 'furthermore' (hơn nữa, thêm vào đó).", "FCE_B2", "grammar"),
            ("It is imperative that every citizen ________ full responsibility for environmental protection.", ["A. take", "B. takes", "C. took", "D. is taking"], "A", "Thức giả định: It is imperative that + S + V nguyên mẫu ('take').", "CAE_C1", "grammar"),
            ("The candidate delivered an exceptionally ________ speech that swayed undecided voters.", ["A. eloquent", "B. silent", "C. mute", "D. awkward"], "A", "Bài phát biểu hùng biện lưu loát: 'eloquent speech'.", "CAE_C1", "vocabulary"),
            ("The historical novel was so captivating that I couldn't put it down. -> So captivating ________.", ["A. was the historical novel that I couldn't put it down", "B. the historical novel was that I couldn't put it down", "C. was that the novel I couldn't put down", "D. that the historical novel was I couldn't put it down"], "A", "Đảo ngữ với So + adj + be + S + that...", "CAE_C1", "grammar"),
            ("In urban planning, balancing modernization with historical ________ is a paramount challenge.", ["A. preservation", "B. devastation", "C. demolition", "D. destruction"], "A", "Bảo tồn di sản lịch sử: 'historical preservation'.", "FCE_B2", "vocabulary"),
            ("The young apprentice proved himself to be extraordinarily ________ in mastering complex algorithms.", ["A. diligent", "B. indolent", "C. lazy", "D. sluggish"], "A", "Chăm chỉ, cần mẫn: 'diligent'.", "FCE_B2", "vocabulary"),
            ("Neither the director nor his assistants ________ aware of the data breach until this morning.", ["A. were", "B. was", "C. is", "D. has been"], "A", "Neither A nor B: động từ hòa hợp theo chủ ngữ gần nhất 'assistants' (số nhiều quá khứ -> 'were').", "FCE_B2", "grammar"),
            ("The newly constructed suspension bridge has significantly eased suburban ________.", ["A. congestion", "B. space", "C. calmness", "D. silence"], "A", "Ùn tắc giao thông: 'traffic congestion'.", "FCE_B2", "vocabulary"),
            ("He wouldn't have failed the licensing exam if he ________ more attention during lectures.", ["A. had paid", "B. paid", "C. would pay", "D. pays"], "A", "Điều kiện loại 3: If + S + had + V3 ('had paid').", "FCE_B2", "grammar"),
            ("Scientists are investigating whether biodegradable plastics can safely break down in cold marine ________.", ["A. environments", "B. factories", "C. machines", "D. rooms"], "A", "Môi trường biển lạnh giá: 'marine environments'.", "FCE_B2", "vocabulary"),
            ("The debate team practiced late into the night; ________, they won the national championship cup.", ["A. consequently", "B. however", "C. whereas", "D. despite"], "A", "Chỉ kết quả: 'consequently' (kết quả là, do đó).", "FCE_B2", "grammar"),
            ("Rarely ________ seen such an overwhelming display of public solidarity after a natural catastrophe.", ["A. has the nation", "B. the nation has", "C. did the nation", "D. is the nation"], "A", "Đảo ngữ với Rarely: 'Rarely has the nation seen...'.", "CAE_C1", "grammar"),
            ("The company adopted a ________ approach to restructuring that minimized workforce layoffs.", ["A. pragmatic", "B. careless", "C. reckless", "D. hasty"], "A", "Phương pháp thực tiễn, có căn cứ: 'pragmatic approach'.", "CAE_C1", "vocabulary"),
            ("Much as she respected her mentor, she ________ to accept his controversial proposition.", ["A. declined", "B. agreed", "C. welcomed", "D. praised"], "A", "Dù rất tôn trọng người thầy, cô vẫn từ chối lời đề nghị: 'declined'.", "CAE_C1", "grammar"),
            ("The university offers comprehensive ________ guidance for students transitioning into the labor market.", ["A. vocational", "B. vocal", "C. voice", "D. vacation"], "A", "Định hướng nghề nghiệp: 'vocational guidance'.", "FCE_B2", "vocabulary"),
            ("I appreciate your unwavering guidance and support throughout my thesis research! -> ________", ["A. It was an absolute pleasure working alongside you.", "B. No thanks.", "C. Yes, please.", "D. It doesn't matter."], "A", "Phản hồi học thuật lịch sự, chân thành.", "CAE_C1", "communication")
        ]
    },

    # ---------------- CAMBRIDGE & QUỐC TẾ (KET, PET, IELTS) ----------------
    {
        "id": "ex_ket_quick_5m",
        "curriculum_id": "curr_ket",
        "title": "Khởi Động 5 Phút: Từ Vựng Trọng Tâm Cambridge KET (A2)",
        "description": "5 câu trắc nghiệm nhanh: Biển báo thông báo nơi công cộng và từ vựng cốt lõi KET A2.",
        "grade": 0,
        "format_type": "quick_5m",
        "skill_category": "vocabulary",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Notice: 'Please keep off the grass!' -> What does this mean?", ["A. Do not walk on the grass", "B. You can play football on the grass", "C. Cut the grass now", "D. Water the grass"], "A", "Biển báo 'Keep off the grass' nghĩa là không được giẫm lên cỏ.", "KET_A2", "reading"),
            ("Notice: 'Buy one coffee, get one free before 9:00 AM!' -> What does this mean?", ["A. Morning coffee is cheaper", "B. Coffee is served only at 9:00 AM", "C. You cannot buy coffee in the morning", "D. Coffee is free all day"], "A", "Mua 1 tặng 1 trước 9h nghĩa là cà phê buổi sáng rẻ hơn.", "KET_A2", "reading"),
            ("I need to buy a return train ________ to Oxford.", ["A. ticket", "B. book", "C. letter", "D. stamp"], "A", "Vé tàu khứ hồi: 'return train ticket'.", "KET_A2", "vocabulary"),
            ("Can you help me ________ my lost luggage at the airport counter?", ["A. find", "B. look", "C. see", "D. watch"], "A", "Tìm hành lý thất lạc: 'find my lost luggage'.", "KET_A2", "vocabulary"),
            ("The museum admission fee is ________ for children under 6 years old.", ["A. free", "B. expensive", "C. costly", "D. high"], "A", "Miễn phí cho trẻ em: 'free'.", "KET_A2", "vocabulary")
        ]
    },
    {
        "id": "ex_pet_quick_5m",
        "curriculum_id": "curr_pet",
        "title": "Khởi Động 5 Phút: Biển Báo & Đoạn Văn Ngắn Cambridge PET (B1)",
        "description": "5 câu trắc nghiệm nhanh chuẩn format B1 Preliminary: Giải mã biển báo, thông báo email ngắn và từ vựng B1.",
        "grade": 0,
        "format_type": "quick_5m",
        "skill_category": "reading",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 60,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Email notice: 'Library renovation: The second floor will remain closed until Friday.' What does this mean?", ["A. Students cannot access second floor books before Friday.", "B. The entire library is closed forever.", "C. Renovation starts on Friday.", "D. The first floor is closed."], "A", "Tầng 2 đóng cửa sửa chữa tới thứ Sáu nghĩa là học sinh không thể vào tầng 2 trước thứ Sáu.", "PET_B1", "reading"),
            ("He is really keen ________ learning digital photography and photo editing.", ["A. on", "B. in", "C. at", "D. with"], "A", "Cụm 'keen on + V-ing' (say mê, thích thú).", "PET_B1", "grammar"),
            ("Although it rained cats and dogs, the outdoor music concert was not ________ off.", ["A. called", "B. put", "C. taken", "D. made"], "A", "Hủy bỏ buổi hòa nhạc: 'called off'.", "PET_B1", "vocabulary"),
            ("The hotel staff apologized for the unexpected delay in ________ our room.", ["A. preparing", "B. prepare", "C. prepared", "D. preparation"], "A", "Sau giới từ in dùng V-ing: 'preparing'.", "PET_B1", "grammar"),
            ("She managed to solve the challenging crossword puzzle entirely on her ________.", ["A. own", "B. self", "C. single", "D. alone"], "A", "Cụm tự mình làm không cần trợ giúp: 'on her own'.", "PET_B1", "grammar")
        ]
    },
    {
        "id": "ex_ielts_quick_5m",
        "curriculum_id": "curr_ielts",
        "title": "Khởi Động 5 Phút: Academic Collocations IELTS Band 7.0+",
        "description": "5 câu trắc nghiệm nhanh kiểm tra cụm từ học thuật AVL cốt lõi cho IELTS Academic Reading & Writing Task 2.",
        "grade": 0,
        "format_type": "quick_5m",
        "skill_category": "vocabulary",
        "duration_minutes": 5,
        "total_questions": 5,
        "pass_percentage": 70,
        "created_by": "Cô Nguyễn Hương",
        "is_published": 1,
        "questions": [
            ("Governments should allocate substantial funding to ________ medical research on infectious diseases.", ["A. expedite", "B. slow", "C. delay", "D. hinder"], "A", "Thúc đẩy nhanh tiến độ nghiên cứu: 'expedite medical research'.", "IELTS_7", "vocabulary"),
            ("Deforestation contributes significantly to biodiversity loss, thereby ________ vulnerable wildlife populations.", ["A. jeopardizing", "B. safe", "C. securing", "D. nurturing"], "A", "Đe dọa, đặt vào vòng hiểm nguy: 'jeopardizing vulnerable populations'.", "IELTS_7", "vocabulary"),
            ("Urban planners must adopt sustainable practices to ________ with the demands of rapid population influx.", ["A. cope", "B. meet", "C. lead", "D. stand"], "A", "Đương đầu và thích nghi với thách thức: 'cope with demands'.", "IELTS_7", "vocabulary"),
            ("There is compelling empirical evidence demonstrating the ________ correlation between regular exercise and longevity.", ["A. positive", "B. hostile", "C. negative", "D. false"], "A", "Mối tương quan đồng thuận tích cực: 'positive correlation'.", "IELTS_7", "vocabulary"),
            ("Proponents argue that artificial intelligence will ________ unprecedented productivity across global economies.", ["A. catalyze", "B. freeze", "C. abolish", "D. dampen"], "A", "Xúc tác, thúc đẩy mạnh mẽ: 'catalyze productivity'.", "IELTS_7", "vocabulary")
        ]
    }
]

# Insert or update new exams and questions
added_exams = 0
added_questions = 0

for item in new_exams_def:
    ex_id = item['id']
    q_list = item.pop('questions', [])
    
    # Check if exam already exists
    existing = next((e for e in exams if e['id'] == ex_id), None)
    if existing:
        existing.update({
            "title": item['title'],
            "description": item['description'],
            "duration_minutes": item['duration_minutes'],
            "format_type": item['format_type'],
            "total_questions": len(q_list),
            "grade": item['grade']
        })
    else:
        exams.append({
            "id": item['id'],
            "curriculum_id": item['curriculum_id'],
            "title": item['title'],
            "description": item['description'],
            "grade": item['grade'],
            "format_type": item['format_type'],
            "skill_category": item['skill_category'],
            "duration_minutes": item['duration_minutes'],
            "total_questions": len(q_list),
            "pass_percentage": item['pass_percentage'],
            "created_by": item['created_by'],
            "is_published": 1,
            "created_at": "2026-09-25 05:30:00"
        })
        added_exams += 1

    # Remove previous questions for this exam to ensure fresh questions
    questions = [q for q in questions if q.get('exam_id') != ex_id]

    # Add questions
    for idx, (prompt, options, correct, expl, level, skill) in enumerate(q_list, start=1):
        max_q_id += 1
        questions.append({
            "exam_id": ex_id,
            "question_index": idx,
            "grade": item['grade'],
            "skill": skill,
            "type": "multiple_choice",
            "prompt": prompt,
            "options_json": json.dumps(options, ensure_ascii=False),
            "correct_answer": correct,
            "explanation": expl,
            "cambridge_level": level,
            "id": max_q_id
        })
        added_questions += 1

print(f"--> Exams DB updated: Added {added_exams} new exams, Total: {len(exams)} exams!")
print(f"--> Questions Bank updated: Added {added_questions} questions, Total: {len(questions)} questions!")

with open(exams_path, 'w', encoding='utf-8') as f:
    json.dump(exams, f, ensure_ascii=False, indent=2)

with open(questions_path, 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

# -------------------------------------------------------------
# SYNC SQLITE `exams` AND `exam_questions` TABLES
# -------------------------------------------------------------
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Upsert exams into SQLite
for e in exams:
    cursor.execute("SELECT id FROM exams WHERE id = ?", (e['id'],))
    row = cursor.fetchone()
    if row:
        cursor.execute("""
            UPDATE exams SET
                title = ?, description = ?, grade = ?, format_type = ?,
                skill_category = ?, duration_minutes = ?, total_questions = ?,
                pass_percentage = ?, created_by = ?, is_published = ?
            WHERE id = ?
        """, (
            e['title'], e['description'], e['grade'], e['format_type'],
            e.get('skill_category', 'mixed'), e['duration_minutes'], e['total_questions'],
            e.get('pass_percentage', 70), e.get('created_by', 'Teacher'), e.get('is_published', 1),
            e['id']
        ))
    else:
        cursor.execute("""
            INSERT INTO exams (
                id, curriculum_id, title, description, grade, format_type,
                skill_category, duration_minutes, total_questions, pass_percentage,
                created_by, is_published, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            e['id'], e.get('curriculum_id', 'curr_general'), e['title'], e['description'],
            e['grade'], e['format_type'], e.get('skill_category', 'mixed'), e['duration_minutes'],
            e['total_questions'], e.get('pass_percentage', 70), e.get('created_by', 'Teacher'),
            e.get('is_published', 1), e.get('created_at', '2026-09-25 05:30:00')
        ))

# Upsert questions into SQLite
cursor.execute("DELETE FROM exam_questions")
for idx, q in enumerate(questions, start=1):
    q['id'] = idx
    cursor.execute("""
        INSERT INTO exam_questions (
            id, exam_id, question_index, grade, skill, type,
            prompt, options_json, correct_answer, explanation, cambridge_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        idx, q.get('exam_id', ''), q.get('question_index', 1),
        int(q.get('grade', 0)), str(q.get('skill', 'grammar_vocab')), str(q.get('type', 'multiple_choice')),
        q.get('prompt', ''), q.get('options_json', '[]'),
        q.get('correct_answer', 'A'), q.get('explanation', ''),
        q.get('cambridge_level', 'KET_A2')
    ))

conn.commit()

# Also save questions.json with cleaned sequential integer ids
with open(questions_path, 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

cursor.execute("SELECT COUNT(*) FROM exams")
sqlite_exams_count = cursor.fetchone()[0]
cursor.execute("SELECT COUNT(*) FROM exam_questions")
sqlite_q_count = cursor.fetchone()[0]

print(f"--> SQLite 'exams' table synced: {sqlite_exams_count} records!")
print(f"--> SQLite 'exam_questions' table synced: {sqlite_q_count} records!")
conn.close()

print("\n=== MATRIX ENRICHMENT COMPLETED SUCCESSFULLY! ===")
