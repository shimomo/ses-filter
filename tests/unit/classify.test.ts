import { describe, expect, it } from 'vitest';
import { cardTargetCategory, findHits, judgeDetail, judgeFields } from '../../src/core/classify';
import type { CardFields, Category, DetailData } from '../../src/core/types';

const f = (partial: Partial<CardFields>): CardFields => ({ text: '', ...partial });

describe('judgeFields hides strong signals', () => {
  it.each<[string, CardFields, Category, string]>([
    ['SES事業 in business', f({ business: 'SES事業でエンジニアのキャリアを支援。還元率75％・案件選択制' }), 'ses', 'ses-compound'],
    ['project sites in location', f({ location: '都内を中心とする関東のプロジェクト先' }), 'ses', 'ses-location'],
    ['SES and 派遣 in business', f({ business: '■SES事業■人材派遣事業' }), 'ses', 'haken-business'],
    ['労働者派遣事業 in business', f({ business: '■労働者派遣事業' }), 'haken', 'haken-business'],
    ['bare SES in business', f({ business: '◆ソフトウェア開発事業（SES）' }), 'ses', 'ses-bare'],
    ['帰社日 in text', f({ text: '月1回の帰社日あり' }), 'ses', 'ses-kisyabi'],
    ['顧客先常駐 in text', f({ text: '顧客先常駐での開発や自社内での受託開発' }), 'ses', 'ses-joucyu'],
    ['work hours follow the client', f({ workHours: '9:00〜18:00（客先に準ずる）' }), 'ses', 'ses-workhours'],
    ['派遣先 in text', f({ text: '派遣先は全国各地' }), 'haken', 'haken-saki'],
    ['full-width ＳＥＳ事業', f({ text: 'ＳＥＳ事業を展開しています' }), 'ses', 'ses-compound'],
    ['高還元率 in text', f({ text: '高還元率×エンド直の案件多数' }), 'ses', 'ses-kangen'],
    ['projects decide remote work in location', f({ location: '【在宅勤務の案件多数／勤務地は相談可】' }), 'ses', 'ses-location-anken'],
    ['each project in location', f({ location: '都内・近郊の各プロジェクト' }), 'ses', 'ses-location-anken'],
    ['projects across the country in location', f({ location: '★リモート可★関東・各地のプロジェクト◎残業なし' }), 'ses', 'ses-location-anken'],
    ['each assigned site in location', f({ location: '東京・大阪・福岡の各配属先' }), 'ses', 'ses-location-anken'],
    ['contract client in location', f({ location: '＜入社時＞ 本社、受託先' }), 'ses', 'ses-location'],
    ['in-house work ratio below 100%', f({ text: '自社勤務比率70％' }), 'ses', 'ses-jisha-ratio'],
    ['IT engineer dispatch', f({ text: '主な事業：ITエンジニア派遣、受託開発' }), 'haken', 'haken-business'],
    ['engineer dispatch with の', f({ business: '製造業向けのITエンジニアの派遣' }), 'haken', 'haken-business'],
    ['SES in a list of businesses', f({ text: '当社にはSES・人材紹介事業もあります' }), 'ses', 'ses-compound'],
    ['SES among three businesses', f({ text: 'SES/受託開発/自社サービスの3事業を展開' }), 'ses', 'ses-compound'],
    ['high-return SES company in the title', f({ title: '【高還元SES企業】Javaエンジニア' }), 'ses', 'ses-compound'],
    ['on-site job before a career-change line', f({ text: 'インフラエンジニア（客先常駐）／未経験からの転職歓迎' }), 'ses', 'ses-kyakusaki'],
    ['hedged no on-site projects', f({ location: '東京都港区（常駐案件は基本的にありません）' }), 'ses', 'ses-location-anken'],
    ['return rate next to a highlights label', f({ text: '【この求人のポイント】還元率80%・案件選択制' }), 'ses', 'ses-kangen'],
  ])('%s', (_name, fields, category, ruleId) => {
    const result = judgeFields(fields, 'card-rule');
    expect(result.level).toBe('hide');
    expect(result.category).toBe(category);
    expect(findHits(fields).map((hit) => hit.rule.id)).toContain(ruleId);
  });
});

describe('judgeFields flags medium-only signals', () => {
  it.each<[string, CardFields]>([
    ['参画 and 案件 in the title', f({ title: 'チームで参画！大手企業の案件' })],
    ['一次請け in text', f({ text: '一次請け中心の受託開発' })],
    ['dispatch license number', f({ text: '許可番号：派 13-000000' })],
    ['bare 高還元 in the title', f({ title: '高還元のSE求人' })],
  ])('%s', (_name, fields) => {
    expect(judgeFields(fields, 'card-rule').level).toBe('flag');
  });

  it('ignores 参画 outside the title', () => {
    expect(judgeFields(f({ text: 'プロジェクトに参画していただきます' }), 'card-rule').level).toBe('none');
  });
});

describe('judgeFields ignores negations and look-alikes', () => {
  it.each<[string, CardFields]>([
    ['negated 客先常駐', f({ text: '100％自社内開発（客先常駐は一切ありません）' })],
    ['客先常駐なし', f({ text: '客先常駐なし' })],
    ['enumerated negation', f({ text: '客先常駐・SESなし' })],
    ['Amazon SES in a tech stack', f({ text: 'AWS（ECS (Fargate)、Aurora (PostgreSQL)、S3、SES、CFn）' })],
    ['Amazon SES in business', f({ business: 'Amazon SESを使ったメール配信基盤の開発' })],
    ['full-width ＡＷＳ ＳＥＳ in business', f({ business: 'ＡＷＳ ＳＥＳの運用代行' })],
    ['leaving SES', f({ text: 'SESを卒業し、攻めの自社開発へ！' })],
    ['welcoming SES experience', f({ text: 'SIer・SES歓迎' })],
    ['脱SES', f({ text: '脱SES企業を目指して自社サービスに注力' })],
    ['SES engineers changing jobs', f({ text: 'SESエンジニアからの転職を歓迎' })],
    ['plain office location', f({ location: '東京都港区（本社）' })],
    ['客先常駐はない', f({ text: '客先常駐はない' })],
    ['客先常駐がない', f({ text: '客先常駐がない環境です' })],
    ['客先常駐はなく', f({ text: '客先常駐はなく、すべて自社内で開発' })],
    ['客先常駐は無く', f({ text: '客先常駐は無く' })],
    ['客先常駐はございません', f({ text: '客先常駐はございません' })],
    ['客先常駐はしません', f({ text: '客先常駐はしません' })],
    ['contrast with SES companies', f({ text: 'SES企業とは異なり、自社サービスを開発しています' })],
    ['not high-return SES', f({ text: '高還元SESではなく自社開発です' })],
    ['former SES engineers', f({ text: '元SESエンジニアが多数活躍中' })],
    ['sales incentive', f({ title: '営業職／高還元インセン／年収600万円以上' })],
    ['sales incentive spelled out', f({ text: '成果は高還元インセンティブで評価' })],
    ['consumer point rewards', f({ text: 'ポイント還元率の高い決済サービスを開発' })],
    ['business trips by project', f({ location: '東京都港区（プロジェクトにより出張あり）' })],
    ['assignment wishes', f({ location: '★配属先はできる限り希望を反映' })],
    ['no on-site projects', f({ location: '東京都渋谷区（常駐案件はありません）' })],
    ['all in-house', f({ text: '自社勤務比率100％' })],
    ['案件 outside the location', f({ text: '大規模案件の開発をリード' })],
    ['SES among applicant backgrounds', f({ text: '自社開発・SES・SIer不問' })],
    ['not engineer dispatch', f({ text: 'エンジニア派遣ではなく自社開発' })],
    ['project status sets office days', f({ location: '【フルリモート可／転勤なし】◎プロジェクト状況やご希望によって出社頻度を調整' })],
    ['leaving on-site contract work', f({ text: '客先常駐の働き方から脱却して自社開発に挑戦' })],
    ['candidate backgrounds with 事業会社', f({ text: '必須：SIer・SES・事業会社での開発経験3年以上' })],
    ['candidate backgrounds listed with 、', f({ text: 'SES、SIer、事業会社いずれかでの開発経験' })],
    ['office days by project', f({ location: 'リモート可。プロジェクトにより出社あり' })],
    ['office days by project progress', f({ location: '東京本社（プロジェクトの進捗に応じて出社）' })],
    ['office days by project state', f({ location: 'フルリモート（プロジェクトの状況に応じて出社）' })],
    ['all projects developed in-house', f({ location: '東京本社（全案件社内開発）' })],
    ['no on-site work by project', f({ location: '東京都渋谷区（案件による常駐はありません）' })],
    ['consumer reward service', f({ text: '還元率の高いポイントサービスを自社開発' })],
    ['cashless payment reward', f({ text: '最大還元率10%のキャッシュレス決済アプリ' })],
    ['points reward rate', f({ text: 'ポイントの還元率を上げる施策を企画' })],
  ])('%s', (_name, fields) => {
    expect(judgeFields(fields, 'card-rule')).toEqual({ level: 'none', reasons: [], companyLevel: false });
  });
});

describe('judgeFields reasons', () => {
  it('reports field and matched text of each strong hit, business first', () => {
    const result = judgeFields(f({ title: '還元率90％超え', location: '各プロジェクト先' }), 'card-rule');
    expect(result.reasons).toEqual([
      { source: 'card-rule', category: 'ses', label: 'プロジェクト先', field: 'location', match: '各プロジェクト先' },
      { source: 'card-rule', category: 'ses', label: '還元率', field: 'title', match: '還元率' },
    ]);
    expect(result.companyLevel).toBe(false);
  });

  it('marks hits in the business field as company level', () => {
    expect(judgeFields(f({ business: 'システムエンジニアリングサービス' }), 'card-rule').companyLevel).toBe(true);
  });

  it('drops medium reasons when a strong one exists', () => {
    const result = judgeFields(f({ title: '大手案件に参画', text: '帰社日あり' }), 'card-rule');
    expect(result.level).toBe('hide');
    expect(result.reasons.map((reason) => reason.label)).toEqual(['帰社日']);
  });
});

const detail = (partial: Partial<DetailData>): DetailData => ({ jobId: '1', devContentsTypes: [], fields: { text: '' }, ...partial });

describe('judgeDetail', () => {
  it('hides jobs paiza labels 受託開発（社外常駐）', () => {
    expect(judgeDetail(detail({ devContentsTypes: ['受託開発（社外常駐）', 'B2B'] }))).toEqual({
      level: 'hide',
      category: 'ses',
      reasons: [{ source: 'site', category: 'ses', label: '受託開発（社外常駐）', match: '開発内容タイプ' }],
    });
  });

  it('hides dispatch employment', () => {
    const result = judgeDetail(detail({ devContentsTypes: ['自社製品/自社サービス'], employment: '派遣（常用型）' }));
    expect(result.level).toBe('hide');
    expect(result.category).toBe('haken');
  });

  it('falls back to rules on the detail fields', () => {
    const result = judgeDetail(detail({ devContentsTypes: ['受託開発（自社内開発）'], fields: { location: '各プロジェクト先', text: '' } }));
    expect(result.level).toBe('hide');
    expect(result.reasons[0]?.source).toBe('detail-rule');
  });

  it('treats a clean job as none', () => {
    const result = judgeDetail(
      detail({ devContentsTypes: ['自社製品/自社サービス'], employment: '無期雇用', fields: { location: '東京都渋谷区', text: '' } }),
    );
    expect(result.level).toBe('none');
  });

  it('reports unknown when the development type row is missing', () => {
    expect(judgeDetail(detail({ devContentsTypes: null }))).toEqual({ level: 'unknown', reasons: [] });
  });

  it('does not flag medium signals alone when paiza says the work is in-house', () => {
    const result = judgeDetail(
      detail({ devContentsTypes: ['自社製品/自社サービス', '受託開発（自社内開発）'], fields: { title: '大規模案件のPM', text: '商流：プライム案件' } }),
    );
    expect(result).toEqual({ level: 'none', reasons: [] });
  });

  it('does not hide generous pay in the description of an in-house company', () => {
    const result = judgeDetail(detail({ devContentsTypes: ['自社製品/自社サービス', 'B2B'], fields: { business: '◆成果主義で高還元の職場です', text: '' } }));
    expect(result).toEqual({ level: 'none', reasons: [] });
  });

  it('still hides strong detail signals when paiza says the work is in-house', () => {
    expect(judgeDetail(detail({ devContentsTypes: ['自社製品/自社サービス'], fields: { text: '還元率80%' } }))).toMatchObject({ level: 'hide', category: 'ses' });
  });
});

describe('cardTargetCategory', () => {
  it('returns the category of a strong hit decided outside the business field only', () => {
    expect(cardTargetCategory(judgeFields(f({ title: 'SES案件多数のインフラエンジニア' }), 'card-rule'))).toBe('ses');
    expect(cardTargetCategory(judgeFields(f({ business: 'SES事業', title: 'SES案件多数' }), 'card-rule'))).toBeNull();
    expect(cardTargetCategory(judgeFields(f({ title: '大規模案件' }), 'card-rule'))).toBeNull();
    expect(cardTargetCategory(judgeFields(f({}), 'card-rule'))).toBeNull();
  });
});
