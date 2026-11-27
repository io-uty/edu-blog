// 학원 사진 보관함. 올려 둔 실제 사진을 이미지 배경으로 써서 AI 그림 생성을 건너뛴다. 브라우저(IndexedDB) 전용.
// shortcut: 이 브라우저에만 저장된다. 여러 기기에서 쓰려면 Supabase Storage 로 옮긴다.
import { idbDel, idbGet, idbSet } from "./idb";
import { loadImage } from "./imageRender";

const INDEX = "photos:index";
const key = (id: string) => `photo:${id}`;
export const MAX_PHOTOS = 30;

export async function listPhotoIds(): Promise<string[]> {
  try {
    return JSON.parse((await idbGet(INDEX)) ?? "[]");
  } catch {
    return [];
  }
}

export const getPhoto = (id: string) => idbGet(key(id));

/** 긴 변 1280px JPEG 로 줄여 저장한다(장당 수백 KB). */
export async function addPhoto(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const sc = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * sc);
    c.height = Math.round(img.height * sc);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const id = crypto.randomUUID();
    if (!(await idbSet(key(id), c.toDataURL("image/jpeg", 0.85)))) return false;
    return idbSet(INDEX, JSON.stringify([...(await listPhotoIds()), id]));
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function removePhoto(id: string) {
  await idbSet(INDEX, JSON.stringify((await listPhotoIds()).filter((x) => x !== id)));
  await idbDel(key(id));
}

/** used 에 없는 사진을 우선 무작위로 고른다(한 글 안에서 같은 사진 반복을 피함). */
export function pickPhoto(ids: string[], used: string[]): string | undefined {
  const fresh = ids.filter((x) => !used.includes(x));
  const pool = fresh.length ? fresh : ids;
  return pool[Math.floor(Math.random() * pool.length)];
}
