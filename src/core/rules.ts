import type { Category, FieldName } from './types';

export type Rule = {
  id: string;
  category: Category;
  strength: 'strong' | 'medium';
  /** NFKC で正規化した文字列に当てる。matchAll で使うので g フラグを付ける */
  pattern: RegExp;
  /** 適用する欄。省略したら全欄 */
  fields?: readonly FieldName[];
  label: string;
};

export const RULES: readonly Rule[] = [
  { id: 'ses-kyakusaki', category: 'ses', strength: 'strong', pattern: /客先常駐/g, label: '客先常駐' },
  {
    id: 'ses-joucyu',
    category: 'ses',
    strength: 'strong',
    pattern: /(?:常駐先|お客様先|顧客先|客先|クライアント先)(?:での|にて|に|で)(?:勤務|就業|常駐)|(?:お客様先|顧客先|クライアント先)常駐/g,
    label: '客先での勤務',
  },
  {
    id: 'ses-location',
    category: 'ses',
    strength: 'strong',
    pattern: /(?:各|全国の|首都圏の|都内の)?(?:プロジェクト先|案件先|常駐先|クライアント先|顧客先|お客様先|受託先)/g,
    fields: ['location'],
    label: 'プロジェクト先',
  },
  {
    // 勤務地が案件しだいで決まる書き方（段階2b 仕様 4.3）。「プロジェクト先」は上のルールが拾う。すぐあとに出張・出社の話や自社の拠点（「プロジェクトにより当社別拠点での勤務」。「本社：…」の住所書きや「当社の拠点ではありません」は含めない）が続く「プロジェクト」と、「プロジェクト状況」「プロジェクト単位」は除く。
    // 「全案件社内開発」「案件による常駐はありません」のような、はっきりした否定の「案件」も除く（「基本的にありません」のようにぼかした否定は除かない）
    id: 'ses-location-anken',
    category: 'ses',
    strength: 'strong',
    pattern:
      /案件(?!(?:が|は|とも|も)?(?:社内|自社))(?!(?:による|で)(?:客先)?常駐(?:は|が|も)?(?:一切)?(?:ありません|ございません|なし|無し|ない))|プロジェクト(?!先|の?状況|単位)(?![^。]{0,10}(?:出張|出社|(?:当社|自社|弊社)[^。]{0,4}(?:拠点|オフィス|事業所)(?![^。]{0,3}(?:では|じゃ)(?:ありません|ない))))|各配属先/g,
    fields: ['location'],
    label: '勤務地が案件しだい',
  },
  { id: 'ses-kisyabi', category: 'ses', strength: 'strong', pattern: /帰社日/g, label: '帰社日' },
  { id: 'ses-anken-sentaku', category: 'ses', strength: 'strong', pattern: /案件(?:完全)?選択|案件を選べる|案件(?:は|を)自分で選/g, label: '案件選択' },
  {
    // 消費者向けの還元率（「ポイントの還元率」「還元率の高いポイントサービス」「キャッシュレス決済」など）は除く
    id: 'ses-kangen',
    category: 'ses',
    strength: 'strong',
    pattern:
      /(?<!ポイント(?:の)?)(?<!(?:キャッシュレス|キャッシュバック|決済|クレジット|クーポン|マイル)[^。]{0,10})還元率(?![^。、★◆■【】/\s]{0,6}ポイント)(?![^。]{0,10}(?:キャッシュレス|キャッシュバック|決済|クレジット|クーポン|マイル))|単価連動|単価公開/g,
    label: '還元率',
  },
  // 自社で働く割合が100％未満と書いた形。残りは社外で働く（段階2b 仕様 4.3）
  { id: 'ses-jisha-ratio', category: 'ses', strength: 'strong', pattern: /自社内?勤務比?率[:は]?\s?[1-9]?\d\s?%/g, label: '自社勤務の比率' },
  {
    id: 'ses-compound',
    category: 'ses',
    strength: 'strong',
    // 事業の並びの中の SES も拾う。「SIer・SES・事業会社での開発経験」のような応募者の経歴は「事業会社」なので除く
    pattern: /SES(?:事業|企業|エンジニア|案件|契約)|SES(?=[・、/][^。]{0,15}事業(?!会社))|システムエンジニアリングサービス|技術者常駐/g,
    label: 'SES事業',
  },
  { id: 'ses-bare', category: 'ses', strength: 'strong', pattern: /(?<![A-Za-z])SES(?![A-Za-z])/g, fields: ['business'], label: 'SES' },
  {
    id: 'ses-workhours',
    category: 'ses',
    strength: 'strong',
    pattern: /(?:客先|プロジェクト先|配属先|常駐先)(?:に準ずる|に準じる|による|により異なる)/g,
    fields: ['workHours'],
    label: '勤務時間が客先に準ずる',
  },
  {
    id: 'haken-business',
    category: 'haken',
    strength: 'strong',
    // 「【事業許可登録及び認定】 … 労働者派遣事業（派00-…号）」のような、【許可…】の見出しに続く一覧の中の「労働者派遣事業」は、派遣の働き方の記述ではないので除く（段階3a）。
    // 「厚生労働大臣許可の労働者派遣事業」のような文は当てる（最終レビューの指摘）
    pattern: /(?<!【[^】]{0,20}(?:許可|認定|登録)[^】]{0,20}】[^。]{0,120})労働者派遣事業|人材派遣|(?:技術者|エンジニア)の?派遣|特定派遣/g,
    label: '派遣事業',
  },
  { id: 'haken-employment', category: 'haken', strength: 'strong', pattern: /雇用形態:?\s*(?:無期雇用)?派遣|派遣社員|無期雇用派遣|常用型派遣/g, label: '雇用形態が派遣' },
  { id: 'haken-saki', category: 'haken', strength: 'strong', pattern: /派遣先/g, label: '派遣先' },
  { id: 'ses-title-anken', category: 'ses', strength: 'medium', pattern: /参画|案件/g, fields: ['title'], label: '参画・案件' },
  { id: 'ses-shoryu', category: 'ses', strength: 'medium', pattern: /商流|エンド直|一次請け|二次請け|プライム案件/g, label: '商流' },
  { id: 'ses-taiki', category: 'ses', strength: 'medium', pattern: /待機(?:期間|中)/g, label: '待機' },
  // 「高還元」だけの形は、成果主義の会社の手厚い報酬の言い方でもあるので要確認にとどめる。「高還元率」は上の還元率のルールが拾う（段階2b 仕様 4.1）
  { id: 'ses-kangen-weak', category: 'ses', strength: 'medium', pattern: /高還元(?!インセン)/g, label: '高還元' },
  { id: 'haken-license', category: 'haken', strength: 'medium', pattern: /派\s?\d{2}\s?-\s?\d{6}/g, label: '派遣許可番号' },
];
