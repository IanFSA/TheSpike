import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07090d",
        panel: "#10141d",
        line: "#263044",
        signal: "#f7d44a",
        good: "#38d996",
        warn: "#ff7a59",
        cold: "#6aa7ff"
      }
    }
  },
  plugins: []
};

export default config;
