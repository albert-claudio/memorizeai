export const STUDY_DASHBOARD_RESPONSIVE_CSS = `
  .study-dashboard-shell {
    position: relative;
    min-height: 100vh;
    overflow-x: hidden;
    background:
      radial-gradient(circle at 18% 4%, rgba(124, 58, 237, 0.18), transparent 32%),
      radial-gradient(circle at 92% 8%, rgba(16, 185, 129, 0.09), transparent 28%),
      linear-gradient(180deg, #0b0d16 0%, #0f1117 48%, #090b12 100%);
  }

  .study-dashboard-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
    background-size: 72px 72px;
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.65), transparent 72%);
  }

  .study-dashboard-banner-wrap {
    position: relative;
    z-index: 1;
    width: min(100%, 1440px);
    margin: 0 auto;
    padding: 18px 18px 0;
  }

  .study-dashboard-main {
    position: relative;
    z-index: 1;
    width: min(100%, 1440px);
    margin: 0 auto;
    padding: 32px 18px 56px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .study-dashboard-main *,
  .study-dashboard-main *::before,
  .study-dashboard-main *::after {
    box-sizing: border-box;
  }

  .study-home-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 0 4px 6px;
  }

  .study-home-header h1 {
    margin: 4px 0 6px;
    color: #ffffff;
    font-size: 32px;
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: 0;
  }

  .study-home-header p {
    margin: 0;
    color: #a8b0c2;
    font-size: 15px;
    line-height: 1.5;
  }

  .study-kicker {
    margin: 0;
    color: #a78bfa;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .study-header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .study-streak-pill {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    color: #d8ccff;
    background: rgba(15, 17, 27, 0.76);
    border: 1px solid rgba(167, 139, 250, 0.18);
    border-radius: 12px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }

  .study-streak-pill strong {
    color: #ffffff;
    font-size: 18px;
    line-height: 1;
  }

  .study-streak-pill span:last-child {
    color: #a8b0c2;
    font-size: 13px;
    white-space: nowrap;
  }

  .study-pill-icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #fb923c;
    background: rgba(251, 146, 60, 0.12);
  }

  .study-avatar-button {
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    color: #ffffff;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    font-size: 17px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 14px 36px rgba(124, 58, 237, 0.32);
  }

  .study-dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.03fr) minmax(0, 1fr);
    gap: 18px;
    align-items: stretch;
  }

  .study-glass-card {
    position: relative;
    min-width: 0;
    overflow: hidden;
    padding: 24px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.15);
    background:
      linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)),
      rgba(14, 17, 29, 0.76);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.05),
      0 22px 70px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .study-glass-card::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(255,255,255,0.08), transparent 36%);
    opacity: 0.32;
  }

  .study-card-heading {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 22px;
  }

  .study-card-heading h2 {
    margin: 4px 0 0;
    color: #ffffff;
    font-size: 22px;
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: 0;
  }

  .study-card-subtitle {
    max-width: 410px;
    margin: 7px 0 0;
    color: #a8b0c2;
    font-size: 14px;
    line-height: 1.5;
  }

  .study-soft-badge,
  .study-mini-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid rgba(167, 139, 250, 0.18);
    background: rgba(124, 58, 237, 0.12);
    color: #c4b5fd;
    font-size: 12px;
    font-weight: 800;
  }

  .study-soft-badge {
    padding: 6px 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .study-progress-content {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 28px;
    align-items: center;
  }

  .study-big-ring {
    width: 238px;
    aspect-ratio: 1;
    margin: 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background:
      radial-gradient(circle at center, #101320 0 56%, transparent 57%),
      conic-gradient(#8b5cf6 var(--progress), rgba(148, 163, 184, 0.15) 0);
    box-shadow:
      0 0 40px rgba(124, 58, 237, 0.28),
      inset 0 0 0 14px rgba(255,255,255,0.02);
  }

  .study-big-ring div {
    width: 166px;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(15,17,27,0.96), rgba(12,14,23,0.9));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .study-big-ring strong {
    color: #ffffff;
    font-size: 48px;
    line-height: 1;
    font-weight: 800;
  }

  .study-big-ring span {
    margin-top: 8px;
    color: #cbd5e1;
    font-size: 15px;
  }

  .study-progress-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 8px;
    overflow: hidden;
  }

  .study-progress-stats div {
    min-height: 96px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 1px solid rgba(148, 163, 184, 0.1);
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    background: rgba(255, 255, 255, 0.018);
  }

  .study-progress-stats div:nth-child(2) {
    border-right: none;
  }

  .study-progress-stats .study-wide-stat {
    grid-column: 1 / -1;
    border-right: none;
    border-bottom: none;
  }

  .study-progress-stats span,
  .study-review-stats span,
  .study-bottom-metrics p {
    color: #9aa4b8;
    font-size: 13px;
  }

  .study-progress-stats strong,
  .study-review-stats strong {
    margin-top: 6px;
    color: #ffffff;
    font-size: 28px;
    line-height: 1;
    font-weight: 800;
  }

  .study-success-text {
    color: #34d399 !important;
  }

  .study-review-card {
    min-height: 304px;
  }

  .study-review-visual {
    position: absolute;
    top: 24px;
    right: 36px;
    width: 102px;
    height: 88px;
    opacity: 0.9;
  }

  .study-review-visual > span {
    position: absolute;
    width: 58px;
    height: 72px;
    top: 4px;
    right: 0;
    border-radius: 8px;
    background: linear-gradient(160deg, #7c3aed, #312e81);
    box-shadow: 0 18px 32px rgba(76, 29, 149, 0.32);
    transform: rotate(8deg);
  }

  .study-review-visual > span:nth-child(2) {
    right: 13px;
    opacity: 0.7;
    transform: rotate(4deg);
  }

  .study-review-visual > span:nth-child(3) {
    right: 26px;
    opacity: 0.5;
    transform: rotate(0deg);
  }

  .study-review-visual > div {
    position: absolute;
    left: 0;
    bottom: 8px;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #ffffff;
    background: linear-gradient(135deg, #8b5cf6, #4f46e5);
    box-shadow: 0 10px 28px rgba(124, 58, 237, 0.45);
  }

  .study-review-stats {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 30px 0 24px;
  }

  .study-review-stats div {
    min-width: 0;
    padding: 0 12px;
    border-right: 1px solid rgba(148, 163, 184, 0.14);
  }

  .study-review-stats div:last-child {
    border-right: none;
  }

  .study-primary-action {
    position: relative;
    z-index: 1;
    width: 100%;
    min-height: 58px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border: none;
    border-radius: 8px;
    color: #ffffff;
    background: linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%);
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 18px 42px rgba(91, 33, 182, 0.3);
  }

  .study-link-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: transparent;
    color: #a78bfa;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .study-week-strip {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 20px;
  }

  .study-week-strip div {
    min-width: 0;
    min-height: 76px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 8px;
    border: 1px solid transparent;
    color: #a8b0c2;
    background: rgba(255,255,255,0.025);
  }

  .study-week-strip div.active {
    color: #ffffff;
    border-color: rgba(167, 139, 250, 0.34);
    background: linear-gradient(180deg, #8b5cf6, #5b21b6);
    box-shadow: 0 16px 34px rgba(91, 33, 182, 0.3);
  }

  .study-week-strip span {
    font-size: 11px;
    font-weight: 800;
  }

  .study-week-strip strong {
    font-size: 23px;
    line-height: 1;
  }

  .study-calendar-callout {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(255,255,255,0.025);
  }

  .study-calendar-callout strong {
    display: block;
    color: #ffffff;
    font-size: 15px;
    line-height: 1.35;
    text-transform: capitalize;
  }

  .study-calendar-callout span {
    display: block;
    margin-top: 2px;
    color: #a8b0c2;
    font-size: 13px;
  }

  .study-mini-badge {
    min-width: 96px;
    min-height: 52px;
    flex-direction: column;
  }

  .study-mini-badge strong {
    color: #c4b5fd;
    font-size: 19px;
  }

  .study-mini-badge span {
    margin: 0;
    color: #a8b0c2;
    font-size: 11px;
  }

  .study-subject-list {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .study-subject-list button {
    width: 100%;
    min-width: 0;
    min-height: 58px;
    display: grid;
    grid-template-columns: auto minmax(120px, 1fr) minmax(96px, 0.9fr) auto auto;
    gap: 14px;
    align-items: center;
    padding: 0;
    border: none;
    background: transparent;
    color: #dbe4f0;
    cursor: pointer;
    text-align: left;
  }

  .study-subject-icon,
  .study-icon-tile {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .study-subject-copy {
    min-width: 0;
  }

  .study-subject-copy strong {
    display: block;
    overflow: hidden;
    color: #ffffff;
    font-size: 15px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .study-subject-copy small {
    display: block;
    overflow: hidden;
    color: #9aa4b8;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .study-subject-bar {
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.12);
  }

  .study-subject-bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    box-shadow: 0 0 18px currentColor;
  }

  .study-subject-percent {
    color: #ffffff;
    font-size: 15px;
    font-weight: 800;
  }

  .study-empty-panel {
    position: relative;
    z-index: 1;
    padding: 22px;
    border-radius: 8px;
    border: 1px dashed rgba(148, 163, 184, 0.22);
  }

  .study-empty-panel p {
    margin: 0 0 14px;
    color: #a8b0c2;
    font-size: 14px;
  }

  .study-empty-panel button {
    min-height: 40px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    color: #ffffff;
    background: #7c3aed;
    font-weight: 800;
    cursor: pointer;
  }

  .study-bottom-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(14, 17, 29, 0.72);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .study-bottom-metrics > div {
    min-width: 0;
    min-height: 104px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    column-gap: 14px;
    align-content: center;
    padding: 18px 22px;
    border-right: 1px solid rgba(148, 163, 184, 0.12);
  }

  .study-bottom-metrics > div:last-child {
    border-right: none;
  }

  .study-bottom-metrics .study-icon-tile {
    grid-row: 1 / 4;
    align-self: center;
  }

  .study-bottom-metrics p {
    margin: 0;
  }

  .study-bottom-metrics strong {
    color: #ffffff;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 800;
  }

  .study-bottom-metrics small {
    color: #8b96aa;
    font-size: 12px;
  }

  .study-icon-tile.accent,
  .study-icon-tile.violet {
    color: #a78bfa;
    background: rgba(124, 58, 237, 0.16);
  }

  .study-icon-tile.pink {
    color: #f472b6;
    background: rgba(236, 72, 153, 0.15);
  }

  .study-icon-tile.amber {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
  }

  .study-icon-tile.green {
    color: #34d399;
    background: rgba(16, 185, 129, 0.14);
  }

  .study-action-band {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 18px;
    align-items: center;
    padding: 22px 24px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background:
      linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(16, 185, 129, 0.06)),
      rgba(14, 17, 29, 0.74);
  }

  .study-action-band h2 {
    margin: 4px 0;
    color: #ffffff;
    font-size: 20px;
    line-height: 1.25;
    font-weight: 800;
    letter-spacing: 0;
  }

  .study-action-band span {
    color: #a8b0c2;
    font-size: 13px;
  }

  .study-action-band-buttons {
    display: flex;
    gap: 10px;
  }

  .study-action-band-buttons button {
    min-height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    color: #ffffff;
    background: rgba(255,255,255,0.045);
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .study-action-band-buttons button:first-child {
    border: none;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
  }

  .study-mini-ring {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 94px;
  }

  .study-mini-ring > span {
    color: #8b96aa;
    font-size: 11px;
    font-weight: 800;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  @media (max-width: 1180px) {
    .study-progress-content {
      grid-template-columns: 220px minmax(0, 1fr);
      gap: 22px;
    }

    .study-big-ring {
      width: 210px;
    }

    .study-big-ring div {
      width: 146px;
    }

    .study-big-ring strong {
      font-size: 42px;
    }

    .study-bottom-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .study-bottom-metrics > div:nth-child(2) {
      border-right: none;
    }

    .study-bottom-metrics > div:nth-child(-n+2) {
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }
  }

  @media (max-width: 980px) {
    .study-dashboard-grid,
    .study-action-band {
      grid-template-columns: 1fr;
    }

    .study-progress-content {
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr);
    }

    .study-action-band-buttons {
      width: 100%;
    }

    .study-action-band-buttons button {
      flex: 1;
    }

    .study-mini-ring {
      display: none;
    }
  }

  @media (max-width: 720px) {
    .study-dashboard-banner-wrap {
      padding: 12px 12px 0;
    }

    .study-dashboard-main {
      padding: 22px 12px 36px;
      gap: 14px;
    }

    .study-home-header {
      flex-direction: column;
      gap: 16px;
      padding: 0;
    }

    .study-home-header h1 {
      font-size: 26px;
    }

    .study-home-header p {
      font-size: 14px;
    }

    .study-header-actions {
      width: 100%;
      justify-content: space-between;
    }

    .study-streak-pill {
      min-width: 0;
      flex: 1;
    }

    .study-glass-card {
      padding: 18px;
    }

    .study-card-heading {
      flex-direction: column;
      gap: 10px;
      margin-bottom: 18px;
    }

    .study-card-heading h2 {
      font-size: 20px;
    }

    .study-review-visual {
      display: none;
    }

    .study-progress-content {
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .study-big-ring {
      width: min(228px, 76vw);
    }

    .study-progress-stats {
      grid-template-columns: 1fr;
    }

    .study-progress-stats div,
    .study-progress-stats div:nth-child(2) {
      min-height: 82px;
      border-right: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    }

    .study-progress-stats .study-wide-stat {
      border-bottom: none;
    }

    .study-review-stats {
      gap: 0;
      margin: 22px 0 20px;
    }

    .study-review-stats div {
      padding: 0 8px;
    }

    .study-review-stats strong {
      font-size: 23px;
    }

    .study-week-strip {
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
      scroll-snap-type: x mandatory;
    }

    .study-week-strip div {
      min-width: 58px;
      min-height: 68px;
      scroll-snap-align: start;
    }

    .study-calendar-callout {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .study-calendar-callout .study-mini-badge {
      grid-column: 1 / -1;
      width: 100%;
    }

    .study-subject-list button {
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 70px;
      gap: 12px;
    }

    .study-subject-bar,
    .study-subject-percent {
      grid-column: 2 / -1;
    }

    .study-subject-bar {
      width: 100%;
    }

    .study-subject-percent {
      justify-self: start;
      margin-top: -7px;
      font-size: 12px;
      color: #a8b0c2;
    }

    .study-bottom-metrics {
      grid-template-columns: 1fr;
    }

    .study-bottom-metrics > div,
    .study-bottom-metrics > div:nth-child(2) {
      border-right: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }

    .study-bottom-metrics > div:last-child {
      border-bottom: none;
    }

    .study-action-band {
      padding: 18px;
    }

    .study-action-band-buttons {
      flex-direction: column;
    }

    .study-action-band-buttons button,
    .study-primary-action {
      width: 100%;
    }
  }

  @media (max-width: 420px) {
    .study-dashboard-main {
      padding-left: 10px;
      padding-right: 10px;
    }

    .study-home-header h1 {
      font-size: 23px;
    }

    .study-streak-pill span:last-child {
      white-space: normal;
      line-height: 1.2;
    }

    .study-glass-card {
      padding: 16px;
    }

    .study-review-stats {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .study-review-stats div {
      padding: 0 0 10px;
      border-right: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }

    .study-review-stats div:last-child {
      border-bottom: none;
    }
  }
`;
