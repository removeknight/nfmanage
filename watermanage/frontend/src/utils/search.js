import { pinyin } from "pinyin-pro";

const compact = (value) =>
  String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[\s\u3000]+/g, "");

export function matchesSearch(value, query) {
  const terms = String(query ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;
  const text = String(value ?? "");
  const haystack = [
    compact(text),
    compact(pinyin(text, { toneType: "none" })),
    compact(pinyin(text, { pattern: "first", toneType: "none" })),
  ].join(" ");
  return terms.every((term) => {
    const candidates = [
      compact(term),
      compact(pinyin(term, { toneType: "none" })),
      compact(pinyin(term, { pattern: "first", toneType: "none" })),
    ];
    return candidates.some(
      (candidate) => candidate && haystack.includes(candidate),
    );
  });
}
