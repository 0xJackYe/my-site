# Jack Ye - Personal Site

A single-file, zero-dependency personal website with a quiet warm-neutral interface, smooth motion, and original-color photography.

## Sections

- Home: avatar, platform links, and public profile information on a single screen
- Experience: work history on a timeline, also sized to fit one screen
- Projects: bilingual showcases for AItour and RoommateDistributor
- Blog: Markdown essays with reading time, a reading-progress bar, and next-post links
- Solo Trip: Singapore, Osaka, Kyoto, Mount Fuji, and Tokyo photo journals with a full-screen photo viewer

## Features

- Chinese and English interface, cross-faded when switching; Chinese browsers start in Chinese until a language is chosen
- Light and dark themes that follow the system until chosen, with a circular reveal on toggle; article diagrams follow the theme
- Hash-based section navigation with a gliding indicator and staggered page entrances
- Responsive layouts; on phones the navigation moves to a bottom bar that hides while reading
- Photo viewer with zoom-from-thumbnail, keyboard arrows, swipe, and swipe-down to close
- An "On this page" outline for long articles on wide screens
- All motion uses transforms and opacity, and respects `prefers-reduced-motion`
- Light first visit: the first screen paints without waiting for scripts, and travel photos load only once a visitor heads for Travel
- Accessible by keyboard and screen reader: skip link, focus moves to each page's heading, descriptive photo text in both languages
- Share preview card (Open Graph / Twitter) and structured data for search engines

Open `index.html` directly, or serve the folder with any static web server.

For step-by-step publishing instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

Brand SVGs are sourced from [Simple Icons](https://simpleicons.org/); trademarks belong to their respective owners. The [Inter](https://rsms.me/inter/) typeface is self-hosted under the SIL Open Font License (`public/assets/fonts/Inter-LICENSE.txt`).
