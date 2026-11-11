// A tiny stand-in for "svelte/store", used by the tests ONLY when the real Svelte is not
// installed (e.g. an offline checkout). With `npm install`, the real one is used.
type Subscriber<T> = (value: T) => void;
type Unsubscriber = () => void;
type Updater<T> = (value: T) => T;

export interface Readable<T> {
  subscribe(run: Subscriber<T>): Unsubscriber;
}
export interface Writable<T> extends Readable<T> {
  set(value: T): void;
  update(fn: Updater<T>): void;
}

const changed = (a: unknown, b: unknown) =>
  a != a ? b == b : a !== b || (a !== null && typeof a === "object") || typeof a === "function";

export function writable<T>(value: T): Writable<T> {
  const subs = new Set<Subscriber<T>>();
  const set = (next: T) => {
    if (!changed(value, next)) return;
    value = next;
    for (const s of [...subs]) s(value);
  };
  return {
    set,
    update: (fn) => set(fn(value)),
    subscribe(run) {
      subs.add(run);
      run(value);
      return () => subs.delete(run);
    },
  };
}

export function readable<T>(value: T): Readable<T> {
  return { subscribe: writable(value).subscribe };
}

export function get<T>(store: Readable<T>): T {
  let v!: T;
  store.subscribe((x) => (v = x))();
  return v;
}

export function derived<S, T>(source: Readable<S> | Readable<S>[], fn: (v: any) => T): Readable<T> {
  const many = Array.isArray(source);
  const sources: Readable<S>[] = many ? (source as Readable<S>[]) : [source as Readable<S>];
  const out = writable<T>(undefined as T);
  return {
    subscribe(run) {
      const values: S[] = new Array(sources.length);
      let ready = 0;
      const seen = new Set<number>();
      const unsubs = sources.map((s, i) =>
        s.subscribe((v) => {
          values[i] = v;
          if (!seen.has(i)) {
            seen.add(i);
            ready++;
          }
          if (ready === sources.length) out.set(fn(many ? values : values[0]));
        })
      );
      const un = out.subscribe(run);
      return () => {
        un();
        unsubs.forEach((u) => u());
      };
    },
  };
}
