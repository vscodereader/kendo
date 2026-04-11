import axios from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { prisma } from '../lib/prisma.js';

export const CATEGORY_TREE = [
  { key: '호구', label: '호구', subcategories: ['일반호구set', '고급호구set', '호면', '호완', '갑', '갑상', '명패'] },
  { key: '죽도&목검&가검', label: '죽도 & 목검 & 가검', subcategories: ['일반죽도', '고급죽도', '시합용죽도', '여성용죽도', '일제죽도', '기타죽도', '목검', '가검', '좌대'] },
  { key: '죽도집&가방류', label: '죽도집 & 가방류', subcategories: ['죽도집/목검집', '호구가방', '기타가방', '심판기집'] },
  { key: '면수건', label: '면수건', subcategories: ['일반면수건', '고급면수건', '일본산면수건', '기타면수건'] },
  { key: '도복', label: '도복', subcategories: ['일반도복set', '고급도복set', '기능성도복set', '일본산도복set', '도복상의', '도복하의'] },
  { key: '보호대', label: '보호대', subcategories: ['턱땀받이', '손목', '팔꿈치', '무릎', '발', '기타', '테이핑'] },
  { key: '코등이/받침', label: '코등이/받침', subcategories: ['죽도 코등이', '죽도 코등이받침', '목검 코등이'] },
  { key: '액세서리', label: '액세서리', subcategories: [] }
] as const;

type CategoryValue = (typeof CATEGORY_TREE)[number]['key'] | '액세서리';
type SubcategoryValue =
  | '일반호구set' | '고급호구set' | '호면' | '호완' | '갑' | '갑상' | '명패'
  | '일반죽도' | '고급죽도' | '시합용죽도' | '여성용죽도' | '일제죽도' | '기타죽도' | '목검' | '가검' | '좌대'
  | '죽도집/목검집' | '호구가방' | '기타가방' | '심판기집'
  | '일반면수건' | '고급면수건' | '일본산면수건' | '기타면수건'
  | '일반도복set' | '고급도복set' | '기능성도복set' | '일본산도복set' | '도복상의' | '도복하의'
  | '턱땀받이' | '손목' | '팔꿈치' | '무릎' | '발' | '기타' | '테이핑'
  | '죽도 코등이' | '죽도 코등이받침' | '목검 코등이'
  | null;

type Classification = {
  category: CategoryValue;
  subcategory: SubcategoryValue;
  skip?: boolean;
  skipReason?: string | null;
  matchedRuleId?: string | null;
};
type CU = { url: string; category: CategoryValue; subcategory: SubcategoryValue };
type SP = {
  name: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  productUrl: string;
  category: CategoryValue;
  subcategory: SubcategoryValue;
  shippingFee: number | null;
};

type ReclassifyContext = {
  name: string;
  normalizedName: string;
  category: CategoryValue;
  subcategory: SubcategoryValue;
  sourceUrl: string;
};

type RuleDefinition = {
  id: string;
  when: (ctx: ReclassifyContext) => boolean;
  result: Classification | ((ctx: ReclassifyContext) => Classification);
};
type SkipReasonCounter = Record<string, number>;

type UrlScrapeDiagnostics = {
  url: string;
  category: CategoryValue;
  subcategory: SubcategoryValue;
  pagesAttempted: number;
  pagesSucceeded: number;
  rawCardCount: number;
  acceptedCount: number;
  skippedCount: number;
  skipReasons: SkipReasonCounter;
  lastError: string | null;
};

type ShopScrapeDiagnostics = {
  shopKey: string;
  urlCount: number;
  pagesAttempted: number;
  pagesSucceeded: number;
  pageErrorCount: number;
  rawCardCount: number;
  acceptedCount: number;
  skippedCount: number;
  saveErrorCount: number;
  skipReasons: SkipReasonCounter;
  lastPageError: string | null;
  byUrl: UrlScrapeDiagnostics[];
};

type ScrapeExecutionResult = {
  products: SP[];
  diagnostics: ShopScrapeDiagnostics;
};

const SHOP_SEEDS = [
  { key: 'kumdoshop', name: '검도샵', baseUrl: 'http://www.kumdoshop.co.kr' },
  { key: 'kumdomall', name: '검도몰', baseUrl: 'http://www.kumdomall.co.kr' },
  { key: 'woochangsports', name: '우창스포츠', baseUrl: 'https://woochangsports.net' },
  { key: 'kumdoland', name: '검도랜드', baseUrl: 'https://www.kumdoland.com' },
  { key: 'sehyun', name: '세현상사', baseUrl: 'https://sehyun-kumdo.com' },
  { key: 'igumdo', name: 'iGumdo', baseUrl: 'http://www.igumdo.com' },
  { key: 'dkumdo', name: '대도상사', baseUrl: 'https://dkumdo.kr' },
  { key: 'kendomall', name: '검도몰닷컴(나우TECH)', baseUrl: 'https://kendomall.com' }
] as const;

const WOOCHANG_URL_RULES: CU[] = [
  { url: 'https://woochangsports.net/category/%EA%B3%A0%EA%B8%89-%EC%88%98%EC%A0%9C%ED%98%B8%EA%B5%AC/281/', category: '호구', subcategory: '고급호구set' },
  { url: 'https://woochangsports.net/category/%EA%B3%A0%EA%B8%89-%EA%B8%B0%EA%B3%84%EC%8B%9D%ED%98%B8%EA%B5%AC/282/', category: '호구', subcategory: '고급호구set' },
  { url: 'https://woochangsports.net/category/%EC%9D%BC%EB%B0%98-%EC%88%98%EC%A0%9C%ED%98%B8%EA%B5%AC/148/', category: '호구', subcategory: '일반호구set' },
  { url: 'https://woochangsports.net/category/%EC%9D%BC%EB%B0%98-%EA%B8%B0%EA%B3%84%EC%8B%9D%ED%98%B8%EA%B5%AC/149/', category: '호구', subcategory: '일반호구set' },
  { url: 'https://woochangsports.net/category/%ED%98%B8%EB%A9%B4/223/', category: '호구', subcategory: '호면' },
  { url: 'https://woochangsports.net/category/%EA%B0%91/224/', category: '호구', subcategory: '갑' },
  { url: 'https://woochangsports.net/category/%ED%98%B8%EC%99%84/225/', category: '호구', subcategory: '호완' },
  { url: 'https://woochangsports.net/category/%EA%B0%91%EC%83%81/226/', category: '호구', subcategory: '갑상' },
  { url: 'https://woochangsports.net/category/%EB%AA%85%ED%8C%A8/240/', category: '호구', subcategory: '명패' },
  { url: 'https://woochangsports.net/category/%ED%98%B8%EA%B5%AC-%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/235/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%ED%98%B8%EA%B5%AC%EC%9D%B4%EB%A6%84%ED%91%9C/278/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/134/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%ED%83%88%EC%B7%A8%EC%A0%9C/236/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EC%9E%A5%EC%8B%9D%EC%9A%A9%ED%92%88/230/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EB%8F%84%EC%9E%A5%EC%9A%A9%ED%92%88/273/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EA%B8%B0%ED%83%80%EC%86%8C%ED%92%88/237/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EB%8F%84%EB%B3%B5%EC%86%8C%ED%92%88/234/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EC%A3%BD%EB%8F%84%EC%86%8C%ED%92%88/177/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EA%B8%B0%ED%83%80-%EC%86%8C%ED%92%88/103/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EB%AC%B4%EC%88%A0%EC%88%98%EB%A0%A8%EC%9E%A5%EB%B9%84/104/', category: '액세서리', subcategory: null },
  { url: 'https://woochangsports.net/category/%EC%9D%BC%EB%B0%98%EB%8F%84%EB%B3%B5/220/', category: '도복', subcategory: '일반도복set' },
  { url: 'https://woochangsports.net/category/%EA%B3%A0%EA%B8%89%EB%8F%84%EB%B3%B5/221/', category: '도복', subcategory: '고급도복set' },
  { url: 'https://woochangsports.net/category/%EA%B8%B0%EB%8A%A5%EC%84%B1%EB%8F%84%EB%B3%B5/222/', category: '도복', subcategory: '기능성도복set' },
  { url: 'https://woochangsports.net/category/%EC%83%81%ED%95%98%EC%9D%98-%EC%84%B8%ED%8A%B8/184/', category: '도복', subcategory: '고급도복set' },
  { url: 'https://woochangsports.net/category/%EC%83%81%EC%9D%98/185/', category: '도복', subcategory: '도복상의' },
  { url: 'https://woochangsports.net/category/%ED%95%98%EC%9D%98/186/', category: '도복', subcategory: '도복하의' },
  { url: 'https://woochangsports.net/category/%EB%B6%80%EC%8A%88%EC%9D%B4%EC%B9%98/211/', category: '도복', subcategory: '일본산도복set' },
  { url: 'https://woochangsports.net/category/%EB%A7%88%EC%B8%A0%EC%B9%B8/287/', category: '도복', subcategory: '일본산도복set' },
  { url: 'https://woochangsports.net/category/%EB%82%98%EC%B9%B4%EC%A7%80%EB%A7%88/210/', category: '도복', subcategory: '일본산도복set' },
  { url: 'https://woochangsports.net/category/%EC%82%B0%EC%BC%80%EC%9D%B4/212/', category: '도복', subcategory: '일본산도복set' },
  { url: 'https://woochangsports.net/category/%EA%B0%80%EC%A0%9C/213/', category: '도복', subcategory: '일본산도복set' },
  { url: 'https://woochangsports.net/category/%EC%9D%BC%EB%B0%98%EC%A3%BD%EB%8F%84/170/', category: '죽도&목검&가검', subcategory: '일반죽도' },
  { url: 'https://woochangsports.net/category/%EA%B3%A0%EA%B8%89%EC%A3%BD%EB%8F%84/171/', category: '죽도&목검&가검', subcategory: '고급죽도' },
  { url: 'https://woochangsports.net/category/%EC%8B%9C%ED%95%A9%EC%9A%A9%EC%A3%BD%EB%8F%84/172/', category: '죽도&목검&가검', subcategory: '시합용죽도' },
  { url: 'https://woochangsports.net/category/%EC%97%AC%EC%84%B1%EC%9A%A9%EC%A3%BD%EB%8F%84/173/', category: '죽도&목검&가검', subcategory: '여성용죽도' },
  { url: 'https://woochangsports.net/category/%EC%95%8C%EC%A3%BD%EB%8F%84/174/', category: '죽도&목검&가검', subcategory: '기타죽도' },
  { url: 'https://woochangsports.net/category/%EC%9D%BC%EB%B3%B8%EC%82%B0-%EC%95%8C%EC%A3%BD%EB%8F%84/175/', category: '죽도&목검&가검', subcategory: '일제죽도' },
  { url: 'https://woochangsports.net/category/%ED%8A%B9%EC%88%98%EC%A3%BD%EB%8F%84%ED%9B%88%EB%A0%A8%EC%9A%A9%EC%A3%BD%EB%8F%84/176/', category: '죽도&목검&가검', subcategory: '기타죽도' },
  { url: 'https://woochangsports.net/category/%EB%AA%A9%EA%B2%80/100/', category: '죽도&목검&가검', subcategory: '목검' },
  { url: 'https://woochangsports.net/category/%EA%B0%80%EA%B2%80/101/', category: '죽도&목검&가검', subcategory: '가검' },
  { url: 'https://woochangsports.net/category/%EC%A2%8C%EB%8C%80/102/', category: '죽도&목검&가검', subcategory: '좌대' },
  { url: 'https://woochangsports.net/category/%EC%A3%BD%EB%8F%84-%EC%BD%94%EB%93%B1%EC%9D%B4/137/', category: '코등이/받침', subcategory: '죽도 코등이' },
  { url: 'https://woochangsports.net/category/%EC%A3%BD%EB%8F%84-%EC%BD%94%EB%93%B1%EC%9D%B4%EB%B0%9B%EC%B9%A8/138/', category: '코등이/받침', subcategory: '죽도 코등이받침' },
  { url: 'https://woochangsports.net/category/%EB%AA%A9%EA%B2%80-%EC%BD%94%EB%93%B1%EC%9D%B4/139/', category: '코등이/받침', subcategory: '목검 코등이' },
  { url: 'https://woochangsports.net/category/%EC%A3%BD%EB%8F%84%EC%A7%91%EB%AA%A9%EA%B2%80%EC%A7%91/62/', category: '죽도집&가방류', subcategory: '죽도집/목검집' },
  { url: 'https://woochangsports.net/category/%ED%98%B8%EA%B5%AC%EA%B0%80%EB%B0%A9/63/', category: '죽도집&가방류', subcategory: '호구가방' },
  { url: 'https://woochangsports.net/category/%ED%98%B8%EA%B5%AC%EA%B0%80%EB%B0%A9%EC%A3%BD%EB%8F%84%EC%A7%91-%EC%84%B8%ED%8A%B8/64/', category: '죽도집&가방류', subcategory: '호구가방' },
  { url: 'https://woochangsports.net/category/%EB%8F%84%EB%B3%B5%EA%B0%80%EB%B0%A9%EC%86%90%EA%B0%80%EB%B0%A9%ED%98%B8%EC%99%84%EA%B0%80%EB%B0%A9/65/', category: '죽도집&가방류', subcategory: '기타가방' },
  { url: 'https://woochangsports.net/category/%EC%8B%AC%ED%8C%90%EA%B8%B0%EC%A7%91/66/', category: '죽도집&가방류', subcategory: '심판기집' },
  { url: 'https://woochangsports.net/category/%EC%9D%BC%EB%B3%B8%EC%82%B0-%EC%9D%B4%EC%9B%90%EC%97%BC-%EB%A9%B4%EC%88%98%EA%B1%B4/77/', category: '면수건', subcategory: '일본산면수건' },
  { url: 'https://woochangsports.net/category/%EC%9D%BC%EB%B3%B8%EC%82%B0-%EB%A9%B4%EC%88%98%EA%B1%B4/78/', category: '면수건', subcategory: '일본산면수건' },
  { url: 'https://woochangsports.net/category/%EA%B3%A0%EA%B8%89-%EB%A9%B4%EC%88%98%EA%B1%B4/79/', category: '면수건', subcategory: '고급면수건' },
  { url: 'https://woochangsports.net/category/%EB%AA%A8%EC%9E%90-%EB%A9%B4%EC%88%98%EA%B1%B4/80/', category: '면수건', subcategory: '기타면수건' },
  { url: 'https://woochangsports.net/category/%EC%95%88%EB%B3%B4-%EB%A9%B4%EC%88%98%EA%B1%B4/81/', category: '면수건', subcategory: '일본산면수건' },
  { url: 'https://woochangsports.net/category/%ED%84%B1%EB%95%80%EB%B0%9B%EC%9D%B4/33/', category: '보호대', subcategory: '턱땀받이' },
  { url: 'https://woochangsports.net/category/%EC%86%90%EB%AA%A9%ED%8C%94%EA%BF%88%EC%B9%98/34/', category: '보호대', subcategory: '손목' },
  { url: 'https://woochangsports.net/category/%EB%AC%B4%EB%A6%8E/35/', category: '보호대', subcategory: '무릎' },
  { url: 'https://woochangsports.net/category/%EB%B0%9C/36/', category: '보호대', subcategory: '발' },
  { url: 'https://woochangsports.net/category/%EA%B8%B0%ED%83%80/37/', category: '보호대', subcategory: '기타' },
  { url: 'https://woochangsports.net/category/%ED%85%8C%EC%9D%B4%ED%95%91/38/', category: '보호대', subcategory: '테이핑' },
  { url: 'https://woochangsports.net/category/%EC%9E%A0%EC%8A%A4%ED%8A%B8/39/', category: '보호대', subcategory: null },
];

const KENDOMALL_COM_URL_RULES: CU[] = [
  { url: 'https://kendomall.com/product/list.html?cate_no=24', category: '호구', subcategory: null },
  { url: 'https://kendomall.com/product/list.html?cate_no=25', category: '도복', subcategory: null },
  { url: 'https://kendomall.com/product/list.html?cate_no=93', category: '도복', subcategory: '일반도복set' },
  { url: 'https://kendomall.com/product/list.html?cate_no=92', category: '도복', subcategory: '고급도복set' },
  { url: 'https://kendomall.com/product/list.html?cate_no=70', category: '죽도&목검&가검', subcategory: '일반죽도' },
  { url: 'https://kendomall.com/product/list.html?cate_no=69', category: '죽도&목검&가검', subcategory: '고급죽도' },
  { url: 'https://kendomall.com/product/list.html?cate_no=84', category: '죽도&목검&가검', subcategory: '고급죽도' },
  { url: 'https://kendomall.com/product/list.html?cate_no=87', category: '죽도&목검&가검', subcategory: '고급죽도' },
  { url: 'https://kendomall.com/product/list.html?cate_no=71', category: '죽도&목검&가검', subcategory: '고급죽도' },
  { url: 'https://kendomall.com/product/list.html?cate_no=4', category: '죽도집&가방류', subcategory: '죽도집/목검집' },
  { url: 'https://kendomall.com/product/list.html?cate_no=38', category: '죽도&목검&가검', subcategory: '목검' },
  { url: 'https://kendomall.com/product/list.html?cate_no=39', category: '죽도&목검&가검', subcategory: '가검' },
  { url: 'https://kendomall.com/product/list.html?cate_no=40', category: '죽도&목검&가검', subcategory: '좌대' },
  { url: 'https://kendomall.com/product/list.html?cate_no=28', category: '죽도집&가방류', subcategory: '호구가방' },
  { url: 'https://kendomall.com/product/list.html?cate_no=31', category: '액세서리', subcategory: null },
  { url: 'https://kendomall.com/product/list.html?cate_no=32', category: '액세서리', subcategory: null },
  { url: 'https://kendomall.com/product/list.html?cate_no=86', category: '면수건', subcategory: '일반면수건' },
  { url: 'https://kendomall.com/product/list.html?cate_no=30', category: '보호대', subcategory: null },
  { url: 'https://kendomall.com/product/list.html?cate_no=27', category: '액세서리', subcategory: null },
];

const SEHYUN_URL_RULES: CU[] = [
  { url: 'https://sehyun-kumdo.com/category/%EC%84%B8%ED%8A%B8/83/', category: '호구', subcategory: '고급호구set' },
  { url: 'https://sehyun-kumdo.com/category/men/85/', category: '호구', subcategory: '호면' },
  { url: 'https://sehyun-kumdo.com/category/kote/86/', category: '호구', subcategory: '호완' },
  { url: 'https://sehyun-kumdo.com/category/mune-do/87/', category: '호구', subcategory: '갑' },
  { url: 'https://sehyun-kumdo.com/category/tare/88/', category: '호구', subcategory: '갑상' },
  { url: 'https://sehyun-kumdo.com/category/%EC%84%B8%ED%8A%B8/104/', category: '도복', subcategory: '고급도복set' },
  { url: 'https://sehyun-kumdo.com/category/kendogi/102/', category: '도복', subcategory: '도복상의' },
  { url: 'https://sehyun-kumdo.com/category/hakama/103/', category: '도복', subcategory: '도복하의' },
  { url: 'https://sehyun-kumdo.com/category/%ED%94%84%EB%A6%AC%EB%AF%B8%EC%97%84/92/', category: '죽도&목검&가검', subcategory: '고급죽도' },
  { url: 'https://sehyun-kumdo.com/category/madake-shinai/90/', category: '죽도&목검&가검', subcategory: '고급죽도' },
  { url: 'https://sehyun-kumdo.com/category/keichiku-shinai/91/', category: '죽도&목검&가검', subcategory: '일반죽도' },
  { url: 'https://sehyun-kumdo.com/category/bokken/93/', category: '죽도&목검&가검', subcategory: '목검' },
  { url: 'https://sehyun-kumdo.com/category/%E5%AE%89%E4%BF%A1%E5%95%86%E4%BC%9A/95/', category: '호구', subcategory: '고급호구set' },
  { url: 'https://sehyun-kumdo.com/category/%E3%83%92%E3%83%AD%E3%83%A4/94/', category: '호구', subcategory: '고급호구set' },
  { url: 'https://sehyun-kumdo.com/category/%E8%A5%BF%E6%97%A5%E6%9C%AC%E6%AD%A6%E9%81%93%E5%85%B7/121/', category: '호구', subcategory: '고급호구set' },
  { url: 'https://sehyun-kumdo.com/category/%E6%B0%B8%E6%A5%BD%E5%B1%8B/97/', category: '면수건', subcategory: '일본산면수건' },
  { url: 'https://sehyun-kumdo.com/category/busen/143/', category: '도복', subcategory: '일본산도복set' },
  { url: 'https://sehyun-kumdo.com/category/%E9%A3%AF%E7%94%B0%E6%AD%A6%E9%81%93%E5%85%B7/149/', category: '호구', subcategory: '고급호구set' },
  { url: 'https://sehyun-kumdo.com/product/list.html?cate_no=96', category: '호구', subcategory: '고급호구set' },
  { url: 'https://sehyun-kumdo.com/category/tsuba-dome/105/', category: '코등이/받침', subcategory: '죽도 코등이' },
  { url: 'https://sehyun-kumdo.com/category/himo/106/', category: '액세서리', subcategory: null },
  { url: 'https://sehyun-kumdo.com/category/chichikawa-men/107/', category: '액세서리', subcategory: null },
  { url: 'https://sehyun-kumdo.com/category/nahuda/108/', category: '호구', subcategory: '명패' },
  { url: 'https://sehyun-kumdo.com/category/tenugui/109/', category: '면수건', subcategory: '일본산면수건' },
  { url: 'https://sehyun-kumdo.com/category/protector/110/', category: '보호대', subcategory: null },
  { url: 'https://sehyun-kumdo.com/category/etc/111/', category: '액세서리', subcategory: null },
];

const KUMDOMALL_URL_RULES: CU[] = [
  { url: 'http://www.kumdomall.co.kr/shop/shopbrand.html?type=X&xcode=042', category: '호구', subcategory: null },
  { url: 'http://www.kumdomall.co.kr/shop/shopbrand.html?type=X&xcode=043', category: '죽도&목검&가검', subcategory: null },
  { url: 'http://www.kumdomall.co.kr/shop/shopbrand.html?type=O&xcode=046', category: '죽도집&가방류', subcategory: null },
  { url: 'http://www.kumdomall.co.kr/shop/shopbrand.html?type=X&xcode=044', category: '도복', subcategory: null },
  { url: 'http://www.kumdomall.co.kr/shop/shopbrand.html?type=O&xcode=045', category: '보호대', subcategory: null },
  { url: 'http://www.kumdomall.co.kr/shop/shopbrand.html?type=X&xcode=048', category: '죽도&목검&가검', subcategory: null },
  { url: 'http://www.kumdomall.co.kr/shop/shopbrand.html?type=O&xcode=049', category: '액세서리', subcategory: null },
];

const KUMDOSHOP_URL_RULES: CU[] = [
  { url: 'http://www.kumdoshop.co.kr/shop/shopbrand.html?xcode=004&type=X', category: '호구', subcategory: null },
  { url: 'http://www.kumdoshop.co.kr/shop/shopbrand.html?xcode=007&type=X', category: '도복', subcategory: null },
  { url: 'http://www.kumdoshop.co.kr/shop/shopbrand.html?xcode=005&type=X', category: '죽도&목검&가검', subcategory: null },
  { url: 'http://www.kumdoshop.co.kr/shop/shopbrand.html?xcode=002&type=X', category: '죽도&목검&가검', subcategory: null },
  { url: 'http://www.kumdoshop.co.kr/shop/shopbrand.html?xcode=014&type=Y', category: '죽도집&가방류', subcategory: null },
  { url: 'http://www.kumdoshop.co.kr/shop/shopbrand.html?xcode=006&type=X', category: '보호대', subcategory: null },
  { url: 'http://www.kumdoshop.co.kr/shop/shopbrand.html?xcode=015&type=Y', category: '액세서리', subcategory: null },
];

const KUMDOLAND_URL_RULES: CU[] = [
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=001', category: '호구', subcategory: null },
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=002', category: '호구', subcategory: null },
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=046', category: '도복', subcategory: null },
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=004', category: '죽도&목검&가검', subcategory: null },
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=010', category: '죽도&목검&가검', subcategory: null },
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=011', category: '액세서리', subcategory: null },
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=012', category: '죽도집&가방류', subcategory: null },
  { url: 'https://www.kumdoland.com/shop/shopbrand.html?type=X&xcode=013', category: '보호대', subcategory: null },
];

const DKUMDO_URL_RULES: CU[] = [
  { url: 'https://dkumdo.kr/product/list.html?cate_no=42', category: '호구', subcategory: null },
  { url: 'https://dkumdo.kr/product/list.html?cate_no=43', category: '죽도&목검&가검', subcategory: null },
  { url: 'https://dkumdo.kr/product/list.html?cate_no=44', category: '도복', subcategory: null },
];

const WOOCHANG_ACCESSORY_SOURCE_URLS = new Set([
  'https://woochangsports.net/category/%ED%98%B8%EA%B5%AC-%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/235/',
  'https://woochangsports.net/category/%ED%98%B8%EA%B5%AC%EC%9D%B4%EB%A6%84%ED%91%9C/278/',
  'https://woochangsports.net/category/%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/134/',
  'https://woochangsports.net/category/%ED%83%88%EC%B7%A8%EC%A0%9C/236/',
  'https://woochangsports.net/category/%EC%9E%A5%EC%8B%9D%EC%9A%A9%ED%92%88/230/',
  'https://woochangsports.net/category/%EB%8F%84%EC%9E%A5%EC%9A%A9%ED%92%88/273/',
  'https://woochangsports.net/category/%EA%B8%B0%ED%83%80%EC%86%8C%ED%92%88/237/',
]);

const JAPANESE_SWORD_NAME_PATTERNS = [
  /타이센/,
  /금\s*도인/,
  /금\s*무신/,
  /금\s*변경/,
  /금\s*인왕/,
  /금\s*토도로키/,
  /산케이/,
  /죠스이/,
  /금\s*장문/,
  /최상청무/,
  /용왕/,
  /공응/,
  /경도예산/,
  /아수라/,
  /태평/,
  /^용/,
  /기/,
  /오도/,
  /인왕/,
  /젠/,
  /무아/,
  /의봉작/,
  /국승/,
  /청무별작/,
  /금강/,
  /위신/,
  /수호신/,
  /사에/,
  /신기\s*금/,
  /일도제/,
  /비사문/,
  /극/,
  /최상/,
  /대아/,
  /대하/,
] as const;

const ACCESSORY_KEYWORDS = [
  /열쇠고리/,
  /키링/,
  /키홀더/,
  /마스크/,
  /호면마스크/,
  /호면열쇠고리/,
  /호면\s*열쇠고리/,
  /호면가죽/,
  /치치가와/,
  /가죽고리/,
  /귀갑/,
  /갑끈/,
  /갑상끈/,
  /호구끈/,
  /면끈/,
  /어깨패드/,
  /패드/,
  /제습/,
  /탈취/,
  /방향제/,
  /장식용품/,
  /도장용품/,
  /기타소품/,
  /자수/,
  /이름표/,
  /명패끈/,
] as const;

const MANUAL_RULES: RuleDefinition[] = [
  {
    id: 'woochang-accessory-pages-default',
    when: (ctx) => WOOCHANG_ACCESSORY_SOURCE_URLS.has(ctx.sourceUrl) && !/안경태|안경/.test(ctx.normalizedName),
    result: { category: '액세서리', subcategory: null },
  },
  {
    id: 'woochang-accessory-pages-glasses-to-protector-etc',
    when: (ctx) => WOOCHANG_ACCESSORY_SOURCE_URLS.has(ctx.sourceUrl) && /안경태|안경/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '기타' },
  },
  {
    id: 'skip-youth-shinai',
    when: (ctx) => isShinaiContext(ctx) && /(유치부|초등학생|중학생|고등학생)/.test(ctx.normalizedName),
    result: (ctx) => ({ category: ctx.category, subcategory: ctx.subcategory, skip: true }),
  },
  {
    id: 'protectors-and-gloves-to-protector',
    when: (ctx) => /면장갑|장갑|보호대/.test(ctx.normalizedName),
    result: (ctx) => ({ category: '보호대', subcategory: guessProtectorSubcategory(ctx.normalizedName) }),
  },
  {
    id: 'stand-before-weapon',
    when: (ctx) => /좌대|거치대|스탠드/.test(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '좌대' },
  },
  {
    id: 'bokken-to-bokken',
    when: (ctx) => /목검|목도/.test(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '목검' },
  },
  {
    id: 'gageom-to-gageom',
    when: (ctx) => /가검/.test(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '가검' },
  },
  {
    id: 'training-shinai-to-etc',
    when: (ctx) => isShinaiContext(ctx) && /실내연습용|연습용|훈련용/.test(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '기타죽도' },
  },
  {
    id: 'carbon-shinai-to-etc',
    when: (ctx) => isShinaiContext(ctx) && /카본죽도|카본/.test(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '기타죽도' },
  },
  {
    id: 'female-shinai',
    when: (ctx) => isShinaiContext(ctx) && /여성용/.test(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '여성용죽도' },
  },
  {
    id: 'match-shinai',
    when: (ctx) => isShinaiContext(ctx) && /실전|시합/.test(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '시합용죽도' },
  },
  {
    id: 'japanese-shinai-by-name',
    when: (ctx) => isShinaiContext(ctx) && looksLikeJapaneseShinai(ctx.normalizedName),
    result: { category: '죽도&목검&가검', subcategory: '일제죽도' },
  },
  {
    id: 'kendomall-cate24-player-hogu-to-normal-set',
    when: (ctx) => ctx.sourceUrl === 'https://kendomall.com/product/list.html?cate_no=24' && /선수용\s*호구/.test(ctx.normalizedName),
    result: { category: '호구', subcategory: '일반호구set' },
  },
  {
    id: 'kendomall-cate24-hanja-or-1x-to-premium-set',
    when: (ctx) =>
      ctx.sourceUrl === 'https://kendomall.com/product/list.html?cate_no=24' &&
      (containsHanCharacter(ctx.normalizedName) || /(?:^|[^0-9])(1\.0|1\.2|1\.5)(?:[^0-9]|$)/.test(ctx.normalizedName)),
    result: { category: '호구', subcategory: '고급호구set' },
  },
  {
    id: 'myeonggyeong-to-accessory',
    when: (ctx) => /명경/.test(ctx.normalizedName),
    result: { category: '액세서리', subcategory: null },
  },
  {
    id: 'heel-protectors-to-foot-protector',
    when: (ctx) => /뒤?꿈치보호대|뒷꿈치보호대|발바닥보호대|덧신|족대신발|족대/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '발' },
  },
  {
    id: '2-5-bun-howan-to-howan',
    when: (ctx) => /2\.5\s*푼.*호완|호완.*2\.5\s*푼/.test(ctx.normalizedName),
    result: { category: '호구', subcategory: '호완' },
  },
];

const GLOBAL_RULES: RuleDefinition[] = [
  {
    id: 'generic-accessories',
    when: (ctx) =>
      ACCESSORY_KEYWORDS.some((pattern) => pattern.test(ctx.normalizedName)) &&
      !/(호구세트|호구셋|세트|set)/i.test(ctx.normalizedName),
    result: { category: '액세서리', subcategory: null },
  },
  {
    id: 'generic-strap-products-to-accessory',
    when: (ctx) =>
      /끈/.test(ctx.normalizedName) &&
      !/(호구세트|호구셋|세트|set)/i.test(ctx.normalizedName),
    result: { category: '액세서리', subcategory: null },
  },
  {
    id: 'uniform-top',
    when: (ctx) => /상의/.test(ctx.normalizedName) && !/(호구|죽도|가검|목검|보호)/.test(ctx.normalizedName),
    result: { category: '도복', subcategory: '도복상의' },
  },
  {
    id: 'uniform-bottom',
    when: (ctx) => /하의/.test(ctx.normalizedName) && !/(호구|죽도|가검|목검|보호)/.test(ctx.normalizedName),
    result: { category: '도복', subcategory: '도복하의' },
  },
  {
    id: 'referee-bag',
    when: (ctx) => /심판기집|심판.*집/.test(ctx.normalizedName),
    result: { category: '죽도집&가방류', subcategory: '심판기집' },
  },
  {
    id: 'hogu-bag',
    when: (ctx) => /(호구.*가방|호구가방)/.test(ctx.normalizedName),
    result: { category: '죽도집&가방류', subcategory: '호구가방' },
  },
  {
    id: 'other-bag',
    when: (ctx) => /(백팩|숄더|캐리어)/.test(ctx.normalizedName) && !/호구/.test(ctx.normalizedName),
    result: { category: '죽도집&가방류', subcategory: '기타가방' },
  },
  {
    id: 'shinai-bag',
    when: (ctx) => /(죽도집|죽도가방|목검집)/.test(ctx.normalizedName),
    result: { category: '죽도집&가방류', subcategory: '죽도집/목검집' },
  },
  {
    id: 'japanese-tenugui',
    when: (ctx) =>
      /면수건/.test(ctx.normalizedName) &&
      /(일제|일본산|이원염|안보|부슈이치|마츠칸|나카지마|산케이|가제|busen|matsukan)/i.test(ctx.normalizedName),
    result: { category: '면수건', subcategory: '일본산면수건' },
  },
  {
    id: 'basic-tenugui',
    when: (ctx) => /면수건/.test(ctx.normalizedName),
    result: { category: '면수건', subcategory: '일반면수건' },
  },
  {
    id: 'protector-chin',
    when: (ctx) => /턱땀받이/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '턱땀받이' },
  },
  {
    id: 'protector-wrist',
    when: (ctx) => /손목.*보호|손목보호/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '손목' },
  },
  {
    id: 'protector-elbow',
    when: (ctx) => /팔꿈치/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '팔꿈치' },
  },
  {
    id: 'protector-knee',
    when: (ctx) => /무릎/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '무릎' },
  },
  {
    id: 'protector-foot',
    when: (ctx) => /(덧신|족대|뒷꿈치|발바닥|발.*보호)/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '발' },
  },
  {
    id: 'protector-taping',
    when: (ctx) => /(테이프|테이핑)/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '테이핑' },
  },
  {
    id: 'protector-etc-glasses',
    when: (ctx) => /안경/.test(ctx.normalizedName),
    result: { category: '보호대', subcategory: '기타' },
  },
  {
    id: 'koddeungi-dome',
    when: (ctx) => /코등이받침|츠바도메/.test(ctx.normalizedName),
    result: { category: '코등이/받침', subcategory: '죽도 코등이받침' },
  },
  {
    id: 'mokgeom-koddeungi',
    when: (ctx) => /목검.*코등이/.test(ctx.normalizedName),
    result: { category: '코등이/받침', subcategory: '목검 코등이' },
  },
  {
    id: 'jookdo-koddeungi',
    when: (ctx) => /코등이/.test(ctx.normalizedName),
    result: { category: '코등이/받침', subcategory: '죽도 코등이' },
  },
];

const FALLBACK_RULES: RuleDefinition[] = [
  {
    id: 'fallback-howan',
    when: (ctx) => /호완/.test(ctx.normalizedName),
    result: { category: '호구', subcategory: '호완' },
  },
  {
    id: 'fallback-homyeon',
    when: (ctx) => /호면/.test(ctx.normalizedName) && !/호면가죽|호면마스크|호면열쇠고리/.test(ctx.normalizedName),
    result: { category: '호구', subcategory: '호면' },
  },
  {
    id: 'fallback-gapsang',
    when: (ctx) => /갑상/.test(ctx.normalizedName),
    result: { category: '호구', subcategory: '갑상' },
  },
  {
    id: 'fallback-mune-to-gap',
    when: (ctx) => /무네/.test(ctx.normalizedName),
    result: { category: '호구', subcategory: '갑' },
  },
];

const SHOP_CONFIG: Record<string, { urls: CU[]; scraper: 'cafe24' | 'legacy'; encoding: 'utf-8' | 'euc-kr' }> = {
  woochangsports: { urls: WOOCHANG_URL_RULES, scraper: 'cafe24', encoding: 'utf-8' },
  kendomall: { urls: KENDOMALL_COM_URL_RULES, scraper: 'cafe24', encoding: 'utf-8' },
  sehyun: { urls: SEHYUN_URL_RULES, scraper: 'cafe24', encoding: 'utf-8' },
  dkumdo: { urls: DKUMDO_URL_RULES, scraper: 'cafe24', encoding: 'utf-8' },
  kumdoshop: { urls: KUMDOSHOP_URL_RULES, scraper: 'legacy', encoding: 'euc-kr' },
  kumdomall: { urls: KUMDOMALL_URL_RULES, scraper: 'legacy', encoding: 'euc-kr' },
  kumdoland: { urls: KUMDOLAND_URL_RULES, scraper: 'legacy', encoding: 'euc-kr' },
  igumdo: { urls: [], scraper: 'legacy', encoding: 'euc-kr' },
};

const FIXED_SOURCE_RULES: CU[] = Object.values(SHOP_CONFIG).flatMap((config) => config.urls);

export async function seedShops() {
  for (const s of SHOP_SEEDS) {
    await prisma.kendoShop.upsert({
      where: { key: s.key },
      update: { name: s.name, baseUrl: s.baseUrl, isActive: true },
      create: { ...s, isActive: true }
    });
  }
}

async function fetchPage(url: string, encoding: 'utf-8' | 'euc-kr' = 'utf-8') {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });

  return encoding === 'euc-kr'
    ? iconv.decode(Buffer.from(response.data), 'euc-kr')
    : Buffer.from(response.data).toString('utf-8');
}

function createUrlDiagnostics(cat: CU): UrlScrapeDiagnostics {
  return {
    url: cat.url,
    category: cat.category,
    subcategory: cat.subcategory,
    pagesAttempted: 0,
    pagesSucceeded: 0,
    rawCardCount: 0,
    acceptedCount: 0,
    skippedCount: 0,
    skipReasons: {},
    lastError: null
  };
}

function createShopDiagnostics(shopKey: string, urls: CU[]): ShopScrapeDiagnostics {
  return {
    shopKey,
    urlCount: urls.length,
    pagesAttempted: 0,
    pagesSucceeded: 0,
    pageErrorCount: 0,
    rawCardCount: 0,
    acceptedCount: 0,
    skippedCount: 0,
    saveErrorCount: 0,
    skipReasons: {},
    lastPageError: null,
    byUrl: urls.map((cat) => createUrlDiagnostics(cat))
  };
}

function incrementCounter(counter: SkipReasonCounter, key: string, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
}

function recordRawCards(shopDiagnostics: ShopScrapeDiagnostics, urlDiagnostics: UrlScrapeDiagnostics, count: number) {
  shopDiagnostics.rawCardCount += count;
  urlDiagnostics.rawCardCount += count;
}

function recordAccepted(shopDiagnostics: ShopScrapeDiagnostics, urlDiagnostics: UrlScrapeDiagnostics) {
  shopDiagnostics.acceptedCount += 1;
  urlDiagnostics.acceptedCount += 1;
}

function recordSkipped(shopDiagnostics: ShopScrapeDiagnostics, urlDiagnostics: UrlScrapeDiagnostics, reason: string) {
  shopDiagnostics.skippedCount += 1;
  urlDiagnostics.skippedCount += 1;
  incrementCounter(shopDiagnostics.skipReasons, reason);
  incrementCounter(urlDiagnostics.skipReasons, reason);
}

function recordPageAttempt(shopDiagnostics: ShopScrapeDiagnostics, urlDiagnostics: UrlScrapeDiagnostics) {
  shopDiagnostics.pagesAttempted += 1;
  urlDiagnostics.pagesAttempted += 1;
}

function recordPageSuccess(shopDiagnostics: ShopScrapeDiagnostics, urlDiagnostics: UrlScrapeDiagnostics) {
  shopDiagnostics.pagesSucceeded += 1;
  urlDiagnostics.pagesSucceeded += 1;
}

function recordPageError(shopDiagnostics: ShopScrapeDiagnostics, urlDiagnostics: UrlScrapeDiagnostics, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  shopDiagnostics.pageErrorCount += 1;
  shopDiagnostics.lastPageError = message;
  urlDiagnostics.lastError = message;
}

async function scrapeCafe24(
  shopKey: string,
  baseUrl: string,
  urls: CU[],
  encoding: 'utf-8' | 'euc-kr' = 'utf-8'
): Promise<ScrapeExecutionResult> {
  const all: SP[] = [];
  const diagnostics = createShopDiagnostics(shopKey, urls);

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const cat = urls[urlIndex];
    const urlDiagnostics = diagnostics.byUrl[urlIndex];

    try {
      recordPageAttempt(diagnostics, urlDiagnostics);
      const html = await fetchPage(cat.url, encoding);
      recordPageSuccess(diagnostics, urlDiagnostics);
      const $ = cheerio.load(html);

      let maxPage = 1;
      $('a[href*="page="]').each((_, el) => {
        const match = ($(el).attr('href') ?? '').match(/page=(\d+)/);
        if (match) maxPage = Math.max(maxPage, Number(match[1]));
      });

      const parse = ($doc: cheerio.CheerioAPI) => {
        const candidates = $doc('.xans-product-listnormal li, ul.prdList li');
        recordRawCards(diagnostics, urlDiagnostics, candidates.length);

        candidates.each((_, el) => {
          const $el = $doc(el);
          const raw = ($el.find('.name a, .name span, .prd_name a, .item_name a').first().text() ?? '').trim();
          const name = raw.replace(/^상품명\s*:\s*/, '').trim();

          if (!name) {
            recordSkipped(diagnostics, urlDiagnostics, 'missing_name');
            return;
          }

          const spec = $el.find('.spec, .mun, p.price, .xans-product-listitem-price').first().text() ?? '';
          const priceMatch = spec.match(/판매가\s*:\s*([\d,]+)/);
          const priceText = priceMatch ? priceMatch[1] : ($el.find('.price span, .sale_price').first().text() ?? '');
          const price = parsePrice(priceText);

          if (!price && !/가격문의|문의/.test(spec)) {
            recordSkipped(diagnostics, urlDiagnostics, 'missing_price');
            return;
          }

          const img = $el.find('img').first().attr('src') ?? $el.find('img').first().attr('data-src') ?? null;
          const imageUrl = img ? resolveUrl(baseUrl, img) : null;

          const href = $el.find('a').first().attr('href') ?? '';
          const productUrl = href ? resolveUrl(baseUrl, href) : '';
          if (!productUrl) {
            recordSkipped(diagnostics, urlDiagnostics, 'missing_product_url');
            return;
          }

          const classified = reclassify({
            name,
            category: cat.category,
            subcategory: cat.subcategory,
            sourceUrl: cat.url,
          });

          if (classified.skip) {
            recordSkipped(
              diagnostics,
              urlDiagnostics,
              `rule:${classified.skipReason ?? classified.matchedRuleId ?? 'unknown_skip_rule'}`
            );
            return;
          }

          recordAccepted(diagnostics, urlDiagnostics);

          all.push({
            name,
            price: price ?? 0,
            originalPrice: null,
            imageUrl,
            productUrl,
            category: classified.category,
            subcategory: classified.subcategory,
            shippingFee: null
          });
        });
      };

      parse($);

      for (let page = 2; page <= Math.min(maxPage, 10); page++) {
        try {
          recordPageAttempt(diagnostics, urlDiagnostics);
          const separator = cat.url.includes('?') ? '&' : '?';
          const nextHtml = await fetchPage(`${cat.url}${separator}page=${page}`, encoding);
          recordPageSuccess(diagnostics, urlDiagnostics);
          parse(cheerio.load(nextHtml));
        } catch (err) {
          recordPageError(diagnostics, urlDiagnostics, err);
          console.error(`[scrape] ${cat.url} page=${page}`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      recordPageError(diagnostics, urlDiagnostics, err);
      console.error(`[scrape] ${cat.url}`, err instanceof Error ? err.message : err);
    }
  }

  return { products: all, diagnostics };
}

async function scrapeLegacy(
  shopKey: string,
  baseUrl: string,
  urls: CU[]
): Promise<ScrapeExecutionResult> {
  const all: SP[] = [];
  const diagnostics = createShopDiagnostics(shopKey, urls);

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const cat = urls[urlIndex];
    const urlDiagnostics = diagnostics.byUrl[urlIndex];

    try {
      recordPageAttempt(diagnostics, urlDiagnostics);
      const html = await fetchPage(cat.url, 'euc-kr');
      recordPageSuccess(diagnostics, urlDiagnostics);
      const $ = cheerio.load(html);

      const candidates = $('table.MK_product_list tr, li[id^="anchorBoxId_"], div.item_box, .brand_prd_box li, ul.prdList li, .xans-product-listnormal li');
      recordRawCards(diagnostics, urlDiagnostics, candidates.length);

      candidates.each((_, el) => {
        const $el = $(el);
        const raw = (
          $el.find('a[href*="shopdetail"], a[href*="product_detail"]').first().text() ??
          $el.find('.name a, .prd_name a').first().text() ??
          ''
        ).trim();

        const name = raw.replace(/^상품명\s*:\s*/, '').replace(/\s+/g, ' ').trim();
        if (!name || name.length < 2) {
          recordSkipped(diagnostics, urlDiagnostics, 'missing_or_short_name');
          return;
        }

        const priceMatch = $el.text().match(/([\d,]+)\s*원/);
        const price = priceMatch ? parsePrice(priceMatch[1]) : null;
        if (!price) {
          recordSkipped(diagnostics, urlDiagnostics, 'missing_price');
          return;
        }

        const img = $el.find('img').first().attr('src') ?? null;
        const imageUrl = img ? resolveUrl(baseUrl, img) : null;

        const href = $el.find('a[href*="shopdetail"], a[href*="product_detail"], a').first().attr('href') ?? '';
        const productUrl = href ? resolveUrl(baseUrl, href) : '';
        if (!productUrl) {
          recordSkipped(diagnostics, urlDiagnostics, 'missing_product_url');
          return;
        }

        const classified = reclassify({
          name,
          category: cat.category,
          subcategory: cat.subcategory,
          sourceUrl: cat.url,
        });

        if (classified.skip) {
          recordSkipped(
            diagnostics,
            urlDiagnostics,
            `rule:${classified.skipReason ?? classified.matchedRuleId ?? 'unknown_skip_rule'}`
          );
          return;
        }

        recordAccepted(diagnostics, urlDiagnostics);

        all.push({
          name,
          price,
          originalPrice: null,
          imageUrl,
          productUrl,
          category: classified.category,
          subcategory: classified.subcategory,
          shippingFee: null
        });
      });
    } catch (err) {
      recordPageError(diagnostics, urlDiagnostics, err);
      console.error(`[scrape] ${cat.url}`, err instanceof Error ? err.message : err);
    }
  }

  return { products: all, diagnostics };
}

function reclassify(input: {
  name: string;
  category: CategoryValue;
  subcategory: SubcategoryValue;
  sourceUrl: string;
}): Classification {
  const ctx: ReclassifyContext = {
    name: input.name,
    normalizedName: normalizeName(input.name),
    category: input.category,
    subcategory: input.subcategory,
    sourceUrl: input.sourceUrl,
  };

  const manual = findFirstMatchingRule(MANUAL_RULES, ctx);
  if (manual) return manual;

  const fixedSource = getFixedSourceClassification(ctx.sourceUrl);
  if (fixedSource) {
    const afterGlobal = findFirstMatchingRule(GLOBAL_RULES, { ...ctx, category: fixedSource.category, subcategory: fixedSource.subcategory });
    if (afterGlobal) return afterGlobal;

    const afterFallback = findFirstMatchingRule(FALLBACK_RULES, { ...ctx, category: fixedSource.category, subcategory: fixedSource.subcategory });
    return afterFallback ?? fixedSource;
  }

  const global = findFirstMatchingRule(GLOBAL_RULES, ctx);
  if (global) return global;

  const fallback = findFirstMatchingRule(FALLBACK_RULES, ctx);
  if (fallback) return fallback;

  return { category: input.category, subcategory: input.subcategory };
}

function getFixedSourceClassification(sourceUrl: string): Classification | null {
  const matched = FIXED_SOURCE_RULES.find((rule) => rule.url === sourceUrl);
  if (!matched) return null;
  return { category: matched.category, subcategory: matched.subcategory };
}

function findFirstMatchingRule(rules: RuleDefinition[], ctx: ReclassifyContext): Classification | null {
  for (const rule of rules) {
    if (rule.when(ctx)) {
      const result = typeof rule.result === 'function' ? rule.result(ctx) : rule.result;
      return {
        ...result,
        matchedRuleId: result.matchedRuleId ?? rule.id,
        skipReason: result.skipReason ?? (result.skip ? rule.id : null)
      };
    }
  }
  return null;
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, ' ').trim();
}

function containsHanCharacter(value: string) {
  return /[\u3400-\u9FFF]/.test(value);
}

function guessProtectorSubcategory(name: string): SubcategoryValue {
  if (/턱땀받이/.test(name)) return '턱땀받이';
  if (/손목/.test(name)) return '손목';
  if (/팔꿈치/.test(name)) return '팔꿈치';
  if (/무릎/.test(name)) return '무릎';
  if (/발|족대|덧신|아킬레스/.test(name)) return '발';
  if (/테이프|테이핑/.test(name)) return '테이핑';
  return '기타';
}

function isWeaponStand(name: string) {
  return /좌대|거치대|스탠드/.test(name);
}

function isBokkenLike(name: string) {
  return /목검|목도/.test(name);
}

function isGageomLike(name: string) {
  return /가검/.test(name);
}

function isShinaiContext(ctx: ReclassifyContext) {
  if (ctx.category !== '죽도&목검&가검') return false;
  if (isWeaponStand(ctx.normalizedName)) return false;
  if (isBokkenLike(ctx.normalizedName)) return false;
  if (isGageomLike(ctx.normalizedName)) return false;
  return true;
}

function looksLikeJapaneseShinai(name: string) {
  if (/일제|일본산/.test(name)) return true;
  if (/알죽도/.test(name) && /일제|일본산/.test(name)) return true;
  return JAPANESE_SWORD_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export async function runSingleShopScrape(shopKey: string) {
  const config = SHOP_CONFIG[shopKey];
  if (!config) return { shopKey, error: 'unknown', scraped: 0, saved: 0 };

  const shop = await prisma.kendoShop.findUnique({ where: { key: shopKey } });
  if (!shop) return { shopKey, error: 'not-found', scraped: 0, saved: 0 };

  const urls = config.urls;
  if (!urls.length) {
    return {
      shopKey,
      scraped: 0,
      saved: 0,
      diagnostics: createShopDiagnostics(shopKey, urls)
    };
  }

  const scrapeResult =
    config.scraper === 'cafe24'
      ? await scrapeCafe24(shopKey, shop.baseUrl, urls, config.encoding)
      : await scrapeLegacy(shopKey, shop.baseUrl, urls);

  const products = scrapeResult.products;
  const diagnostics = scrapeResult.diagnostics;

  let saved = 0;
  for (const item of products) {
    try {
      await upsertScrapedProduct(shop.id, item);
      saved++;
    } catch (err) {
      diagnostics.saveErrorCount += 1;
      console.error(`[save] ${item.name}`, err instanceof Error ? err.message : err);
    }
  }

  if (products.length > 0) {
    const activeUrls = Array.from(new Set(products.map((item) => item.productUrl)));

    await prisma.kendoProductPrice.deleteMany({
      where: {
        shopId: shop.id,
        productUrl: { notIn: activeUrls }
      }
    });

    await prisma.kendoProduct.deleteMany({
      where: {
        prices: { none: {} }
      }
    });
  }

  return {
    shopKey,
    scraped: products.length,
    saved,
    diagnostics
  };
}

export async function runFullScrape() {
  const results: Array<{
    shopKey: string;
    scraped?: number;
    saved?: number;
    error?: string;
    diagnostics?: ShopScrapeDiagnostics;
  }> = [];

  for (const shopKey of Object.keys(SHOP_CONFIG)) {
    results.push(await runSingleShopScrape(shopKey));
  }

  await snapshotDailyPrices();
  return results;
}

async function upsertScrapedProduct(shopId: string, item: SP) {
  const slug = genSlug(item.name);

  let product = await prisma.kendoProduct.findUnique({ where: { slug } });

  if (!product) {
    product = await prisma.kendoProduct.create({
      data: {
        name: item.name,
        slug,
        category: item.category,
        subcategory: item.subcategory,
        imageUrl: item.imageUrl,
      }
    });
  } else {
    product = await prisma.kendoProduct.update({
      where: { id: product.id },
      data: {
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        imageUrl: item.imageUrl ?? product.imageUrl,
      }
    });
  }

  await prisma.kendoProductPrice.upsert({
    where: { productId_shopId: { productId: product.id, shopId } },
    update: {
      price: item.price,
      originalPrice: item.originalPrice,
      shippingFee: item.shippingFee,
      productUrl: item.productUrl,
      inStock: true,
      lastScrapedAt: new Date(),
    },
    create: {
      productId: product.id,
      shopId,
      price: item.price,
      originalPrice: item.originalPrice,
      shippingFee: item.shippingFee,
      productUrl: item.productUrl,
      inStock: true,
    }
  });
}

async function snapshotDailyPrices() {
  const today = new Date().toISOString().slice(0, 10);

  for (const product of await prisma.kendoProduct.findMany({ include: { prices: { select: { price: true } } } })) {
    const values = product.prices.map((x: { price: number }) => x.price).filter((x: number) => x > 0);
    if (!values.length) continue;

    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const avgPrice = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);

    await prisma.kendoPriceHistory.upsert({
      where: { productId_dateKey: { productId: product.id, dateKey: today } },
      update: { minPrice, maxPrice, avgPrice },
      create: { productId: product.id, dateKey: today, minPrice, maxPrice, avgPrice }
    });
  }
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^0-9]/g, '');
  if (!cleaned) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveUrl(baseUrl: string, path: string) {
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    return path.startsWith('//') ? `https:${path}` : path;
  }

  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function genSlug(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200) || `product-${Date.now()}`
  );
}
