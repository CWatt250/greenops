'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface DroppableCellProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  isToday?: boolean;
}

export function DroppableCell({ id, children, className, isToday }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[80px] rounded-lg p-1.5 transition-colors duration-100 space-y-1.5',
        isToday && 'ring-1 ring-primary/30 bg-primary/5',
        isOver && 'bg-primary/15 ring-2 ring-primary',
        className
      )}
    >
      {children}
    </div>
  );
}
