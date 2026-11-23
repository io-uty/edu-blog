/** 휴대폰 번호를 숫자만 남겨 정규화한다. 010 등 휴대폰 번호가 아니면 null. */
export const toPhone = (s: string) => {
  const d = s.replace(/\D/g, "");
  return /^01[016-9]\d{7,8}$/.test(d) ? d : null;
};
