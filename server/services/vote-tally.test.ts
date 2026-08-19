import { describe, expect, it } from "vitest";
import { tallyByMember } from "./vote-tally";

const at = (s: number) => new Date(2026, 0, 1, 0, 0, s);

/** خريطة بسيطة: الحساب ← عضويته */
const map = (pairs: Record<string, string | null>) => (userId: string) => pairs[userId];

describe("فرز الأصوات على الأعضاء", () => {
  it("يعدّ العضو مرة واحدة مهما بلغت حساباته", () => {
    const tally = tallyByMember(
      [
        { userId: "a1", vote: "approve", createdAt: at(1) },
        { userId: "a2", vote: "approve", createdAt: at(2) },
        { userId: "b1", vote: "approve", createdAt: at(3) },
      ],
      map({ a1: "m1", a2: "m1", b1: "m2" }),
    );

    expect(tally.approve).toBe(2);
    expect(tally.reject).toBe(0);
  });

  it("يأخذ الأحدث حين يختلف حسابا عضو واحد", () => {
    const tally = tallyByMember(
      [
        { userId: "a1", vote: "approve", createdAt: at(1) },
        { userId: "a2", vote: "reject", createdAt: at(9) },
      ],
      map({ a1: "m1", a2: "m1" }),
    );

    expect(tally.approve).toBe(0);
    expect(tally.reject).toBe(1);
  });

  it("لا يتأثر بترتيب ورود الأصوات", () => {
    const votes = [
      { userId: "a2", vote: "reject", createdAt: at(9) },
      { userId: "a1", vote: "approve", createdAt: at(1) },
    ];
    expect(tallyByMember(votes, map({ a1: "m1", a2: "m1" }))).toMatchObject({ approve: 0, reject: 1 });
  });

  it("يستبعد الحساب بلا عضوية ويحصيه على حدة", () => {
    const tally = tallyByMember(
      [
        { userId: "a1", vote: "approve", createdAt: at(1) },
        { userId: "ghost", vote: "approve", createdAt: at(2) },
      ],
      map({ a1: "m1", ghost: null }),
    );

    expect(tally.approve).toBe(1);
    expect(tally.unlinked).toBe(1);
  });

  it("يعيد أصفاراً بلا أصوات", () => {
    expect(tallyByMember([], map({}))).toEqual({ approve: 0, reject: 0, unlinked: 0 });
  });

  it("يتحمّل صوتاً بلا طابع زمني", () => {
    const tally = tallyByMember(
      [{ userId: "a1", vote: "approve" }, { userId: "b1", vote: "reject" }],
      map({ a1: "m1", b1: "m2" }),
    );
    expect(tally).toMatchObject({ approve: 1, reject: 1 });
  });
});
