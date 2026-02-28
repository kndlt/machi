const DEG_TO_RAD = Math.PI / 180;

export interface FoliageTuningConfig {
  branchSideRate: number;
  branchSideAngleMin: number;
  branchSideAngleMax: number;
  mainTurnRate: number;
  mainTurnRateBlocked: number;
  mainTurnMax: number;
  rootSideRate: number;
  rootSideAngleMin: number;
  rootSideAngleMax: number;
  rootTurnRate: number;
  rootTurnRateBlocked: number;
  rootTurnMax: number;
  forwardConeCos: number;
  branchInhibitionDecay: number;
  rootInhibitionDecay: number;
  rootCreationCost: number;
  branchCreationCost: number;
  resourceCanopyTransferFraction: number;
  resourceAntiCanopyTransferFraction: number;
  dirtDiffusionFraction: number;
  rootSapThreshold: number;
  rootSapAmount: number;
}

export const DEFAULT_FOLIAGE_TUNING_CONFIG: FoliageTuningConfig = {
  branchSideRate: 0.18,
  branchSideAngleMin: 20.0 * DEG_TO_RAD,
  branchSideAngleMax: 50.0 * DEG_TO_RAD,
  mainTurnRate: 0.08,
  mainTurnRateBlocked: 0.55,
  mainTurnMax: 10.0 * DEG_TO_RAD,
  rootSideRate: 0.36,
  rootSideAngleMin: 20.0 * DEG_TO_RAD,
  rootSideAngleMax: 60.0 * DEG_TO_RAD,
  rootTurnRate: 0.04,
  rootTurnRateBlocked: 0.70,
  rootTurnMax: 7.0 * DEG_TO_RAD,
  forwardConeCos: 0.5,
  branchInhibitionDecay: 3.0,
  rootInhibitionDecay: 32.0,
  rootCreationCost: 1.0,
  branchCreationCost: 1.0,
  resourceCanopyTransferFraction: 0.75,
  resourceAntiCanopyTransferFraction: 0.1,
  dirtDiffusionFraction: 0.25,
  rootSapThreshold: 4.0,
  rootSapAmount: 1.0,
};
