import { CROP_IDS, CROP_REQUIREMENTS, GROWTH_STAGES, type CropConfiguration, type CropId, type GrowthStage, type WaterManagement } from "../data/agronomy";
import { useI18n } from "../i18n";

export function CropDecisionPanel({ configuration, onChange }: { configuration: CropConfiguration; onChange: (configuration: CropConfiguration) => void }) {
  const { t } = useI18n();
  const update = (next: Partial<CropConfiguration>) => onChange({ ...configuration, ...next });
  return <section className="crop-decision panel" aria-labelledby="crop-context-title">
    <div className="panel-heading"><div><div className="eyebrow">{t("cropContextKicker")}</div><h2 id="crop-context-title">{t("cropContextTitle")}</h2></div><span className="historical-chip">{t("evidencePending")}</span></div>
    <div className="crop-config-controls">
      <label><span>{t("cropLabel")}</span><select aria-label={t("cropLabel")} value={configuration.crop} onChange={(event) => update({ crop: event.target.value as CropId })}>{CROP_IDS.map((crop) => <option key={crop} value={crop}>{t(crop)}</option>)}</select></label>
      <label><span>{t("growthStageLabel")}</span><select aria-label={t("growthStageLabel")} value={configuration.growthStage} onChange={(event) => update({ growthStage: event.target.value as GrowthStage })}>{GROWTH_STAGES.map((stage) => <option key={stage} value={stage}>{t(stage)}</option>)}</select></label>
      <label><span>{t("waterManagementLabel")}</span><select aria-label={t("waterManagementLabel")} value={configuration.waterManagement} onChange={(event) => update({ waterManagement: event.target.value as WaterManagement })}><option value="rainfed">{t("rainfed")}</option><option value="irrigated">{t("irrigated")}</option></select></label>
    </div>
    <p className="crop-context-note">{t("cropContextSeparation")}</p>
  </section>;
}

export function CropComparisonPanel({ configuration, physicalForecastAvailable }: { configuration: CropConfiguration; physicalForecastAvailable: boolean }) {
  const { t } = useI18n();
  return <section className="crop-decision panel crop-comparison-panel" aria-labelledby="crop-comparison-title">
    <div className="crop-comparison-heading"><h2 id="crop-comparison-title">{t("cropComparisonTitle")}</h2><span>{t("noCropRanking")}</span></div>
    <p className="crop-physical-status" role="status">{physicalForecastAvailable ? t("physicalForecastAvailable") : t("physicalForecastUnavailable")}</p>
    <div className="crop-comparison-grid">{CROP_IDS.map((crop) => {
      const evidence = CROP_REQUIREMENTS[crop];
      return <article className={crop === configuration.crop ? "crop-evidence-card is-selected" : "crop-evidence-card"} key={crop} aria-current={crop === configuration.crop ? "true" : undefined}>
        <div className="crop-evidence-top"><b>{t(crop)}</b><span>{t("insufficientEvidence")}</span></div>
        <dl><div><dt>{t("environmentalSignal")}</dt><dd>{physicalForecastAvailable ? t("physicalSignalWhenAvailable") : t("physicalSignalWhenMissing")}</dd></div><div><dt>{t("cropRequirements")}</dt><dd>{t("insufficientEvidence")}</dd></div><div><dt>{t("evidenceSourceLabel")}</dt><dd>{evidence.evidenceSource ?? t("noReviewedSource")}</dd></div></dl>
        <p>{t("cropComparisonLimit")}</p>
      </article>;
    })}</div>
    <p className="crop-context-footnote">{t("irrigationAssumptionNote")}</p>
  </section>;
}
