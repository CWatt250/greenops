import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Optional secondary text-button below the primary CTA. */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">{description}</p>
      )}
      {action && (
        <Button
          onClick={action.onClick}
          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        >
          {action.label}
        </Button>
      )}
      {secondaryAction && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {secondaryAction.label}
        </button>
      )}
    </div>
  );
}
