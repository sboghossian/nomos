/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF8F3",
        ink: "#1A1A1A",
        sub: "#4A4A4A",
        mute: "#7A7A6E",
        rule: "#E8E3D8",
        accent: "#2D5016",
        "accent-soft": "#5A7D3A",
        "accent-bg": "#EEF1E8",
      },
      fontFamily: {
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: {
        prose: "68ch",
        wide: "76rem",
      },
    },
  },
  plugins: [],
};
