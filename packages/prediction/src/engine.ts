import type { FeatureSnapshot, MatchContext } from '@sports-prediction/domain';
import type { Result } from '@sports-prediction/shared';
import {
  FOOTBALL_MODEL_VERSION,
  predict as predictV1,
  type PredictionOutput,
  type PredictionUnavailableReason,
} from './footballV1.js';
import { FOOTBALL_V2_MODEL_VERSION, predictV2 } from './footballV2.js';
import { FOOTBALL_V3_MODEL_VERSION, predictV3 } from './footballV3.js';

export type PredictFn = (
  matchContext: MatchContext,
  featureSnapshot: FeatureSnapshot,
) => Result<PredictionOutput, PredictionUnavailableReason>;

export interface PredictionEngine {
  readonly modelVersion: string;
  readonly predict: PredictFn;
}

const ENGINES: Readonly<Record<string, PredictionEngine>> = {
  [FOOTBALL_MODEL_VERSION]: {
    modelVersion: FOOTBALL_MODEL_VERSION,
    predict: predictV1,
  },
  [FOOTBALL_V2_MODEL_VERSION]: {
    modelVersion: FOOTBALL_V2_MODEL_VERSION,
    predict: predictV2,
  },
  [FOOTBALL_V3_MODEL_VERSION]: {
    modelVersion: FOOTBALL_V3_MODEL_VERSION,
    predict: predictV3,
  },
};

export const DEFAULT_MODEL_VERSION = FOOTBALL_V3_MODEL_VERSION;

export function listModelVersions(): readonly string[] {
  return Object.keys(ENGINES);
}

export function getPredictionEngine(
  modelVersion: string = DEFAULT_MODEL_VERSION,
): PredictionEngine {
  const engine = ENGINES[modelVersion];
  if (!engine) {
    throw new Error(`Unknown prediction model: ${modelVersion}`);
  }
  return engine;
}

/** Default engine used by API and workers. */
export const predictionEngine: PredictionEngine = getPredictionEngine();
