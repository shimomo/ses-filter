/** テスト用の HTML。2026-10-16 に確認した実ページの構造を、判定に必要な部分だけ残して再現する */
export const parseHtml = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

export type PaizaCardOptions = { jobId: string; recruiterId: string; company: string; title: string; subJobTitle?: string };

export function paizaCard(o: PaizaCardOptions): string {
  const info = `{"index":0,"id":${o.jobId}}`;
  const sub = o.subJobTitle
    ? `<div class="s-job-offer-card__sub"><div class="s-job-offer-card__sub-items"><div class="s-job-offer-card-sub"><a class="s-job-offer-card-sub__name" href="/career/job_offers/9${o.jobId}"><span class="s-job-offer-card-name">${o.subJobTitle}</span></a></div></div></div>`
    : '';
  return `<div class="s-job-offer-card">
  <div class="s-job-offer-card__inner">
    <div class="s-job-offer-card__header">
      <a href="/career/job_offers/${o.jobId}" class="s-job-offer-card__image" data-analytics-info='${info}'><img alt="${o.company}"></a>
      <a class="s-job-offer-card__recruiter-name" href="/recruiters/${o.recruiterId}?job_offer_id=${o.jobId}" data-analytics-info='${info}'>${o.company}</a>
    </div>
    <div class="s-job-offer-card__body">
      <div class="s-job-offer-card__body-inner"><a class="s-job-offer-card__name" href="/career/job_offers/${o.jobId}" data-analytics-info='${info}'><span class="s-job-offer-card-name s-job-offer-card-name--career">${o.title}</span></a></div>
      <div class="s-job-offer-card__status"><div class="s-job-offer-card__status-item"><span class="s-job-offer-card__status-item-inner">バックエンド/サーバサイド</span></div></div>
    </div>
  </div>
  ${sub}
</div>`;
}

export const paizaListPage = (cards: string[]): string =>
  `<!doctype html><html lang="ja"><head><title>エンジニアの求人情報 | paiza転職</title></head><body><div class="p-job-offers-list__items">${cards.join('\n')}</div></body></html>`;

export type PaizaDetailOptions = {
  jobId: string;
  recruiterId: string;
  company: string;
  title: string;
  devTypes?: string;
  employment?: string;
  location?: string;
  workHours?: string;
  extraRows?: Array<[string, string]>;
  /** 求人概要の文章（実ページと同じく、前に「更新日」の行を置く） */
  summary?: string;
  /** 職務内容の文章 */
  description?: string;
  /** 会社の説明の文章 */
  companyFeature?: string;
};

export function paizaDetailPage(o: PaizaDetailOptions): string {
  const row = (term: string, value: string): string =>
    `<dt class="m-definitions-responsive__term"> ${term} </dt><dd class="m-definitions-responsive__description"><p>${value}</p></dd>`;
  const rows = [
    row('職種名', 'システムエンジニア'),
    row('勤務地', o.location ?? '東京都'),
    o.devTypes === undefined ? '' : row('開発内容タイプ', o.devTypes),
    row('勤務時間', o.workHours ?? 'フレックスタイム制'),
    row('雇用関係', o.employment ?? '無期雇用'),
    ...(o.extraRows ?? []).map(([term, value]) => row(term, value)),
  ];
  const summary =
    o.summary === undefined
      ? ''
      : `<div class='o-recruiters-show__toggle-content' id='job-offer-feature'><div class='o-recruiters-show__content-text p-job-offer-updated-date'>更新日：2026/10/09</div><div class='o-recruiters-show__content-text'><p>${o.summary}</p></div></div>`;
  const description =
    o.description === undefined
      ? ''
      : `<div class='o-recruiters-show__toggle-section' id='job-offer-description'><div class='o-recruiters-show__toggle-content'><div class='o-recruiters-show__content-text'><p>${o.description}</p></div></div></div>`;
  const feature =
    o.companyFeature === undefined
      ? ''
      : `<div class='o-recruiters-show__recruiter_box'><div class='m-recruiter-feature'><h2 class='a-heading-primary-large'>${o.company}</h2><div class='m-recruiter-feature__text'><div>${o.companyFeature}</div></div></div></div>`;
  return `<!doctype html><html lang="ja"><head><title>${o.title}の求人:${o.company} | ITエンジニア専門の転職サイト【paiza転職】</title></head><body>
<a class="p-recruiters-tab__item" href="/recruiters/${o.recruiterId}?job_offer_id=${o.jobId}#tab_nav">企業情報</a>
${summary}<dl class="m-definitions-responsive">${rows.join('\n')}</dl>${description}${feature}</body></html>`;
}

export type GreenCardOptions = {
  companyId: string;
  jobId: string;
  company: string;
  title: string;
  location?: string;
  businessName?: string;
  businessIntro?: string;
};

export function greenCard(o: GreenCardOptions): string {
  const business =
    o.businessName === undefined
      ? ''
      : `<div class="MuiStack-root css-1q82kii"><div class="MuiBox-root css-15ufszi"><img alt="事業内容：${o.businessName}"></div><div class="MuiStack-root css-1kkt86i"><div class="MuiTypography-root MuiTypography-subtitle2 css-163sxhg">${o.businessName}</div><span class="MuiTypography-root MuiTypography-caption css-mq8sam">${o.businessIntro ?? ''}</span></div></div>`;
  return `<div class="MuiBox-root css-vfzywm"><a target="_blank" href="/company/${o.companyId}/job/${o.jobId}">
  <div class="MuiStack-root css-1ov46kg">
    <div class="MuiBox-root css-hn63dx">
      <div class="MuiStack-root job-offer-card-image css-6l5dnb"><div class="MuiBox-root css-rd6tfy"><img alt="${o.company}のイメージ画像1"></div></div>
      <div class="MuiTypography-root MuiTypography-subtitle2 css-1x5bban">${o.company}</div>
    </div>
    <div class="MuiStack-root css-ewkj1i">
      <h2 class="MuiTypography-root MuiTypography-h5 job-offer-name css-3in6ql">${o.title}</h2>
      <div class="MuiStack-root css-9rsp2i" aria-label="募集職種"><p>Webエンジニア</p></div>
      <div class="MuiStack-root css-1r8qwh0" aria-label="勤務地"><p>${o.location ?? '東京都'}</p></div>
      ${business}
    </div>
  </div>
  <div class="MuiStack-root css-1sg5qc5"><button class="MuiButtonBase-root">気になる</button></div>
</a></div>`;
}

export const greenListPage = (cards: string[]): string =>
  `<!doctype html><html lang="ja"><head><title>求人検索 | IT/Web業界の転職サイトGreen</title></head><body><div class="MuiStack-root css-1y5htl1">${cards.join('\n')}</div></body></html>`;

export type DodaCardOptions = { jobId: string; company: string; title: string; location?: string; business?: string; keywords?: string[] };

export function dodaCard(o: DodaCardOptions): string {
  const info = (label: string, value: string): string =>
    `<li><dl class="jobCard-info"><dt class="jobCard-info__title">${label}</dt><dd class="jobCard-info__content">${value}</dd></dl></li>`;
  return `<article class="jobCard">
  <a class="jobCard-header__link" href="/DodaFront/View/JobSearchDetail/j_jid__${o.jobId}/-tab__pr/"><h2>${o.company}</h2><p>${o.title}</p></a>
  ${o.keywords === undefined ? '' : `<p class="similarKeywordArea">この求人のキーワード：${o.keywords.map((word) => `<span><span class="">${word}</span>、</span>`).join('')}</p>`}
  <ul class="jobCard-infoList">${info('仕事', 'Javaを用いた業務システム開発')}${o.location === undefined ? '' : info('勤務地', o.location)}${info('給与', '400万円～700万円')}${o.business === undefined ? '' : info('事業', o.business)}</ul>
</article>`;
}

export const dodaListPage = (cards: string[]): string =>
  `<!doctype html><html lang="ja"><head><title>doda</title></head><body><main>${cards.join('\n')}</main></body></html>`;
