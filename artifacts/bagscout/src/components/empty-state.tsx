import { ReactNode } from "react";
import { FolderSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  actionOnClick?: () => void;
}

export function EmptyState({
  icon = <FolderSearch className="w-12 h-12 text-muted-foreground/50" />,
  title,
  description,
  actionLabel,
  actionHref,
  actionOnClick
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-border bg-card/50">
      <div className="mb-6 p-4 rounded-full bg-secondary/50">
        {icon}
      </div>
      <h3 className="text-xl font-serif font-semibold mb-2 text-foreground">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
        {description}
      </p>
      
      {actionLabel && (
        actionHref ? (
          <Button asChild className="rounded-none px-8 font-medium uppercase tracking-wider text-xs h-12">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : (
          <Button onClick={actionOnClick} className="rounded-none px-8 font-medium uppercase tracking-wider text-xs h-12">
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
}