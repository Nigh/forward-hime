import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Forward Hime",
  description: "Koishi plugin forward hime",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
	logo: '/logo.png',
    nav: [
      { text: 'HOME', link: '/' },
    ],

    sidebar: [
      {
        text: '导航',
        items: [
		  { text: 'HOME', link: '/' },
          { text: '使用说明', link: '/README' },
          { text: '贡献代码', link: '/contributing' }
        ]
      }
    ],
    outline: {
      level: 'deep',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Nigh/forward-hime' }
    ]
  },
  outDir: './docs',
  base: '/forward-hime/'
})
