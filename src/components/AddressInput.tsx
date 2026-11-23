"use client";

import { useState } from "react";
import { Search } from "lucide-react";

// 카카오(다음) 우편번호 서비스: 키 없이 쓰는 주소 검색창. 검색해서 고른 주소만 입력된다.
interface Result {
  roadAddress: string;
  jibunAddress: string;
  buildingName: string;
}
declare global {
  interface Window {
    daum?: { Postcode: new (o: { oncomplete: (d: Result) => void }) => { open: () => void } };
  }
}

let loading: Promise<void> | null = null;
const load = () =>
  window.daum
    ? Promise.resolve()
    : (loading ??= new Promise<void>((ok, fail) => {
        const s = document.createElement("script");
        s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
        s.onload = () => ok();
        s.onerror = () => {
          loading = null;
          fail();
        };
        document.head.append(s);
      }));

export default function AddressInput({ value, onChange, notify }: { value: string; onChange: (v: string) => void; notify: (m: string) => void }) {
  const [base, setBase] = useState(value);
  const [detail, setDetail] = useState("");
  const join = (b: string, d: string) => `${b} ${d.trim()}`.trim();

  async function search() {
    try {
      await load();
    } catch {
      return notify("주소 검색을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
    new window.daum!.Postcode({
      oncomplete: (d) => {
        const b = (d.roadAddress || d.jibunAddress) + (d.buildingName ? ` (${d.buildingName})` : "");
        setBase(b);
        onChange(join(b, detail));
      },
    }).open();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="field cursor-pointer" readOnly value={base} placeholder="주소 검색을 눌러 찾아 주세요" onClick={search} aria-label="주소" />
        <button type="button" className="btn shrink-0" onClick={search}>
          <Search size={14} /> 주소 검색
        </button>
      </div>
      {base && (
        <input
          className="field"
          value={detail}
          placeholder="상세 주소(층·호수, 선택)"
          onChange={(e) => {
            setDetail(e.target.value);
            onChange(join(base, e.target.value));
          }}
        />
      )}
    </div>
  );
}
