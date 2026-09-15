import {
  CloudArrowUpIcon,
  CloudCheckIcon,
  CloudIcon,
  CloudSlashIcon,
  CloudWarningIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { Tone } from './ui';
export interface SaveFlags {
  conflict: boolean;
  saving: boolean;
  failed: boolean;
  dirty: boolean;
}
export const SAVE_RULES = [
  {
    status: 'conflict',
    when: (f: SaveFlags) => f.conflict,
    tone: 'warn',
    icon: CloudWarningIcon,
    text: 'Граф на сервере изменился',
  },
  {
    status: 'saving',
    when: (f: SaveFlags) => f.saving,
    tone: 'busy',
    icon: CloudArrowUpIcon,
    text: 'Сохранение…',
  },
  {
    status: 'error',
    when: (f: SaveFlags) => f.failed,
    tone: 'error',
    icon: CloudSlashIcon,
    text: 'Не удалось сохранить',
  },
  {
    status: 'dirty',
    when: (f: SaveFlags) => f.dirty,
    tone: 'idle',
    icon: CloudIcon,
    text: 'Есть несохранённые изменения',
  },
  {
    status: 'saved',
    when: (_f: SaveFlags) => true,
    tone: 'ok',
    icon: CloudCheckIcon,
    text: 'Все изменения сохранены',
  },
] as const satisfies readonly {
  status: string;
  when: (f: SaveFlags) => boolean;
  tone: Tone;
  icon: Icon;
  text: string;
}[];

export type SaveStatus = (typeof SAVE_RULES)[number]['status'];
export type SaveState = (typeof SAVE_RULES)[number];

export const saveStateOf = (flags: SaveFlags): SaveState => {
  for (const rule of SAVE_RULES) if (rule.when(flags)) return rule;
  return SAVE_RULES[SAVE_RULES.length - 1];
};
