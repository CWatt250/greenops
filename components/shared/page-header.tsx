import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-end justify-between gap-6 mb-6 pb-5 border-b border-border',
        className
      )}
    >
      <div>
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-[600px]">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
