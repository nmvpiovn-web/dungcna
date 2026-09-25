import json

inventory = json.load(open('scripts/all_gdrive_inventory.json', 'r', encoding='utf-8'))
all_files = inventory['all']

print(f"Total files: {len(all_files)}")

categories = {
    'ket_pet_ielts': ['ket', 'pet', 'ielts', 'fce', 'cambridge', 'flyers', 'starters', 'movers'],
    'hsg_chuyen': ['chuyen', 'hsg', 'olympic', 'hoc sinh gioi'],
    'thpt_vào_10': ['thpt', 'tuyen sinh 10', 'vao 10', 'quoc gia'],
    'ngu_phap': ['grammar', 'ngu phap', 'chuyen de', 'cau hoi', 'trac nghiem', 'viet lai cau', 'bien doi cau'],
    'tu_vung': ['vocab', 'tu vung', 'word formation', 'collocation', 'idiom', 'phrasal verb'],
    'primary_1_5': ['lop 1', 'lop 2', 'lop 3', 'lop 4', 'lop 5', 'grade 1', 'grade 2', 'grade 3', 'grade 4', 'grade 5'],
    'secondary_6_9': ['lop 6', 'lop 7', 'lop 8', 'lop 9', 'grade 6', 'grade 7', 'grade 8', 'grade 9'],
    'high_10_12': ['lop 10', 'lop 11', 'lop 12', 'grade 10', 'grade 11', 'grade 12']
}

results = {}
for cat, terms in categories.items():
    matched = []
    for f in all_files:
        name_lower = f['name'].lower()
        if any(t in name_lower for t in terms):
            matched.append(f)
    results[cat] = matched
    print(f"Category '{cat}': {len(matched)} files")

# Save summary
with open('scripts/categorized_gdrive_files.json', 'w', encoding='utf-8') as f:
    json.dump({k: [{'id': x['id'], 'name': x['name'], 'size': x.get('size', 0), 'mime': x.get('mimeType')} for x in v[:100]] for k, v in results.items()}, f, indent=2, ensure_ascii=False)
print("Saved top 100 per category to scripts/categorized_gdrive_files.json")
