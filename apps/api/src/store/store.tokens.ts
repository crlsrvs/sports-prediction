export const STORE = Symbol('STORE');
export const STORE_INFO = Symbol('STORE_INFO');

export interface StoreInfo {
  readonly mode: 'postgres' | 'memory';
  readonly reason: string | null;
}
