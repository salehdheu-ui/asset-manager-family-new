/**
 * فرز الأصوات على الأعضاء لا على الحسابات.
 *
 * النصاب يُحسب بعدد **الأعضاء** المؤهلين (`countEligibleVoters` يجمع
 * `memberId` في مجموعة)، بينما الأصوات كانت تُعدّ بعدد **الحسابات**: الفهرس
 * الفريد على جدولَي التصويت مفتاحه `(الطلب، المستخدم)`، و`users.memberId` بلا
 * قيد تفرّد، والوصي يستطيع ربط أكثر من حساب بعضو واحد.
 *
 * فمقام الكسر أعضاء وبسطه حسابات. وعضو له حسابان يصوّت مرتين على سلفة تتجاوز
 * حدّ التصويت: أربعة أعضاء، والنصاب ثلاثة، فيمرّ الطلب برضا **شخصين** لا
 * ثلاثة — في الموضع الذي وُضع التصويت أصلاً ليحرسه.
 *
 * وتعليق `castProposalVote` يقول «الصوت الواحد لكل عضو» — وهذا ما يجعله صحيحاً.
 */

export interface CountableVote {
  userId: string;
  vote: string;
  createdAt?: Date | string | null;
}

export interface MemberTally {
  approve: number;
  reject: number;
  /** حسابات صوّتت ولا عضوية لها — لا تُحتسب، وتُذكر لتفسير الفرق */
  unlinked: number;
}

const time = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : 0;

/**
 * يجمع الأصوات على أصحابها من الأعضاء.
 *
 * حسابان لعضو واحد اختلفا؟ يُؤخذ الأحدث — العضو غيّر رأيه، لا أنه صار اثنين.
 * وحساب بلا عضوية لا يُحتسب: النصاب على الأعضاء، فمن ليس عضواً ليس في المقام.
 */
export function tallyByMember(
  votes: CountableVote[],
  memberOf: (userId: string) => string | null | undefined,
): MemberTally {
  const latestPerMember = new Map<string, CountableVote>();
  let unlinked = 0;

  for (const vote of votes) {
    const memberId = memberOf(vote.userId);
    if (!memberId) {
      unlinked += 1;
      continue;
    }
    const held = latestPerMember.get(memberId);
    if (!held || time(vote.createdAt) >= time(held.createdAt)) {
      latestPerMember.set(memberId, vote);
    }
  }

  let approve = 0;
  let reject = 0;
  latestPerMember.forEach((vote) => {
    if (vote.vote === "approve") approve += 1;
    else if (vote.vote === "reject") reject += 1;
  });

  return { approve, reject, unlinked };
}
