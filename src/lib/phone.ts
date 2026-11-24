/** 휴대폰 번호를 숫자만 남겨 정규화한다. 010 등 휴대폰 번호가 아니면 null. */
export const toPhone = (s: string) => {
  const d = s.replace(/\D/g, "");
  return /^01[016-9]\d{7,8}$/.test(d) ? d : null;
};

/** 입력 중인 휴대폰 번호에 하이픈을 붙인다(010-1234-5678, 10자리면 011-123-4567). */
export const formatPhone = (s: string) => {
  const d = s.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  const mid = d.length === 10 ? 6 : 7;
  return `${d.slice(0, 3)}-${d.slice(3, mid)}-${d.slice(mid)}`;
};
