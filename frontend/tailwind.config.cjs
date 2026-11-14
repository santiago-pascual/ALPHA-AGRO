module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0c1112",
        panel: "#111819",
        line: "#253033",
        moss: "#a5c99b",
        mint: "#6eb89d",
        sand: "#d1c8b2",
        ember: "#d98e78",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
