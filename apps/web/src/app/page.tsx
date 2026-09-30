import { Suspense } from "react";
import { Discover } from "@/components/Discover";

export default function Home() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[color:var(--ink-3)]">加载中…</div>}>
      <Discover />
    </Suspense>
  );
}
