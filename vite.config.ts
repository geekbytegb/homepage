import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase-auth",
              test: /node_modules[\\/]@firebase[\\/]auth/,
              priority: 5,
            },
            {
              name: "firebase-firestore",
              test: /node_modules[\\/]@firebase[\\/]firestore/,
              priority: 5,
            },
            {
              name: "firebase-core",
              test: /node_modules[\\/](@firebase|firebase)[\\/]/,
              priority: 3,
            },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|react-router)[\\/]/,
              priority: 2,
            },
            {
              name: "icons",
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 2,
            },
          ],
        },
      },
    },
  },
});
