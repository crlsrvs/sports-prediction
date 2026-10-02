import type { DataSourceId } from '@sports-prediction/domain';

export type SourceKind = 'api' | 'web';

export interface RawScrape {
  readonly sourceId: DataSourceId;
  readonly url: string;
  readonly fetchedAt: Date;
  readonly statusCode: number;
  readonly contentType: string | null;
  readonly payload: string;
  readonly checksum: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface SourceAdapter {
  readonly id: DataSourceId;
  readonly kind: SourceKind;
  readonly name: string;
  fetch(input: { readonly url: string }): Promise<RawScrape>;
}
