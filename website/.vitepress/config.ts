import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ACE-Step DAW',
  description: 'The AI-Powered Digital Audio Workstation',
  head: [
    ['meta', { name: 'theme-color', content: '#7c3aed' }],
    ['meta', { property: 'og:title', content: 'ACE-Step DAW' }],
    ['meta', { property: 'og:description', content: 'The AI-Powered Digital Audio Workstation' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Features', link: '/guide/features' },
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Feature Overview', link: '/guide/features' },
        ],
      },
      {
        text: 'Tracks',
        items: [
          { text: 'Track Types', link: '/guide/tracks' },
          { text: 'Piano Roll', link: '/guide/piano-roll' },
          { text: 'Step Sequencer', link: '/guide/sequencer' },
        ],
      },
      {
        text: 'Production',
        items: [
          { text: 'Effects Chain', link: '/guide/effects' },
          { text: 'Mixer', link: '/guide/mixer' },
          { text: 'Automation', link: '/guide/automation' },
          { text: 'Recording', link: '/guide/recording' },
          { text: 'Loop Browser', link: '/guide/loop-browser' },
        ],
      },
      {
        text: 'AI Generation',
        items: [
          { text: 'AI Music Generation', link: '/guide/ai-generation' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
          { text: 'Roadmap', link: '/roadmap' },
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/nicepkg/acestep-daw' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present ACE-Step DAW Contributors',
    },
    search: {
      provider: 'local',
    },
  },
  appearance: 'dark',
  ignoreDeadLinks: [
    /localhost/,
  ],
})
