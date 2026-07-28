const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-preset-env": {
      features: {
        "nesting-rules": true
      }
    }
  },
};

export default config;
