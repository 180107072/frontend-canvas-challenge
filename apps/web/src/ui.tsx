import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from 'cn';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button as ButtonPrimitive } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { RequestError } from './api/client';

export { Input } from '@/components/ui/input';
export { Textarea } from '@/components/ui/textarea';
export { Select } from '@/components/ui/select';

export type Tone = 'idle' | 'busy' | 'ok' | 'warn' | 'error';

const TONE_CLASS: Record<Tone, string> = {
  idle: 'text-muted-foreground',
  busy: 'text-primary',
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  error: 'text-destructive',
};
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      {children(id)}
      {hint ? (
        <p className="text-xs text-muted-foreground" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface ButtonProps extends ComponentProps<typeof ButtonPrimitive> {
  busy?: boolean;
}
export function Button({ busy, disabled, size = 'sm', ...rest }: ButtonProps) {
  return (
    <ButtonPrimitive
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      size={size}
      {...rest}
    />
  );
}

export function Status({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span aria-live="polite" className={cn('text-xs', TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
export function ErrorNote({
  error,
  action,
  onAction,
}: {
  error: RequestError | null;
  action?: string;
  onAction?: () => void;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>{error.message}</span>
        {action && onAction ? (
          <Button size="xs" variant="outline" onClick={onAction}>
            {action}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
