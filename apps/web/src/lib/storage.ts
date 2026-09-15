import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware';
export const throttledStorage = <S>(ms = 200): PersistStorage<S> => {
  const inner = createJSONStorage<S>(() => localStorage) as PersistStorage<S>;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let owed: [name: string, value: StorageValue<S>] | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const write = owed;
    owed = null;
    if (write) inner.setItem(write[0], write[1]);
  };

  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

  return {
    getItem: (name) => inner.getItem(name),
    setItem: (name, value) => {
      owed = [name, value];
      if (timer === null) timer = setTimeout(flush, ms);
    },
    removeItem: (name) => {
      if (owed?.[0] === name) {
        owed = null;
        if (timer !== null) clearTimeout(timer);
        timer = null;
      }
      return inner.removeItem(name);
    },
  };
};
