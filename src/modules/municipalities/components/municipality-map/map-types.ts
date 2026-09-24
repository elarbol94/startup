// Prop and label types shared by MunicipalityMap and its extracted pieces.
// Used by municipality-map.tsx and the files in municipality-map/.
import type { MunicipalityDatasetRef } from "../../analysis";
import type { CostMeasureId, CostTargetId } from "../../costs";
import type { DigitalPlatformProviderCategory, DigitalPlatformViewId } from "../../digital-platforms";
import type {
  AgeGroupId,
  AgeViewId,
  DemographicIndicatorId,
  MapMetric,
  SexFilter,
} from "../../demography";
import type { MunicipalityBounds, MunicipalityIndexItem } from "../../data";
import type { MovementPalette, MovementTargetId } from "../../movement";
import type { DataKind } from "../../kennzahlen";
import type { CanonicalPartyId, PoliticsView } from "../../politics";
import type { PopulationViewId } from "../../structure";

export type Labels = {
  map: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
  municipalityCode: string;
  population: string;
  reference: string;
  year: string;
  previousYear: string;
  nextYear: string;
  metric: string;
  dataKind: string;
  dataKinds: Record<DataKind, string>;
  metrics: Partial<Record<MapMetric, string>>;
  digitalView: string;
  digitalViews: Partial<Record<DigitalPlatformViewId, string>>;
  customView: string;
  customViews: Record<string, string>;
  customDelete: string;
  customDeleteConfirm: string;
  digitalProviderLabels: Record<DigitalPlatformProviderCategory, string>;
  digitalDefinition: string;
  digitalNoneFound: string;
  digitalLegendOne: string;
  digitalLegendTwo: string;
  digitalLegendThreeToFour: string;
  digitalLegendFiveToSeven: string;
  digitalLegendEightPlus: string;
  politicsView: string;
  politicsViews: Partial<Record<PoliticsView, string>>;
  politicsParty: string;
  politicsParties: Record<CanonicalPartyId, string>;
  politicsTie: string;
  populationView: string;
  populationViews: Partial<Record<PopulationViewId, string>>;
  ageView: string;
  movementView: string;
  ageGroupsHeading: string;
  indicatorsHeading: string;
  ageGroups: Partial<Record<AgeGroupId, string>>;
  indicators: Partial<Record<DemographicIndicatorId, string>>;
  sexes: Record<SexFilter, string>;
  movements: Partial<Record<MovementTargetId, string>>;
  costView: string;
  costCategories: Partial<Record<CostTargetId, string>>;
  costMeasure: string;
  costMeasures: Partial<Record<CostMeasureId, string>>;
  costDefinition: string;
  minimizeChart: string;
  expandChart: string;
  restoreChart: string;
  addToAnalysis: string;
  dragToAnalysis: string;
  loadingAge: string;
  ageError: string;
  loadingMovement: string;
  movementError: string;
  loadingCosts: string;
  costsError: string;
  loadingPolitics: string;
  politicsError: string;
  loadingDigital: string;
  digitalError: string;
  loadingStructure: string;
  structureError: string;
  noData: string;
  zoomHintWindows: string;
  zoomHintMac: string;
  zoomHintMobile: string;
  display: string;
  legend: string;
  details: string;
  close: string;
  selected: string;
};

export type MunicipalityMapProps = {
  austriaBounds: MunicipalityBounds;
  selected: MunicipalityIndexItem | null;
  metric: MapMetric;
  populationView: PopulationViewId;
  populationDefinition: string | null;
  usePopulationClasses: boolean;
  metricValues: Record<string, number | null>;
  tooltipValues: Record<string, string> | null;
  scaleDomain: [number, number] | null;
  movementPalette: MovementPalette | null;
  year: number;
  firstYear: number;
  latestYear: number;
  ageView: AgeViewId;
  dataKind: DataKind;
  sex: SexFilter;
  movementView: MovementTargetId;
  costCategory: CostTargetId;
  costMeasure: CostMeasureId;
  politicsView: PoliticsView;
  politicsParty: CanonicalPartyId;
  digitalView: DigitalPlatformViewId;
  customView: string;
  peerMunicipalityCodes: string[] | null;
  peerGroupLabel: string | null;
  movementDefinition: string | null;
  showAgeFilters: boolean;
  indicatorDefinition: string | null;
  ageLoading: boolean;
  ageError: boolean;
  movementLoading: boolean;
  movementError: boolean;
  costsLoading: boolean;
  costsError: boolean;
  politicsLoading: boolean;
  politicsError: boolean;
  digitalLoading: boolean;
  digitalError: boolean;
  structureLoading: boolean;
  structureError: boolean;
  onYearChange: (year: number) => void;
  onMetricChange: (metric: MapMetric) => void;
  onPopulationViewChange: (view: PopulationViewId) => void;
  onAgeViewChange: (view: AgeViewId) => void;
  onDataKindChange: (kind: DataKind) => void;
  onSexChange: (sex: SexFilter) => void;
  onMovementViewChange: (view: MovementTargetId) => void;
  onCostCategoryChange: (category: CostTargetId) => void;
  onCostMeasureChange: (measure: CostMeasureId) => void;
  onPoliticsViewChange: (view: PoliticsView) => void;
  onPoliticsPartyChange: (party: CanonicalPartyId) => void;
  onDigitalViewChange: (view: DigitalPlatformViewId) => void;
  onCustomViewChange: (id: string) => void;
  onCustomDelete: (id: string) => void;
  onSelect: (code: string) => void;
  onReset: () => void;
  onOpenDetails: () => void;
  labels: Labels;
  selectedMetricHistory: Array<{ year: number; value: number | null }> | null;
  metricChartLabel: string;
  metricLabel: string;
  chartValueFormatter: Intl.NumberFormat;
  chartUnitLabel: string;
  chartChangeLabels?: { previousYear: string; sinceFirstYear: string };
  analysisDataset: MunicipalityDatasetRef | null;
  showMetricChart: boolean;
};

/** The selection controls shared by the desktop panel and the mobile display sheet. */
export type MapMetricControlsProps = Pick<
  MunicipalityMapProps,
  | "labels"
  | "dataKind"
  | "metric"
  | "populationView"
  | "populationDefinition"
  | "structureLoading"
  | "structureError"
  | "ageView"
  | "showAgeFilters"
  | "sex"
  | "indicatorDefinition"
  | "ageLoading"
  | "ageError"
  | "movementView"
  | "movementDefinition"
  | "movementLoading"
  | "movementError"
  | "politicsView"
  | "politicsParty"
  | "politicsLoading"
  | "politicsError"
  | "customView"
  | "digitalView"
  | "digitalLoading"
  | "digitalError"
  | "costMeasure"
  | "costCategory"
  | "costsLoading"
  | "costsError"
  | "peerGroupLabel"
  | "year"
  | "firstYear"
  | "latestYear"
  | "onDataKindChange"
  | "onMetricChange"
  | "onPopulationViewChange"
  | "onAgeViewChange"
  | "onSexChange"
  | "onMovementViewChange"
  | "onPoliticsViewChange"
  | "onPoliticsPartyChange"
  | "onCustomViewChange"
  | "onCustomDelete"
  | "onDigitalViewChange"
  | "onCostMeasureChange"
  | "onCostCategoryChange"
  | "onYearChange"
>;
