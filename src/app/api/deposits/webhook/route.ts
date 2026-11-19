import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { processDeposit } from "@/lib/bank";

export const dynamic = "force-dynamic";

/**
 * 입금 알림 웹훅. 은행 조회 서비스나 입금 문자 전달 자동화가 입금이 확인될 때마다 호출한다.
 *   POST /api/deposits/webhook
 *   Authorization: Bearer <DEPOSIT_WEBHOOK_SECRET>
 *   { "txId": "거래 고유번호", "amount": 29000, "depositorName": "홍길동", "occurredAt": "2026-11-22T10:00:00+09:00" }
 * 금액과 입금자명이 대기 중인 주문 하나와 정확히 맞을 때만 자동으로 이용권을 켠다.
 * 비밀값이 설정되지 않았으면 이 주소는 존재하지 않는 것처럼 404 를 돌려준다.
 */
export async function POST(req: Request) {
  const secret = process.env.DEPOSIT_WEBHOOK_SECRET ?? "";
  if (secret.length < 24) return new Response("Not Found", { status: 404 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const p = z
    .object({ txId: z.string().min(6).max(100), amount: z.number().int().positive(), depositorName: z.string().min(1).max(60), occurredAt: z.string().max(40).optional() })
    .safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "invalid body" }, { status: 400 });
  try {
    const r = await processDeposit({ ...p.data, source: "webhook" });
    return Response.json(r);
  } catch {
    return Response.json({ error: "failed" }, { status: 500 }); // 호출한 쪽이 다시 보낼 수 있다(같은 거래번호는 중복 처리되지 않음)
  }
}
