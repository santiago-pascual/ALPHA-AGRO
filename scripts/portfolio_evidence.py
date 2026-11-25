"""Offline checks and figures from the committed public artifacts, not raw NASA inputs."""
import csv, json, hashlib
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from datetime import date
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'frontend/public/data'; OUT=ROOT/'docs/figures/portfolio'
OUT.mkdir(parents=True,exist_ok=True)
def load(name): return json.loads((DATA/name).read_text())
def main():
 t=load('trend_analysis.json'); p=load('predictive_evaluation_v1.json'); f=load('phase8_forecast_bundle_v1.json')
 rows=t['regional_monthly_series']; dates=[date.fromisoformat(r['month']) for r in rows]; y=np.array([r['soil_water_0_100_mm'] for r in rows]); a=np.array([r['anomaly_mm'] for r in t['regional_monthly_anomalies']]); m=np.array([d.month for d in dates]); x=np.arange(len(y))-119.5
 assert len(y)==240 and [d.year*12+d.month for d in dates]==list(range(2006*12+1,2026*12+1))
 index={r['month']:r['sha256'] for r in csv.DictReader((ROOT/'docs/GLDAS_MONTHLY_SHA256.csv').open())}; assert len(index)==240
 assert all(index[r['filename'].split('.A')[1][:4]+'-'+r['filename'].split('.A')[1][4:6]]==r['sha256'] for r in t['input_files'])
 np.testing.assert_allclose(a,y-np.array([y[m==i].mean() for i in m]),atol=1e-9)
 X=np.column_stack([x,m[:,None]==np.arange(1,13)]); b=np.linalg.lstsq(X,y,rcond=None)[0]; e=y-X@b; z=X*e[:,None]; meat=z.T@z
 for lag in range(1,13):
  c=z[lag:].T@z[:-lag]; meat+=(1-lag/13)*(c+c.T)
 bread=np.linalg.inv(X.T@X); cov=bread@meat@bread*240/227; slope=b[0]*120; se=np.sqrt(cov[0,0])*120; ci=slope+np.array([-1,1])*1.959963984540054*se
 tr=t['regional_trend']; np.testing.assert_allclose(slope,tr['linear_hac_slope_per_decade'],atol=1e-9); np.testing.assert_allclose(ci,tr['linear_hac_ci95_per_decade'],atol=1e-7)
 cells=t['spatial_trends_on_cell_seasonal_anomalies']['cells']; s=np.array([c['linear_hac_slope_per_decade'] for c in cells]); lat=np.array([c['latitude'] for c in cells]); lon=np.array([c['longitude'] for c in cells]); assert len(cells)==867 and len(set(zip(lat,lon)))==867; assert all(r['valid_cells']==867 and r['total_cells']==896 for r in rows); np.testing.assert_allclose(np.average(s,weights=np.cos(np.deg2rad(lat))),slope,atol=1e-9); assert sum(c['significant_after_bh'] for c in cells)==0
 assert len(p['results'])==18 and all(r['selected_model']==min(r['models'],key=lambda v:v['selection_score'])['model']=='seasonal_climatology' for r in p['results']); assert all(v['holdout']['n_months']==24 for r in p['results'] for v in r['models']); assert f['operationally_eligible'] is False
 def save(fig,name): fig.tight_layout(); fig.savefig(OUT/name,dpi=160); plt.close(fig)
 for values,name,title,unit in [(y,'regional_storage.png','Regional modeled soil-water storage','Storage (mm)'),(a,'monthly_anomalies.png','Monthly anomalies relative to 2006–2025 climatology','Anomaly (mm)')]:
  fig,ax=plt.subplots(figsize=(10,3.8)); ax.plot(dates,values,lw=1); ax.set(title=title,ylabel=unit,xlabel='GLDAS Noah v2.1 | 0–100 cm | 867 cells'); ax.grid(alpha=.2)
  if values is a: ax.axhline(0,color='gray',lw=.8)
  save(fig,name)
 fig,ax=plt.subplots(figsize=(8,2.5)); ax.errorbar(slope,0,xerr=[[slope-ci[0]],[ci[1]-slope]],fmt='o',capsize=6); ax.axvline(0,color='gray',ls='--'); ax.set(yticks=[],xlabel='mm per decade',title=f'Seasonal OLS: {slope:.2f} | 95% HAC CI [{ci[0]:.2f}, {ci[1]:.2f}]'); save(fig,'trend_uncertainty.png')
 fig,ax=plt.subplots(figsize=(7,6)); grid=np.full((32,28),np.nan); grid[np.rint((lat+37.875)/.25).astype(int),np.rint((lon+63.875)/.25).astype(int)]=s; lim=max(abs(s)); im=ax.imshow(grid,extent=(-64,-57,-38,-30),origin='lower',cmap='RdBu',vmin=-lim,vmax=lim); ax.set(title='Cell-level trends | 0 of 867 significant after BH',xlabel='Longitude (°E)',ylabel='Latitude (°N)'); fig.colorbar(im,ax=ax,label='mm per decade'); save(fig,'spatial_trends.png')
 r=next(r for r in p['results'] if r['scope']=='regional' and r['target']=='anomaly' and r['horizon_months']==1); fig,ax=plt.subplots(figsize=(9,4)); names=[v['model'] for v in r['models']]; scores=[v['holdout']['metrics']['rmse'] for v in r['models']]; ax.barh(names,scores); ax.invert_yaxis(); ax.set(title='Regional anomaly | 1-month retrospective holdout, 2024–2025',xlabel='RMSE (mm) — descriptive, not operational skill'); save(fig,'predictive_holdout.png')
 print('PASS: 240 monthly records and manifest entries, anomalies, regional OLS/HAC, spatial aggregation, 18 selection records and experimental eligibility. Raw files and predictive fits not rerun.')
 for path in sorted(DATA.glob('*.json')): print(path.name,hashlib.sha256(path.read_bytes()).hexdigest())
if __name__=='__main__': main()
