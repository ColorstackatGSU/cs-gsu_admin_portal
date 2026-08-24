/** @type {import('tailwindcss').Config} */

// The source of truth for the design system is the :root block in src/index.css,
// not this file. What is here exists so the odd Tailwind utility used in a page
// lands on the same values as the CSS custom properties. Kept identical to the
// sponsor portal's config on purpose: the two apps are one visual family.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14110D',
        paper: '#FFFFFF',
        canvas: '#FBF4E4',
        // The loud set. Every one of these is light enough to carry ink-black
        // text, which is the rule that keeps the palette usable.
        neo: {
          yellow: '#FFDD33',
          lime: '#A9F06C',
          mint: '#74EEC2',
          sky: '#8CC9FF',
          pink: '#FF8CC6',
          coral: '#FF7A62',
          orange: '#FFAE3B',
          violet: '#C3A6FF',
        },
        gsu: {
          blue: '#0039A6',
          'blue-dim': '#002a7a',
          'blue-bright': '#1d56c9',
          white: '#FFFFFF',
          red: '#CC0000',
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Archivo Black', 'Space Grotesk', 'ui-sans-serif', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'monospace'],
      },
      // Hard edges and solid offset shadows. No blur radius anywhere.
      borderRadius: {
        none: '0px',
      },
      boxShadow: {
        neo: '3px 3px 0 #14110D',
        'neo-md': '5px 5px 0 #14110D',
        'neo-lg': '8px 8px 0 #14110D',
      },
      maxWidth: {
        container: '1080px',
      },
    },
  },
  plugins: [],
};
