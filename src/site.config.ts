/**
 * 站点级配置 —— 站名、导航、自我介绍都在这里
 * 以后接管理端时，「主页编辑」改的就是这个文件
 */

export const site = {
  /** og:site_name 与 RSS 标题 */
  url: 'https://www.yesheng.wiki',
  title: '夜笙的小世界',
  tagline: '一个普通人的自述',

  /** 默认 meta description */
  description: '夜笙的个人博客：技术笔记与随笔。',

  author: '夜笙',

  /** 主导航。加一个新板块，在这里加一行即可 —— 页面文件另建 */
  nav: [
    { href: '/', label: '主页' },
    { href: '/posts/', label: '文章' },
    { href: '/photos/', label: '照片' },
    { href: '/programs/', label: '程序' },
    { href: '/links/', label: '友链' },
  ],
} as const;

/**
 * 主页内容
 * 下面是占位文字，等你换成自己的话。
 * 每个段落是一个字符串，`links` 是段落里可以嵌的链接。
 */
export const home = {
  intro: [
    '这里是夜笙的小世界。写点技术笔记，也写点没什么用但想记下来的事。',
    '如果抵达不了人生的高度，那就尽可能的探索世界的广度吧。',
  ],
  /** 各子页在主页上的导览 */
  sections: [
    {
      href: '/posts/',
      title: '文章',
      desc: '按时间排列的长短文字，可以用标签筛。',
    },
    {
      href: '/photos/',
      title: '照片',
      desc: '随手拍下的东西，按时间倒着排。',
    },
    {
      href: '/programs/',
      title: '程序',
      desc: '做过的小工具与项目。这一页还在搭。',
    },
    {
      href: '/links/',
      title: '友链',
      desc: '常看的博客和网站。',
    },
  ],
} as const;
