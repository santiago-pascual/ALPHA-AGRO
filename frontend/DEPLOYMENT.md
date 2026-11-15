# Static deployment preparation

The frontend can be built as a static Vite site and is prepared for GitHub Pages under the repository subpath. The Vite `BASE_URL` is used when loading public JSON artifacts. The application keeps screen navigation in memory, so the landing page is also the single static entry point; it does not require a server-side route fallback.

## Preview locally

```powershell
cd frontend
npm ci
npm run lint
npm test
npm run build
npm run preview
```

## Publish to GitHub Pages

`.github/workflows/deploy-alpha-agro.yml` is manual-only (`workflow_dispatch`). To publish, a repository administrator must enable GitHub Pages with **GitHub Actions** as the source, then run **Deploy Alpha Agro to GitHub Pages** from the Actions tab. The workflow runs checks, builds for the repository subpath, and deploys the generated site. This repository change does not enable Pages or publish a site by itself.

The validated NASA JSON, predictive evaluation JSON, and forecast artifacts are ignored local data. They are not included in a checkout-based static build unless deliberately provided to the build environment. Do not publish real analysis artifacts without authorization to make those data public. Without an artifact, the REAL DATA and Predictive Research views retain their explicit missing-data state; neither substitutes DEMO values.

## Hosting and data notes

- NASA data use and attribution should follow the applicable dataset-specific notice. NASA's Science Data Portal says data provided from NASA-led missions are CC0 unless a restrictive notice or license is marked; check the GLDAS dataset record and cite the source in the app. See [NASA Science Data Licenses](https://science.data.nasa.gov/about/license).
- The interactive map uses the standard OpenStreetMap raster tile service. Keep visible `© OpenStreetMap contributors` attribution, do not bulk-download/prefetch tiles, and treat the service as best-effort without an SLA. See the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- GitHub Pages supports custom GitHub Actions workflows for publishing static sites. See [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- A hosted public site needs internet access for the external map tiles. No paid API key is configured or needed by this frontend.
