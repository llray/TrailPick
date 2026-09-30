import type { Metadata } from "next";
import { getVote } from "@/lib/votes";
import { getRoutesLite } from "@/lib/vote-helpers";
import { VoteRoom } from "@/components/VoteRoom";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const room = getVote(params.id);
  if (!room) return { title: "投票不存在" };
  const routes = await getRoutesLite(room.routeIds);
  const names = routes.map((r) => r.name_cn).slice(0, 4).join(" / ");
  return {
    title: "🥾 " + room.title + " · " + routes.length + " 条路线等你投票",
    description: "候选路线：" + names + "。点击即可投票，无需安装 App。",
    openGraph: {
      title: "🥾 " + room.title,
      description: routes.length + " 条路线等你投票：" + names + "… 👉 点击投票",
      type: "website",
    },
  };
}

export default function VoteRoomPage({ params }: Props) {
  const room = getVote(params.id);
  if (!room) {
    return (
      <div className="py-24 text-center">
        <p className="text-[40px]">🕳️</p>
        <h1 className="mt-2 font-display text-[22px] font-bold">投票箱不存在或已失效</h1>
        <p className="mt-1 text-[14px] text-[color:var(--ink-3)]">检查一下链接，或发起新的路线投票</p>
      </div>
    );
  }
  return <VoteRoom voteId={params.id} />;
}
