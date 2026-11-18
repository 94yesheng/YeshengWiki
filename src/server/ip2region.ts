/**
 * 离线 IP 归属地与 ISP/云机房识别引擎（兼容 ip2region v2.0 xdb 全内存查询 + 内置中国 34 省级行政区标准化字典）
 *
 * 1. 若服务器存在 `data/ip2region.xdb`（或通过环境变量 `BLOG_IP2REGION_XDB` 指定路径），
 *    启动时一次性加载至内存 Buffer，单次查询耗时约 0.01ms（10 微秒），零磁盘 I/O、零外部网络请求；
 * 2. 提供中国大陆 34 个省级行政区（省/直辖市/自治区/特别行政区）与地级市の中英文/拼音双向标准化，
 *    彻底解决外部接口返回英文省份、简称不一或省市缺失导致无法定位到具体省份的问题；
 * 3. 内置国内外主流云厂商/IDC 机房 ISP 关键词识别器，在访客记录入库前同步拦截机房爬虫流量。
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Ip2RegionResult {
  country: string;
  province: string;
  city: string;
  isp: string;
  raw: string;
  isDatacenter: boolean;
}

const HEADER_INFO_LENGTH = 256;
const VECTOR_INDEX_COLS = 256;
const VECTOR_INDEX_SIZE = 8;
const SEGMENT_INDEX_SIZE = 14;

let xdbBuffer: Buffer | null = null;
let xdbLoadAttempted = false;

/** 自动探测并一次性将 ip2region.xdb 读入内存 Buffer */
function getXdbBuffer(): Buffer | null {
  if (xdbLoadAttempted) return xdbBuffer;
  xdbLoadAttempted = true;

  const candidates = [
    process.env.BLOG_IP2REGION_XDB,
    path.resolve(process.cwd(), 'data/ip2region.xdb'),
    path.resolve(process.cwd(), 'data/ip2region_v4.xdb'),
    path.resolve(process.cwd(), 'db/ip2region.xdb'),
    '/var/www/blog-data/ip2region.xdb',
    '/srv/blog-data/ip2region.xdb',
  ].filter((p): p is string => Boolean(p && p.trim()));

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.size > HEADER_INFO_LENGTH + VECTOR_INDEX_COLS * VECTOR_INDEX_COLS * VECTOR_INDEX_SIZE) {
          xdbBuffer = fs.readFileSync(filePath);
          console.info(`[ip2region] 已加载离线 IP 库至内存 (${(stat.size / 1024 / 1024).toFixed(2)} MB): ${filePath}`);
          return xdbBuffer;
        }
      }
    } catch (err) {
      console.warn(`[ip2region] 读取 ${filePath} 失败:`, err);
    }
  }
  return null;
}

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let val = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    val = ((val << 8) | n) >>> 0;
  }
  return val >>> 0;
}

/**
 * 国内外云厂商、IDC 机房、代理与服务器托管商 ISP/Org/AS 特征词典
 */
const DATACENTER_ISP_RE = new RegExp(
  [
    // 国内主流云厂商与 IDC
    '阿里云', '万网', '腾讯云', '华为云', '火山引擎', '百度智能云', '百度云', '京东云',
    '天翼云', '移动云', '联通云', '金山云', 'UCloud', '优刻得', '青云', 'QingCloud',
    '七牛云', '又拍云', '网宿', '蓝汛', '白山云', '帝联', '世纪互联', '光环新网',
    '数据中心', '机房', '云计算', '云服务', '服务器', 'IDC', '专线', '托管',
    'Aliyun', 'Alibaba', 'Tencent', 'Qcloud', 'Huawei\\s*Cloud', 'Volcengine',
    'ByteDance', 'Baidu', 'JDCloud', 'KSYun', 'Kingsoft', 'Zenlayer',
    // 海外主流云厂商、VPS 与扫描器托管商
    'Amazon', 'AWS', 'Google\\s*Cloud', 'Google\\s*LLC', 'Microsoft', 'Azure',
    'Cloudflare', 'Fastly', 'Akamai', 'DigitalOcean', 'Linode', 'Vultr', 'Choopa',
    'Constant\\s*Company', 'Hetzner', 'OVH', 'Scaleway', 'Online\\s*S\\.A\\.S',
    'Contabo', 'LeaseWeb', 'Psychz', 'QuadraNet', 'Multacom', 'Cogent', 'Hurricane\\s*Electric',
    'FranTech', 'BuyVM', 'RackNerd', 'DMIT', 'Bandwagon', 'IT7\\s*Networks',
    'Hostinger', 'Kamatera', 'Oracle\\s*Cloud', 'IBM\\s*Cloud', 'UpCloud',
    'Server\\s*Mania', 'ServerMania', 'netcup', 'Nocix', 'Hostwinds', 'ColoCrossing',
    'M247', 'Datacamp', 'Tzulo', 'Performive', 'Total\\s*Server', ' Sharktech',
    'Censys', 'Shodan', 'Project\\s*Discovery', 'Rapid7', 'Shadowserver', 'Onyphe',
  ].join('|'),
  'i'
);

export function isDatacenterIspText(text: string | null | undefined): boolean {
  if (!text) return false;
  return DATACENTER_ISP_RE.test(text);
}

/**
 * 中国 34 个省级行政区标准化映射表（含中文简称、全称、英文/拼音及主要城市反推省份）
 */
const CN_PROVINCE_RULES: Array<{
  province: string;
  keywords: RegExp;
}> = [
  { province: '北京市', keywords: /北京|beijing|peking/i },
  { province: '上海市', keywords: /上海|shanghai/i },
  { province: '天津市', keywords: /天津|tianjin/i },
  { province: '重庆市', keywords: /重庆|chongqing/i },
  { province: '广东省', keywords: /广东|guangdong|canton|广州|深圳|东莞|佛山|珠海|中山|惠州|江门|汕头|湛江|肇庆|茂名|揭阳|潮州|清远|韶关|梅州|汕尾|河源|阳江|云浮|guangzhou|shenzhen|dongguan|foshan|zhuhai/i },
  { province: '浙江省', keywords: /浙江|zhejiang|杭州|宁波|温州|嘉兴|湖州|绍兴|金华|义乌|衢州|舟山|台州|丽水|hangzhou|ningbo|wenzhou|jiaxing|shaoxing|jinhua/i },
  { province: '江苏省', keywords: /江苏|jiangsu|南京|苏州|昆山|无锡|常州|徐州|南通|连云港|淮安|盐城|扬州|镇江|泰州|宿迁|nanjing|suzhou|wuxi|changzhou|xuzhou|nantong/i },
  { province: '四川省', keywords: /四川|sichuan|成都|绵阳|自贡|攀枝花|泸州|德阳|广元|遂宁|内江|乐山|南充|眉山|宜宾|广安|达州|雅安|巴中|资阳|阿坝|甘孜|凉山|西昌|chengdu|mianyang/i },
  { province: '湖北省', keywords: /湖北|hubei|武汉|黄石|十堰|宜昌|襄阳|鄂州|荆门|孝感|荆州|黄冈|咸宁|随州|恩施|仙桃|潜江|天门|wuhan|yichang|xiangyang/i },
  { province: '湖南省', keywords: /湖南|hunan|长沙|株洲|湘潭|衡阳|邵阳|岳阳|常德|张家界|益阳|郴州|永州|怀化|娄底|湘西|吉首|changsha|zhuzhou|hengyang/i },
  { province: '福建省', keywords: /福建|fujian|福州|厦门|泉州|漳州|莆田|三明|南平|龙岩|宁德|fuzhou|xiamen|quanzhou|zhangzhou/i },
  { province: '山东省', keywords: /山东|shandong|济南|青岛|淄博|枣庄|东营|烟台|潍坊|济宁|泰安|威海|日照|临沂|德州|聊城|滨州|菏泽|jinan|qingdao|yantai|weifang|linyi/i },
  { province: '河南省', keywords: /河南|henan|郑州|洛阳|开封|平顶山|安阳|鹤壁|新乡|焦作|濮阳|许昌|漯河|三门峡|南阳|商丘|信阳|周口|驻马店|济源|zhengzhou|luoyang|kaifeng/i },
  { province: '河北省', keywords: /河北|hebei|石家庄|唐山|秦皇岛|邯郸|邢台|保定|张家口|承德|沧州|廊坊|衡水|雄安|shijiazhuang|tangshan|baoding|handan|langfang/i },
  { province: '陕西省', keywords: /陕西|shaanxi|shanxi.*xi'?an|西安|铜川|宝鸡|咸阳|渭南|延安|汉中|榆林|安康|商洛|xi'?an|baoji|xianyang/i },
  { province: '安徽省', keywords: /安徽|anhui|合肥|芜湖|蚌埠|淮南|马鞍山|淮北|铜陵|安庆|黄山|滁州|阜阳|宿州|六安|亳州|池州|宣城|hefei|wuhu|bengbu/i },
  { province: '江西省', keywords: /江西|jiangxi|南昌|景德镇|萍乡|九江|新余|鹰潭|赣州|吉安|宜春|抚州|上饶|nanchang|ganzhou|jiujiang/i },
  { province: '辽宁省', keywords: /辽宁|liaoning|沈阳|大连|鞍山|抚顺|本溪|丹东|锦州|营口|阜新|辽阳|盘锦|铁岭|朝阳|葫芦岛|shenyang|dalian|anshan/i },
  { province: '吉林省', keywords: /吉林|jilin|长春|四平|辽源|通化|白山|松原|白城|延边|延吉|changchun/i },
  { province: '黑龙江省', keywords: /黑龙江|heilongjiang|哈尔滨|齐齐哈尔|鸡西|鹤岗|双鸭山|大庆|伊春|佳木斯|七台河|牡丹江|黑河|绥化|大兴安岭|harbin|haerbin|daqing/i },
  { province: '广西', keywords: /广西|guangxi|南宁|柳州|桂林|梧州|北海|防城港|钦州|贵港|玉林|百色|贺州|河池|来宾|崇左|nanning|liuzhou|guilin/i },
  { province: '云南省', keywords: /云南|yunnan|昆明|曲靖|玉溪|保山|昭通|丽江|普洱|临沧|楚雄|红河|蒙自|文山|西双版纳|景洪|大理|德宏|怒江|迪庆|香格里拉|kunming|dali|lijiang/i },
  { province: '贵州省', keywords: /贵州|guizhou|贵阳|六盘水|遵义|安顺|毕节|铜仁|黔西南|兴义|黔东南|凯里|黔南|都匀|guiyang|zunyi/i },
  { province: '山西省', keywords: /山西|shanxi|太原|大同|阳泉|长治|晋城|朔州|晋中|运城|忻州|临汾|吕梁|taiyuan|datong/i },
  { province: '内蒙古', keywords: /内蒙古|inner\s*mongolia|nei\s*menggu|呼和浩特|包头|乌海|赤峰|通辽|鄂尔多斯|呼伦贝尔|海拉尔|巴彦淖尔|乌兰察布|兴安|乌兰浩特|锡林郭勒|锡林浩特|阿拉善|hohhot|baotou|ordos/i },
  { province: '甘肃省', keywords: /甘肃|gansu|兰州|嘉峪关|金昌|白银|天水|武威|张掖|平凉|酒泉|庆阳|定西|陇南|临夏|甘南|lanzhou/i },
  { province: '宁夏', keywords: /宁夏|ningxia|银川|石嘴山|吴忠|固原|中卫|yinchuan/i },
  { province: '青海省', keywords: /青海|qinghai|西宁|海东|海北|黄南|海南州|果洛|玉树|海西|格尔木|xining/i },
  { province: '新疆', keywords: /新疆|xinjiang|乌鲁木齐|克拉玛依|吐鲁番|哈密|昌吉|博尔塔拉|博乐|巴音郭楞|库尔勒|阿克苏|克孜勒苏|喀什|和田|伊犁|伊宁|塔城|阿勒泰|石河子|urumqi/i },
  { province: '西藏', keywords: /西藏|tibet|xizang|拉萨|日喀则|昌都|林芝|山南|那曲|阿里|lhasa/i },
  { province: '海南省', keywords: /海南|hainan|海口|三亚|三沙|儋州|琼海|文昌|万宁|陵水|haikou|sanya/i },
  { province: '中国香港', keywords: /香港|hong\s*kong/i },
  { province: '中国澳门', keywords: /澳门|macau|macao/i },
  { province: '中国台湾', keywords: /台湾|taiwan|台北|新北|桃园|台中|台南|高雄|新竹|基隆|嘉义|花莲|taipei|kaohsiung|taichung/i },
];

/** 从任意中英文归属地文本中提取标准中国省级行政区名称（如 `浙江省`、`广东省`、`北京市`） */
export function extractChinaProvince(text: string | null | undefined): string {
  if (!text) return '';
  for (const rule of CN_PROVINCE_RULES) {
    if (rule.keywords.test(text)) {
      return rule.province;
    }
  }
  return '';
}

/** 标准化运营商短名 */
export function normalizeIspShort(rawIsp: string | null | undefined): string {
  if (!rawIsp) return '';
  const s = rawIsp.trim();
  if (!s || s === '0') return '';
  if (/chinanet|telecom|电信|ctcc/i.test(s)) return '电信';
  if (/unicom|联通|cucc|cncgroup/i.test(s)) return '联通';
  if (/mobile|cmnet|移动|cmcc|铁通|tietong/i.test(s)) return '移动';
  if (/cernet|education|教育网/i.test(s)) return '教育网';
  if (/drpeng|鹏博士|长城宽带/i.test(s)) return '鹏博士';
  if (/广电|cable|cbn/i.test(s)) return '广电';
  if (/cstnet|科技网/i.test(s)) return '科技网';
  return s.slice(0, 20);
}

/**
 * 使用内存中的 ip2region.xdb 二进制数据执行 0.01ms 极速定位查询
 */
export function searchIp2RegionMemory(ip: string): Ip2RegionResult | null {
  const buf = getXdbBuffer();
  if (!buf) return null;

  const ipInt = ipv4ToUint32(ip);
  if (ipInt === null) return null;

  const il0 = (ipInt >>> 24) & 0xff;
  const il1 = (ipInt >>> 16) & 0xff;
  const idx = il0 * VECTOR_INDEX_COLS * VECTOR_INDEX_SIZE + il1 * VECTOR_INDEX_SIZE;
  const vectorOffset = HEADER_INFO_LENGTH + idx;
  if (vectorOffset + 8 > buf.length) return null;

  const sPtr = buf.readUInt32LE(vectorOffset);
  const ePtr = buf.readUInt32LE(vectorOffset + 4);
  if (sPtr === 0 || ePtr === 0 || sPtr > ePtr || ePtr + SEGMENT_INDEX_SIZE > buf.length) {
    return null;
  }

  let l = 0;
  let h = Math.floor((ePtr - sPtr) / SEGMENT_INDEX_SIZE);
  let dataLen = 0;
  let dataPtr = 0;

  while (l <= h) {
    const m = (l + h) >> 1;
    const p = sPtr + m * SEGMENT_INDEX_SIZE;
    const sip = buf.readUInt32LE(p);
    if (ipInt < sip) {
      h = m - 1;
    } else {
      const eip = buf.readUInt32LE(p + 4);
      if (ipInt > eip) {
        l = m + 1;
      } else {
        dataLen = buf.readUInt16LE(p + 8);
        dataPtr = buf.readUInt32LE(p + 10);
        break;
      }
    }
  }

  if (dataLen === 0 || dataPtr === 0 || dataPtr + dataLen > buf.length) {
    return null;
  }

  const raw = buf.subarray(dataPtr, dataPtr + dataLen).toString('utf8');
  // 兼容两种 xdb 行格式：
  //   v2（经典）: 国家|区域|省份|城市|ISP
  //   v4（新版）: 国家|省份|城市|ISP|国家代码    ← 最后一列是两位国家码
  const parts = raw.split('|').map((x) => (x === '0' ? '' : x.trim()));
  const country = parts[0] || '';
  const isV4 = /^[A-Za-z]{2}$/.test(parts[4] || '');
  const rawProv = (isV4 ? parts[1] : parts[2]) || '';
  const rawCity = (isV4 ? parts[2] : parts[3]) || '';
  const rawIsp = (isV4 ? parts[3] : parts[4]) || '';

  const province = extractChinaProvince(`${rawProv} ${rawCity}`) || rawProv;
  const city = rawCity === '内网IP' ? '' : rawCity;
  const isp = normalizeIspShort(rawIsp);
  const isDatacenter = isDatacenterIspText(`${rawIsp} ${rawProv} ${rawCity}`);

  return {
    country,
    province,
    city,
    isp,
    raw,
    isDatacenter,
  };
}
