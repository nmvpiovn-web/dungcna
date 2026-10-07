import { getStaticWords, getStaticUnits } from '$lib/staticDb.js';

export function load() {
  return {
    seo: {"title": "Từ Điển Tiếng Anh & Phát Âm IPA | Tiếng Anh Cô Dung", "description": "Tra cứu từ điển tiếng Anh, phát âm IPA chuẩn Anh-Mỹ, ví dụ minh họa."},
    words: getStaticWords(),
    units: getStaticUnits()
  };
}
