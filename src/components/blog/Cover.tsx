import type { Post } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Image-free cover: niche color field with a large initial and the niche name. */
export function Cover({ post, className, size = "md" }: { post: Post; className?: string; size?: "sm" | "md" | "lg" }) {
  const color = post.niche?.color ?? "#d9480f";
  const initial = post.title.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase();
  return (
    <div
      className={cn("relative overflow-hidden bg-ink", className)}
      style={{ backgroundImage: `radial-gradient(circle at 80% 20%, ${color} 0%, transparent 60%), linear-gradient(135deg, ${color}cc, ${color}33)` }}
      aria-hidden
    >
      <span
        className={cn(
          "absolute -bottom-[0.18em] right-[0.06em] font-black leading-none text-ink-foreground/25 select-none",
          size === "sm" && "text-6xl",
          size === "md" && "text-[8rem]",
          size === "lg" && "text-[14rem]",
        )}
      >
        {initial}
      </span>
      <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_23px,oklch(1_0_0/0.05)_24px)]" />
    </div>
  );
}

export function NicheBadge({ post }: { post: Post }) {
  if (!post.niche) return null;
  return (
    <span className="inline-block bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-foreground">
      {post.niche.name}
    </span>
  );
}
