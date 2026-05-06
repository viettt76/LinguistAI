/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#0052CC",
        secondary: "#F0F4FF",
        background: "#FFFFFF",
        surface: "#FAFAFA",
      }
    },
  },
  plugins: [],
}
