export interface SaveQueue {
  schedule(): void;
  run<T>(task: () => Promise<T>): Promise<T>;
  pending(): boolean;
  cancel(): void;
}
export const createSaveQueue = (debounceMs: number, save: () => Promise<void>): SaveQueue => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task);
    chain = next.catch(() => {});
    return next;
  };

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    schedule() {
      stop();
      timer = setTimeout(() => {
        timer = null;
        void enqueue(save).catch(() => {});
      }, debounceMs);
    },

    run(task) {
      stop();
      return enqueue(async () => {
        await save();
        return task();
      });
    },

    pending: () => timer !== null,
    cancel: stop,
  };
};
