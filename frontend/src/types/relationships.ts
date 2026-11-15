export type RelationshipRegion = "full" | "north" | "south";
export type EnvironmentalVariable =
  | "rainfall"
  | "evapotranspiration"
  | "air_temperature"
  | "surface_runoff"
  | "subsurface_runoff";

export interface EnvironmentalAssociation {
  variable: EnvironmentalVariable;
  region: RelationshipRegion;
  lag: number;
  n: number;
  r: number;
  ci95: [number, number];
  p_hac: number;
  q_hac: number;
}

export interface EnvironmentalContrast {
  variable: EnvironmentalVariable;
  lag: number;
  n: number;
  north_minus_south_r: number;
  ci95: [number, number];
}

export interface EnvironmentalRelationships {
  schema_version: "environmental_relationships_v1";
  status: "retrospective_associations";
  source_product: string;
  source_version: string;
  source_doi: string;
  response_variable: string;
  observation_period: { start: string; end: string; months: number };
  analysis_units: Record<EnvironmentalVariable, string>;
  minimum_joint_coverage: Record<RelationshipRegion, number>;
  distinct_joint_masks: number;
  input_manifest: { filename: string; sha256: string; rows: number };
  method: string;
  associations: EnvironmentalAssociation[];
  contrasts: EnvironmentalContrast[];
}
