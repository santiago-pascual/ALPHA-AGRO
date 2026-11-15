# Real-data predictive evaluation

The experiments use the verified 2006–2025 GLDAS Noah v2.1 monthly panels. The original file checksums, dependency versions, settings, and elapsed times are recorded in the JSON. Regional results cover one area-weighted series. Spatial metrics cover all 867 cells with valid soil-water targets, weighted by native spherical cell area. All cells from a target month stay together. This is a temporal test at known cells.

The full experiment design evaluates six model families for each target and horizon. Initial candidate training spans 120 eligible target months. Walk-forward test windows are up to 12 months. The final 24 target months (January 2024–December 2025) are reserved for evaluation. The fitting cutoff removes labels unavailable by the first issue time of each outer and inner test window. Each feature uses only releases available by its issue. Folds fit anomaly climatologies, low-moisture thresholds and learned model preprocessing from training data only.

Hyperparameters were selected within the outer training window. The family listed as selected in the comparison table minimizes pooled pre-holdout loss over completed walk-forward folds whose last label was available by the first holdout issue. The final holdout ordering is descriptive. For low moisture, the event is defined by a training-derived soil-water percentile and does not establish crop stress. Phase 4's diagonal Gaussian HMM is used to derive forward-filtered state features for XGBoost. It is not a standalone forecast.

The paired intervals resample whole target months in circular 12-month blocks (1,000 draws, seed 1729). Scores and paired differences use the same area weights. Negative differences favor the named model. Intervals are pointwise and the 24-month holdout contains only two nonoverlapping blocks. Spatial sites do not contribute independent time replicates. The comparisons do not establish a universal ranking or operational forecast skill.

Inputs use archived final NASA products. Availability is assumed to be five calendar months after observation month start. Historical release snapshots and independent observational validation are unavailable.

## Walk-forward selection and reserved holdout

| Scope | Horizon | Target | Selected on walk-forward | Selected holdout RMSE / Brier | Lowest holdout score (descriptive) | Lowest score |
| --- | ---: | --- | --- | ---: | --- | ---: |
| Regional | 1 | storage | Climatology | 29.842555 | Ridge | 28.530886 |
| Regional | 1 | anomaly | Climatology | 29.842555 | Ridge | 28.358113 |
| Regional | 1 | low_moisture | Climatology | 0.143100 | Climatology | 0.143100 |
| Regional | 2 | storage | Climatology | 29.796118 | Ridge | 28.521230 |
| Regional | 2 | anomaly | Climatology | 29.796118 | Ridge | 28.528000 |
| Regional | 2 | low_moisture | Climatology | 0.144193 | Climatology | 0.144193 |
| Regional | 3 | storage | Climatology | 29.603807 | Ridge | 27.293600 |
| Regional | 3 | anomaly | Climatology | 29.603807 | Ridge | 27.233985 |
| Regional | 3 | low_moisture | Climatology | 0.145383 | Climatology | 0.145383 |
| Spatial | 1 | storage | Climatology | 45.038844 | Climatology | 45.038844 |
| Spatial | 1 | anomaly | Climatology | 45.038844 | XGBoost + HMM | 43.986109 |
| Spatial | 1 | low_moisture | Climatology | 0.121837 | XGBoost + HMM | 0.116946 |
| Spatial | 2 | storage | Climatology | 44.977192 | Climatology | 44.977192 |
| Spatial | 2 | anomaly | Climatology | 44.977192 | XGBoost + HMM | 44.106382 |
| Spatial | 2 | low_moisture | Climatology | 0.123973 | XGBoost + HMM | 0.117866 |
| Spatial | 3 | storage | Climatology | 44.821450 | Climatology | 44.821450 |
| Spatial | 3 | anomaly | Climatology | 44.821450 | XGBoost | 44.510254 |
| Spatial | 3 | low_moisture | Climatology | 0.125792 | XGBoost + HMM | 0.120593 |

## Regional holdout metrics

RMSE, MAE, bias and regression loss differences are in mm. Skill is relative to persistence (1 minus model loss divided by persistence loss).

| Horizon | Target | Model | RMSE | MAE | Bias | Skill vs persistence | RMSE Δ vs persistence [95%] | RMSE Δ vs AR Ridge [95%] | RMSE Δ vs XGBoost [95%] |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | storage | Climatology | 29.842555 | 25.533730 | -8.855122 | 0.578963 | -41.036152 [-52.189530, -28.137314] | -1.872502 [-7.507154, 4.600974] | -5.103934 [-7.534275, -2.537597] |
| 1 | storage | Persistence | 70.878707 | 60.985849 | -14.539978 | 0.000000 | — | 39.163650 [27.440767, 48.722756] | 35.932219 [23.827508, 45.933449] |
| 1 | storage | AR Ridge | 31.715057 | 27.532459 | -5.538784 | 0.552545 | -39.163650 [-48.722756, -27.440767] | — | -3.231431 [-7.662576, 0.452858] |
| 1 | storage | Ridge | 28.530886 | 23.384709 | 2.285047 | 0.597469 | -42.347822 [-52.560056, -30.052567] | -3.184172 [-5.012419, -1.679086] | -6.415603 [-12.222346, -1.539077] |
| 1 | storage | XGBoost | 34.946489 | 28.632232 | -6.409822 | 0.506954 | -35.932219 [-45.933449, -23.827508] | 3.231431 [-0.452858, 7.662576] | — |
| 1 | storage | XGBoost + HMM | 35.109143 | 28.901988 | -6.751470 | 0.504659 | -35.769565 [-45.895257, -23.500847] | 3.394086 [-0.361469, 7.820876] | 0.162654 [-0.044250, 0.374456] |
| 1 | anomaly | Climatology | 29.842555 | 25.533730 | -8.855122 | 0.418911 | -21.513691 [-28.362121, -13.987695] | -1.374005 [-7.792858, 5.946945] | -3.760740 [-10.584630, 3.647580] |
| 1 | anomaly | Persistence | 51.356246 | 44.493161 | -14.539978 | 0.000000 | — | 20.139686 [14.485853, 25.710495] | 17.752951 [13.683330, 22.239729] |
| 1 | anomaly | AR Ridge | 31.216560 | 26.852820 | -5.480864 | 0.392157 | -20.139686 [-25.710495, -14.485853] | — | -2.386735 [-5.317795, 0.597353] |
| 1 | anomaly | Ridge | 28.358113 | 23.365882 | 2.195406 | 0.447816 | -22.998133 [-28.612449, -17.483189] | -2.858447 [-3.994113, -1.960073] | -5.245182 [-7.729980, -2.784373] |
| 1 | anomaly | XGBoost | 33.603295 | 29.224053 | 4.607349 | 0.345682 | -17.752951 [-22.239729, -13.683330] | 2.386735 [-0.597353, 5.317795] | — |
| 1 | anomaly | XGBoost + HMM | 30.299920 | 25.811053 | -4.060446 | 0.410005 | -21.056326 [-25.136288, -16.578636] | -0.916640 [-3.702568, 2.971031] | -3.303375 [-6.465263, 0.493038] |
| 2 | storage | Climatology | 29.796118 | 25.366631 | -8.551884 | 0.593999 | -43.593185 [-55.476157, -29.273948] | -1.573568 [-5.700478, 2.944176] | -4.870568 [-8.262978, -1.075896] |
| 2 | storage | Persistence | 73.389303 | 59.363557 | -16.690846 | 0.000000 | — | 42.019617 [29.126847, 52.730450] | 38.722617 [27.105832, 48.440901] |
| 2 | storage | AR Ridge | 31.369686 | 26.616776 | -4.616846 | 0.572558 | -42.019617 [-52.730450, -29.126847] | — | -3.297000 [-5.130770, -1.580242] |
| 2 | storage | Ridge | 28.521230 | 24.246921 | 2.580313 | 0.611371 | -44.868073 [-55.784268, -31.014444] | -2.848456 [-4.144426, -1.499188] | -6.145457 [-8.460318, -3.638321] |
| 2 | storage | XGBoost | 34.666686 | 28.141947 | -3.853500 | 0.527633 | -38.722617 [-48.440901, -27.105832] | 3.297000 [1.580242, 5.130770] | — |
| 2 | storage | XGBoost + HMM | 35.245348 | 28.637642 | -4.828009 | 0.519748 | -38.143955 [-48.832428, -25.514193] | 3.875662 [2.204134, 5.717447] | 0.578662 [-0.414411, 1.627628] |
| 2 | anomaly | Climatology | 29.796118 | 25.366631 | -8.551884 | 0.460803 | -25.464091 [-30.157771, -20.689249] | -1.266962 [-5.937850, 4.235729] | -5.523467 [-10.240659, -0.844473] |
| 2 | anomaly | Persistence | 55.260209 | 48.641946 | -16.690846 | 0.000000 | — | 24.197129 [17.524753, 31.040629] | 19.940624 [14.116449, 25.776642] |
| 2 | anomaly | AR Ridge | 31.063080 | 26.498621 | -4.526574 | 0.437876 | -24.197129 [-31.040629, -17.524753] | — | -4.256505 [-7.381928, -1.432942] |
| 2 | anomaly | Ridge | 28.528000 | 24.413379 | 2.439260 | 0.483752 | -26.732209 [-32.416803, -21.235101] | -2.535080 [-4.219109, -0.584011] | -6.791585 [-9.415037, -4.361422] |
| 2 | anomaly | XGBoost | 35.319585 | 30.240140 | 4.671896 | 0.360850 | -19.940624 [-25.776642, -14.116449] | 4.256505 [1.432942, 7.381928] | — |
| 2 | anomaly | XGBoost + HMM | 34.920591 | 30.600313 | 4.743451 | 0.368070 | -20.339618 [-26.775434, -14.170527] | 3.857511 [0.332935, 7.453054] | -0.398994 [-1.225201, 0.364543] |
| 3 | storage | Climatology | 29.603807 | 25.180726 | -8.184110 | 0.595623 | -43.604661 [-55.409840, -27.824409] | -0.657934 [-4.418143, 3.509946] | -2.939198 [-6.423232, 1.039465] |
| 3 | storage | Persistence | 73.208468 | 58.356555 | -19.673027 | 0.000000 | — | 42.946727 [28.366336, 54.280148] | 40.665463 [27.096774, 51.152851] |
| 3 | storage | AR Ridge | 30.261741 | 25.621931 | -4.049366 | 0.586636 | -42.946727 [-54.280148, -28.366336] | — | -2.281264 [-3.575395, -0.912684] |
| 3 | storage | Ridge | 27.293600 | 23.558464 | 2.359575 | 0.627180 | -45.914868 [-56.932328, -31.546755] | -2.968141 [-5.356788, -0.373153] | -5.249405 [-7.414454, -2.742626] |
| 3 | storage | XGBoost | 32.543005 | 27.095612 | -3.471976 | 0.555475 | -40.665463 [-51.152851, -27.096774] | 2.281264 [0.912684, 3.575395] | — |
| 3 | storage | XGBoost + HMM | 32.607889 | 27.497487 | -3.830470 | 0.554589 | -40.600579 [-51.509978, -26.310038] | 2.346148 [1.309611, 3.355463] | 0.064884 [-0.599516, 0.875689] |
| 3 | anomaly | Climatology | 29.603807 | 25.180726 | -8.184110 | 0.491622 | -28.628028 [-33.138052, -23.858089] | -0.216065 [-4.481153, 4.645018] | 1.308099 [-2.010935, 4.717277] |
| 3 | anomaly | Persistence | 58.231835 | 52.064363 | -19.673027 | 0.000000 | — | 28.411963 [19.910418, 37.502919] | 29.936127 [22.368233, 37.572589] |
| 3 | anomaly | AR Ridge | 29.819872 | 25.585771 | -4.117815 | 0.487911 | -28.411963 [-37.502919, -19.910418] | — | 1.524164 [-0.118600, 2.983778] |
| 3 | anomaly | Ridge | 27.233985 | 23.503759 | 2.270113 | 0.532318 | -30.997850 [-37.977042, -23.780610] | -2.585887 [-5.443917, 0.493515] | -1.061723 [-3.760311, 1.588264] |
| 3 | anomaly | XGBoost | 28.295708 | 23.926012 | -0.128139 | 0.514085 | -29.936127 [-37.572589, -22.368233] | -1.524164 [-2.983778, 0.118600] | — |
| 3 | anomaly | XGBoost + HMM | 27.753737 | 23.224589 | 0.971129 | 0.523392 | -30.478098 [-38.744372, -22.534116] | -2.066135 [-3.434163, -0.532781] | -0.541971 [-1.078906, -0.060483] |

Low-moisture results use Brier score, log loss and ten-bin expected calibration error (ECE). ECE and calibration bias are descriptive. Full reliability bins and calibration fit diagnostics are in the JSON.

| Horizon | Model | Brier | Log loss | ECE | Absolute calibration bias | Brier skill vs climatology | Brier skill vs persistence | Brier Δ vs persistence [95%] | Brier Δ vs AR Ridge [95%] | Brier Δ vs XGBoost [95%] |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | Climatology | 0.143100 | 0.463294 | 0.067538 | 0.067538 | 0.000000 | 0.713799 | -0.356899 [-0.445134, -0.268663] | -0.158363 [-0.240918, -0.075807] | -0.041348 [-0.064406, -0.018938] |
| 1 | Persistence | 0.499999 | 6.907756 | 0.499999 | 0.166667 | -2.494047 | 0.000000 | — | 0.198536 [0.156580, 0.243713] | 0.315551 [0.242016, 0.389858] |
| 1 | AR Ridge | 0.301463 | 0.813284 | 0.355955 | 0.295357 | -1.106654 | 0.397073 | -0.198536 [-0.243713, -0.156580] | — | 0.117015 [0.045958, 0.189961] |
| 1 | Ridge | 0.203826 | 0.638793 | 0.224189 | 0.147966 | -0.424355 | 0.592348 | -0.296173 [-0.358781, -0.236657] | -0.097637 [-0.139722, -0.055456] | 0.019377 [-0.035214, 0.072046] |
| 1 | XGBoost | 0.184448 | 0.569568 | 0.189758 | 0.103754 | -0.288943 | 0.631103 | -0.315551 [-0.389858, -0.242016] | -0.117015 [-0.189961, -0.045958] | — |
| 1 | XGBoost + HMM | 0.172306 | 0.541901 | 0.157793 | 0.082187 | -0.204091 | 0.655388 | -0.327693 [-0.405644, -0.249743] | -0.129157 [-0.206239, -0.052085] | -0.012142 [-0.020759, -0.003548] |
| 2 | Climatology | 0.144193 | 0.466325 | 0.069853 | 0.069853 | 0.000000 | 0.711613 | -0.355806 [-0.444041, -0.267570] | -0.153383 [-0.239695, -0.067115] | -0.033374 [-0.048592, -0.018025] |
| 2 | Persistence | 0.499999 | 6.907756 | 0.499999 | 0.166667 | -2.467560 | 0.000000 | — | 0.202422 [0.139108, 0.265737] | 0.322431 [0.236622, 0.408118] |
| 2 | AR Ridge | 0.297577 | 0.795488 | 0.461175 | 0.310833 | -1.063733 | 0.404846 | -0.202422 [-0.265737, -0.139108] | — | 0.120009 [0.031201, 0.208824] |
| 2 | Ridge | 0.212745 | 0.607182 | 0.264823 | 0.154895 | -0.475414 | 0.574509 | -0.287254 [-0.364838, -0.206543] | -0.084832 [-0.130597, -0.039067] | 0.035177 [-0.048010, 0.116431] |
| 2 | XGBoost | 0.177568 | 0.561287 | 0.230159 | 0.090378 | -0.231455 | 0.644864 | -0.322431 [-0.408118, -0.236622] | -0.120009 [-0.208824, -0.031201] | — |
| 2 | XGBoost + HMM | 0.162370 | 0.521720 | 0.129156 | 0.062244 | -0.126061 | 0.675258 | -0.337629 [-0.431348, -0.243915] | -0.135206 [-0.227507, -0.042933] | -0.015197 [-0.023186, -0.007284] |
| 3 | Climatology | 0.145383 | 0.469561 | 0.072304 | 0.072304 | 0.000000 | 0.731600 | -0.396283 [-0.526185, -0.266381] | -0.147911 [-0.256976, -0.038595] | -0.034015 [-0.047336, -0.021342] |
| 3 | Persistence | 0.541666 | 7.483402 | 0.541666 | 0.208334 | -2.725789 | 0.000000 | — | 0.248372 [0.140275, 0.347945] | 0.362268 [0.230447, 0.493996] |
| 3 | AR Ridge | 0.293294 | 0.781805 | 0.387344 | 0.313035 | -1.017390 | 0.458533 | -0.248372 [-0.347945, -0.140275] | — | 0.113896 [-0.001408, 0.229200] |
| 3 | Ridge | 0.215867 | 0.630163 | 0.296784 | 0.177326 | -0.484820 | 0.601475 | -0.325798 [-0.435462, -0.223953] | -0.077426 [-0.131326, -0.023527] | 0.036469 [-0.055225, 0.125112] |
| 3 | XGBoost | 0.179398 | 0.563109 | 0.243073 | 0.086309 | -0.233969 | 0.668803 | -0.362268 [-0.493996, -0.230447] | -0.113896 [-0.229200, 0.001408] | — |
| 3 | XGBoost + HMM | 0.163250 | 0.525640 | 0.248976 | 0.048239 | -0.122899 | 0.698614 | -0.378415 [-0.523403, -0.233298] | -0.130044 [-0.255914, -0.004174] | -0.016148 [-0.028872, -0.003424] |

## Spatial holdout metrics

RMSE, MAE, bias and regression loss differences are in mm. Skill is relative to persistence (1 minus model loss divided by persistence loss).

| Horizon | Target | Model | RMSE | MAE | Bias | Skill vs persistence | RMSE Δ vs persistence [95%] | RMSE Δ vs AR Ridge [95%] | RMSE Δ vs XGBoost [95%] |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | storage | Climatology | 45.038844 | 36.312106 | -8.855122 | 0.481138 | -41.764220 [-50.774663, -32.492721] | -12.514448 [-19.745717, -5.446275] | -10.898134 [-17.357510, -4.039498] |
| 1 | storage | Persistence | 86.803064 | 71.660741 | -14.539978 | 0.000000 | — | 29.249772 [13.575530, 44.023720] | 30.866087 [15.725700, 45.501975] |
| 1 | storage | AR Ridge | 57.553292 | 47.364470 | -17.381620 | 0.336967 | -29.249772 [-44.023720, -13.575530] | — | 1.616315 [0.264734, 3.109312] |
| 1 | storage | Ridge | 56.315856 | 45.514335 | -15.802937 | 0.351223 | -30.487208 [-44.492352, -15.341870] | -1.237436 [-2.626328, 0.126800] | 0.378879 [-0.416139, 1.221192] |
| 1 | storage | XGBoost | 55.936977 | 45.917439 | -17.352579 | 0.355588 | -30.866087 [-45.501975, -15.725700] | -1.616315 [-3.109312, -0.264734] | — |
| 1 | storage | XGBoost + HMM | 55.756042 | 45.488553 | -17.574133 | 0.357672 | -31.047022 [-46.766460, -14.969883] | -1.797250 [-3.109175, -0.694142] | -0.180935 [-1.359476, 0.829821] |
| 1 | anomaly | Climatology | 45.038844 | 36.312106 | -8.855122 | 0.310318 | -20.264948 [-30.996860, -11.415338] | -0.191724 [-3.881320, 3.421160] | 0.939890 [-2.509300, 4.105193] |
| 1 | anomaly | Persistence | 65.303792 | 52.991618 | -14.539978 | 0.000000 | — | 20.073225 [12.750935, 28.434819] | 21.204838 [14.728343, 28.601411] |
| 1 | anomaly | AR Ridge | 45.230567 | 36.612425 | -6.864260 | 0.307382 | -20.073225 [-28.434819, -12.750935] | — | 1.131613 [-0.116432, 2.174745] |
| 1 | anomaly | Ridge | 45.098697 | 36.438935 | -5.959901 | 0.309402 | -20.205095 [-28.304204, -13.148806] | -0.131870 [-0.934562, 0.707006] | 0.999743 [-0.450846, 2.241077] |
| 1 | anomaly | XGBoost | 44.098954 | 35.845248 | -6.250669 | 0.324711 | -21.204838 [-28.601411, -14.728343] | -1.131613 [-2.174745, 0.116432] | — |
| 1 | anomaly | XGBoost + HMM | 43.986109 | 35.667962 | -5.978874 | 0.326439 | -21.317683 [-28.791967, -14.726048] | -1.244459 [-3.020746, 0.709966] | -0.112845 [-1.016009, 0.828143] |
| 2 | storage | Climatology | 44.977192 | 36.239649 | -8.551884 | 0.494527 | -44.003245 [-52.606417, -33.841636] | -13.593402 [-21.657006, -4.921086] | -12.235784 [-20.235126, -3.149739] |
| 2 | storage | Persistence | 88.980436 | 72.864436 | -16.690846 | 0.000000 | — | 30.409842 [13.164265, 46.118006] | 31.767460 [14.946896, 47.491453] |
| 2 | storage | AR Ridge | 58.570594 | 47.801895 | -18.576810 | 0.341759 | -30.409842 [-46.118006, -13.164265] | — | 1.357618 [-0.285086, 3.360197] |
| 2 | storage | Ridge | 56.471507 | 45.714612 | -16.075824 | 0.365349 | -32.508929 [-47.395668, -15.685416] | -2.099086 [-4.268809, 0.003276] | -0.741468 [-2.222720, 1.121620] |
| 2 | storage | XGBoost | 57.212976 | 46.069576 | -19.246800 | 0.357016 | -31.767460 [-47.491453, -14.946896] | -1.357618 [-3.360197, 0.285086] | — |
| 2 | storage | XGBoost + HMM | 56.761010 | 45.480469 | -19.299701 | 0.362096 | -32.219426 [-49.679809, -13.665480] | -1.809584 [-3.571741, -0.239885] | -0.451966 [-2.887289, 2.117796] |
| 2 | anomaly | Climatology | 44.977192 | 36.239649 | -8.551884 | 0.348568 | -24.066372 [-32.548124, -16.873030] | -0.115807 [-2.546322, 2.401504] | 0.482434 [-1.383438, 1.905181] |
| 2 | anomaly | Persistence | 69.043564 | 56.588137 | -16.690846 | 0.000000 | — | 23.950565 [18.005457, 31.405759] | 24.548806 [18.831685, 31.156329] |
| 2 | anomaly | AR Ridge | 45.092998 | 36.788690 | -6.664971 | 0.346891 | -23.950565 [-31.405759, -18.005457] | — | 0.598241 [-1.050949, 2.129915] |
| 2 | anomaly | Ridge | 44.960697 | 36.549711 | -5.691691 | 0.348807 | -24.082867 [-31.209271, -17.972189] | -0.132302 [-0.694811, 0.518756] | 0.465939 [-1.313343, 2.051895] |
| 2 | anomaly | XGBoost | 44.494758 | 36.124628 | -7.410096 | 0.355555 | -24.548806 [-31.156329, -18.831685] | -0.598241 [-2.129915, 1.050949] | — |
| 2 | anomaly | XGBoost + HMM | 44.106382 | 35.971616 | -5.719441 | 0.361180 | -24.937182 [-31.125743, -19.614219] | -0.986616 [-2.707227, 1.029365] | -0.388376 [-1.134468, 0.507626] |
| 3 | storage | Climatology | 44.821450 | 36.093120 | -8.184110 | 0.490391 | -43.131107 [-52.163376, -32.633982] | -14.410249 [-23.257682, -4.358455] | -11.589668 [-20.304999, -1.321140] |
| 3 | storage | Persistence | 87.952556 | 71.076268 | -19.673027 | 0.000000 | — | 28.720858 [10.399839, 45.107929] | 31.541439 [14.752294, 46.961097] |
| 3 | storage | AR Ridge | 59.231698 | 47.874801 | -20.044171 | 0.326549 | -28.720858 [-45.107929, -10.399839] | — | 2.820581 [1.533663, 4.381390] |
| 3 | storage | Ridge | 54.986854 | 44.257502 | -15.481414 | 0.374812 | -32.965702 [-47.430545, -17.187294] | -4.244844 [-6.815897, -1.316251] | -1.424264 [-3.697056, 1.595401] |
| 3 | storage | XGBoost | 56.411118 | 44.873532 | -20.251101 | 0.358619 | -31.541439 [-46.961097, -14.752294] | -2.820581 [-4.381390, -1.533663] | — |
| 3 | storage | XGBoost + HMM | 57.308753 | 45.687815 | -20.788992 | 0.348413 | -30.643803 [-47.470546, -12.324965] | -1.922945 [-2.733584, -1.117203] | 0.897635 [-0.836904, 2.836420] |
| 3 | anomaly | Climatology | 44.821450 | 36.093120 | -8.184110 | 0.372528 | -26.610291 [-33.369440, -20.867170] | -0.008470 [-1.684612, 1.747705] | 0.311196 [-0.839804, 1.191713] |
| 3 | anomaly | Persistence | 71.431741 | 59.143552 | -19.673027 | 0.000000 | — | 26.601822 [20.839550, 32.860049] | 26.921487 [21.714712, 32.559944] |
| 3 | anomaly | AR Ridge | 44.829919 | 36.565499 | -6.678549 | 0.372409 | -26.601822 [-32.860049, -20.839550] | — | 0.319665 [-0.909666, 1.454347] |
| 3 | anomaly | Ridge | 44.635962 | 36.172237 | -5.439253 | 0.375124 | -26.795779 [-33.583218, -20.644629] | -0.193957 [-0.800086, 0.326997] | 0.125708 [-1.443460, 1.528530] |
| 3 | anomaly | XGBoost | 44.510254 | 36.088176 | -7.540592 | 0.376884 | -26.921487 [-32.559944, -21.714712] | -0.319665 [-1.454347, 0.909666] | — |
| 3 | anomaly | XGBoost + HMM | 44.676807 | 36.153142 | -7.260702 | 0.374552 | -26.754934 [-31.903516, -21.841998] | -0.153112 [-1.668357, 1.593786] | 0.166553 [-0.511363, 1.041586] |

Low-moisture results use Brier score, log loss and ten-bin expected calibration error (ECE). ECE and calibration bias are descriptive. Full reliability bins and calibration fit diagnostics are in the JSON.

| Horizon | Model | Brier | Log loss | ECE | Absolute calibration bias | Brier skill vs climatology | Brier skill vs persistence | Brier Δ vs persistence [95%] | Brier Δ vs AR Ridge [95%] | Brier Δ vs XGBoost [95%] |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | Climatology | 0.121837 | 0.415970 | 0.107753 | 0.107753 | 0.000000 | 0.648774 | -0.225053 [-0.285995, -0.164108] | -0.122290 [-0.176366, -0.068277] | -0.005042 [-0.010810, 0.000289] |
| 1 | Persistence | 0.346890 | 4.792474 | 0.346890 | 0.106678 | -1.847172 | 0.000000 | — | 0.102764 [0.059158, 0.146369] | 0.220011 [0.158789, 0.281209] |
| 1 | AR Ridge | 0.244127 | 0.680436 | 0.352043 | 0.352043 | -1.003720 | 0.296242 | -0.102764 [-0.146369, -0.059158] | — | 0.117248 [0.063290, 0.171588] |
| 1 | Ridge | 0.236520 | 0.664188 | 0.334598 | 0.334598 | -0.941287 | 0.318170 | -0.110370 [-0.151254, -0.067824] | -0.007607 [-0.018106, 0.002541] | 0.109641 [0.060376, 0.159523] |
| 1 | XGBoost | 0.126879 | 0.424103 | 0.100448 | 0.100448 | -0.041386 | 0.634239 | -0.220011 [-0.281209, -0.158789] | -0.117248 [-0.171588, -0.063290] | — |
| 1 | XGBoost + HMM | 0.116946 | 0.400576 | 0.078220 | 0.078220 | 0.040138 | 0.662872 | -0.229944 [-0.296696, -0.163189] | -0.127180 [-0.187151, -0.067209] | -0.009933 [-0.015761, -0.004115] |
| 2 | Climatology | 0.123973 | 0.421260 | 0.107868 | 0.107868 | 0.000000 | 0.668813 | -0.250356 [-0.330134, -0.172024] | -0.123706 [-0.179578, -0.067833] | -0.001493 [-0.004217, 0.001253] |
| 2 | Persistence | 0.374329 | 5.171556 | 0.374329 | 0.125650 | -2.019443 | 0.000000 | — | 0.126651 [0.085570, 0.168624] | 0.248863 [0.170620, 0.329112] |
| 2 | AR Ridge | 0.247678 | 0.687893 | 0.355905 | 0.355905 | -0.997843 | 0.338340 | -0.126651 [-0.168624, -0.085570] | — | 0.122212 [0.066222, 0.178202] |
| 2 | Ridge | 0.237942 | 0.667771 | 0.341770 | 0.341668 | -0.919304 | 0.364352 | -0.136387 [-0.181833, -0.091611] | -0.009737 [-0.015919, -0.003435] | 0.112475 [0.061584, 0.163367] |
| 2 | XGBoost | 0.125466 | 0.424284 | 0.106529 | 0.106529 | -0.012045 | 0.664824 | -0.248863 [-0.329112, -0.170620] | -0.122212 [-0.178202, -0.066222] | — |
| 2 | XGBoost + HMM | 0.117866 | 0.403258 | 0.065636 | 0.065636 | 0.049260 | 0.685127 | -0.256463 [-0.345104, -0.170576] | -0.129812 [-0.193604, -0.066021] | -0.007600 [-0.015728, 0.000376] |
| 3 | Climatology | 0.125792 | 0.425852 | 0.108951 | 0.108951 | 0.000000 | 0.690522 | -0.280673 [-0.394232, -0.176372] | -0.124532 [-0.181536, -0.067528] | -0.000943 [-0.003083, 0.001040] |
| 3 | Persistence | 0.406465 | 5.615539 | 0.406465 | 0.158071 | -2.231246 | 0.000000 | — | 0.156141 [0.089638, 0.220001] | 0.279730 [0.176288, 0.392354] |
| 3 | AR Ridge | 0.250325 | 0.693172 | 0.358633 | 0.358633 | -0.989986 | 0.384143 | -0.156141 [-0.220001, -0.089638] | — | 0.123590 [0.067561, 0.179685] |
| 3 | Ridge | 0.247389 | 0.687503 | 0.349965 | 0.349965 | -0.966649 | 0.391365 | -0.159076 [-0.228083, -0.086845] | -0.002936 [-0.012315, 0.006122] | 0.120654 [0.065692, 0.175616] |
| 3 | XGBoost | 0.126735 | 0.427737 | 0.110551 | 0.110551 | -0.007495 | 0.688202 | -0.279730 [-0.392354, -0.176288] | -0.123590 [-0.179685, -0.067561] | — |
| 3 | XGBoost + HMM | 0.120593 | 0.411339 | 0.075509 | 0.075509 | 0.041329 | 0.703312 | -0.285872 [-0.406898, -0.174266] | -0.129731 [-0.193386, -0.066088] | -0.006142 [-0.014182, 0.001914] |

## Evidence for model improvements

- Regional, Ridge vs Climatology had 6/9 lower numerical losses, 0/9 intervals wholly below zero, and 1/9 intervals wholly above zero.
- Regional, Ridge vs AR Ridge had 9/9 lower numerical losses, 8/9 intervals wholly below zero, and 0/9 intervals wholly above zero.
- Regional, XGBoost vs Persistence had 9/9 lower numerical losses, 9/9 intervals wholly below zero, and 0/9 intervals wholly above zero.
- Regional, XGBoost vs AR Ridge had 4/9 lower numerical losses, 2/9 intervals wholly below zero, and 3/9 intervals wholly above zero.
- Regional, XGBoost vs Climatology had 1/9 lower numerical losses, 0/9 intervals wholly below zero, and 6/9 intervals wholly above zero.
- Regional, XGBoost + HMM vs XGBoost had 6/9 lower numerical losses, 4/9 intervals wholly below zero, and 0/9 intervals wholly above zero.
- Spatial, Ridge vs Climatology had 2/9 lower numerical losses, 0/9 intervals wholly below zero, and 6/9 intervals wholly above zero.
- Spatial, Ridge vs AR Ridge had 9/9 lower numerical losses, 2/9 intervals wholly below zero, and 0/9 intervals wholly above zero.
- Spatial, XGBoost vs Persistence had 9/9 lower numerical losses, 9/9 intervals wholly below zero, and 0/9 intervals wholly above zero.
- Spatial, XGBoost vs AR Ridge had 9/9 lower numerical losses, 5/9 intervals wholly below zero, and 0/9 intervals wholly above zero.
- Spatial, XGBoost vs Climatology had 3/9 lower numerical losses, 0/9 intervals wholly below zero, and 3/9 intervals wholly above zero.
- Spatial, XGBoost + HMM vs XGBoost had 7/9 lower numerical losses, 1/9 intervals wholly below zero, and 0/9 intervals wholly above zero.

These counts summarize separate, correlated comparisons. They are not a pooled significance test and are not adjusted for multiple comparisons.

## Reproduction and frontend

- Regional elapsed time was 132.8 seconds. Output: `data/analysis/phase5a/regional.json`. SHA-256 `70bf2e3a6695abade0921ff38d797da0921438205e353e4e04509188ac126d74`.
- Spatial elapsed time was 2536.3 seconds. Output: `data/analysis/phase5a/spatial.json`. SHA-256 `1ddec2807c8d545bea37cfea71e23e4b99b258ab24094edcac33b4d79d844ee6`.

The full-grid spatial pilot ran one horizon and target (1-month storage), with 209 candidate initial training months and the same final 24-month window. It scored all six model families in two folds and took 120.4 seconds. The pilot is a runtime check. Its scores do not enter model selection.

Evaluator code commit: `0b82ddc` on `feature/phase5b-real-evaluation`.

Run in PowerShell from the repository root with the validated Phase 5A local panels and the existing environment.

```powershell
$env:OMP_NUM_THREADS='1'; $env:OPENBLAS_NUM_THREADS='1'; $env:MKL_NUM_THREADS='1'
.\.venv\Scripts\python.exe -m gldas.predictive evaluate --input data/exports/phase5a/regional_panel.parquet --output data/analysis/phase5a/regional.json --initial-train-months 120 --test-window-months 12 --holdout-months 24 --horizons 1 2 3 --targets storage anomaly low_moisture
.\.venv\Scripts\python.exe -m gldas.predictive evaluate --input data/exports/phase5a/monthly_panel.parquet --output data/analysis/phase5a/spatial.json --initial-train-months 120 --test-window-months 12 --holdout-months 24 --horizons 1 2 3 --targets storage anomaly low_moisture
```

For a frontend research panel, export a versioned summary with the target, horizon, model, fold, metrics, paired intervals, availability assumption and scientific limitations. Render calibration bins as descriptive historical evidence. A forecast display would require separately validated current inputs, release timing, and a production inference and calibration pipeline.
