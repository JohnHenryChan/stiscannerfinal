/** @type {import('tailwindcss').Config} */
module.exports = {
  mode:"jit",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors:{
        "blue": "#0057A4",
        "amber": "oklch(0.852 0.199 91.936)",
        "blue-700":"#005BAB"
      },
    },
  },
  plugins: [],
}

