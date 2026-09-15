import * as React from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          'h-9 w-full appearance-none rounded-4xl border border-input bg-input/30 pr-9 pl-3 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <CaretDownIcon
        aria-hidden
        weight="bold"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
